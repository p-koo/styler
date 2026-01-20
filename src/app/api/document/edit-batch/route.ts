import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { buildSystemPrompt } from '@/agents/prompt-agent';
import { loadPreferences } from '@/memory/preference-store';
import type { DocumentStructure, DocumentSection } from '../analyze/route';

type SyntaxMode = 'plain' | 'markdown' | 'latex' | 'code';

// Token estimation (rough: ~4 chars per token for English text)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Context window limits by model family (conservative estimates leaving room for output)
function getContextLimit(model?: string): { inputLimit: number; outputLimit: number } {
  const modelLower = (model || '').toLowerCase();

  // Claude models: 200k context, but we leave room for output
  if (modelLower.includes('claude')) {
    return { inputLimit: 100000, outputLimit: 8000 }; // ~100k input tokens, 8k output
  }

  // GPT-4 models: 128k context
  if (modelLower.includes('gpt-4')) {
    return { inputLimit: 60000, outputLimit: 4000 };
  }

  // GPT-3.5: 16k context
  if (modelLower.includes('gpt-3.5')) {
    return { inputLimit: 12000, outputLimit: 4000 };
  }

  // Ollama/local models: assume conservative 8k context
  return { inputLimit: 6000, outputLimit: 2000 };
}

// Build syntax mode instructions
function getSyntaxInstructions(mode?: SyntaxMode): string {
  switch (mode) {
    case 'latex':
      return `CRITICAL SYNTAX REQUIREMENT - LaTeX:
This document uses LaTeX syntax. You MUST:
- Use proper LaTeX commands and environments (e.g., \\textbf{}, \\emph{}, \\cite{})
- Include BOTH opening AND closing tags for any environment (e.g., \\begin{abstract}...\\end{abstract})
- Use LaTeX math mode for equations: $inline$ or \\[display\\]
- Preserve any existing LaTeX structure and commands
- Do NOT output plain text without LaTeX formatting when LaTeX is expected
- Common environments: abstract, figure, table, equation, itemize, enumerate
- If generating a new section/environment, ALWAYS include the complete \\begin{...} and \\end{...} pair`;
    case 'markdown':
      return `SYNTAX REQUIREMENT - Markdown:
This document uses Markdown syntax. You MUST:
- Use proper Markdown formatting (# headers, **bold**, *italic*, \`code\`)
- Use proper list syntax (- or * for bullets, 1. for numbered)
- Use code blocks with triple backticks when appropriate
- Preserve any existing Markdown structure`;
    case 'code':
      return `SYNTAX REQUIREMENT - Code:
This is a code document. You MUST:
- Preserve proper code syntax and indentation
- Maintain language-specific conventions
- Keep comments in the appropriate format for the language`;
    default:
      return '';
  }
}

// Section-specific editing guidance
const sectionGuidance: Record<DocumentSection['type'], string> = {
  abstract: 'This is the ABSTRACT. Be extremely concise. Every word counts. Lead with significance, summarize key findings with specific results.',
  introduction: 'This is the INTRODUCTION. Establish context, state the problem clearly, and preview the contribution. Build narrative momentum.',
  methods: 'This is the METHODS section. Be precise and reproducible. Use past tense. Include specific details needed for replication.',
  results: 'This is the RESULTS section. Present findings objectively. Use past tense. Let data speak - avoid interpretation here.',
  discussion: 'This is the DISCUSSION. Interpret results, connect to broader literature, acknowledge limitations, suggest implications.',
  conclusion: 'This is the CONCLUSION. Synthesize key points, emphasize significance, suggest future directions. Be concise.',
  references: 'This is the REFERENCES section. Ensure proper formatting consistency.',
  acknowledgments: 'This is the ACKNOWLEDGMENTS section. Be genuine but brief.',
  other: 'Consider the context and purpose of this section when editing.',
};

// Cell with type information
interface CellWithType {
  content: string;
  type?: 'cell' | 'heading';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cells, selectedIndices, instruction, profileId, documentStructure, model, syntaxMode } = body as {
      cells: (string | CellWithType)[];
      selectedIndices: number[];
      instruction?: string;
      profileId?: string;
      documentStructure?: DocumentStructure;
      model?: string;
      syntaxMode?: SyntaxMode;
    };

    // Normalize cells to CellWithType objects
    const normalizedCells: CellWithType[] = cells.map(cell =>
      typeof cell === 'string' ? { content: cell, type: 'cell' as const } : cell
    );

    if (!cells || !selectedIndices || selectedIndices.length < 2) {
      return NextResponse.json(
        { error: 'cells array and at least 2 selectedIndices are required' },
        { status: 400 }
      );
    }

    // Get the selected cells - validate indices are within bounds
    // Note: use explicit undefined check, not filter(Boolean), since empty strings are valid content
    const invalidIndices = selectedIndices.filter(i => i < 0 || i >= normalizedCells.length);
    if (invalidIndices.length > 0) {
      console.error('[Batch Edit API] Invalid indices:', invalidIndices, 'cells.length:', normalizedCells.length);
      return NextResponse.json(
        { error: `Invalid cell indices: ${invalidIndices.join(', ')}. Document has ${normalizedCells.length} cells.` },
        { status: 400 }
      );
    }
    const selectedCells = selectedIndices.map((i) => normalizedCells[i]);

    // Detect if this is an "add/generate" instruction early (for content limiting)
    const instructionLower = (instruction || '').toLowerCase();

    // Pattern 1: "add/generate an abstract" style
    const isSpecificAddInstruction = /\b(add|insert|prepend|include|create|write|generate)\s+(an?\s+)?(abstract|introduction|conclusion|section|paragraph|summary|title|header|methods|results|discussion|background|literature review)/i.test(instructionLower);

    // Pattern 2: "generate the rest", "continue writing", "complete the document" style
    const isContinuationInstruction = /\b(generate|write|create|complete|continue|expand|flesh out|develop|draft|compose)\s+(the\s+)?(rest|remaining|more|additional|further|full|complete|entire|whole|missing)/i.test(instructionLower);

    // Pattern 3: "write a perspective/essay/paper" or "generate content for"
    const isGenerationInstruction = /\b(write|generate|create|draft|compose)\s+(a\s+|an\s+|the\s+|this\s+)?(perspective|essay|paper|article|document|piece|content|body|text|sections?)/i.test(instructionLower);

    // Pattern 4: Explicit keywords suggesting generation over editing
    const hasGenerationKeywords = /\b(from scratch|new content|expand upon|build out|fill in|outline|skeleton)/i.test(instructionLower);

    const isAddInstruction = isSpecificAddInstruction || isContinuationInstruction || isGenerationInstruction || hasGenerationKeywords;

    // Determine the type of generation for better prompting
    const generationType = isContinuationInstruction || isGenerationInstruction ? 'continuation' :
                          isSpecificAddInstruction ? 'specific-section' :
                          hasGenerationKeywords ? 'expansion' : 'edit';

    // Get model-aware context limits
    const { inputLimit, outputLimit } = getContextLimit(model);

    // Estimate token usage
    const contentTokens = estimateTokens(selectedCells.map(c => c.content).join(' '));
    // Reserve tokens for system prompt (~2000), formatting (~500), and safety margin
    const SYSTEM_PROMPT_RESERVE = 3000;
    const availableContentTokens = inputLimit - SYSTEM_PROMPT_RESERVE;

    // Count headings vs regular cells for better prompting
    const headingCount = selectedCells.filter(c => c.type === 'heading').length;
    const hasHeadings = headingCount > 0;

    console.log(`[Batch Edit API] Selected ${selectedIndices.length} cells (${headingCount} headings), ~${contentTokens} tokens, limit: ${availableContentTokens} tokens, generationType: ${generationType}`);

    // For large content, we sample to stay within token limits
    let cellsToProcess = selectedCells;
    let sampledForGeneration = false;

    const isGenerationType = generationType === 'continuation' || generationType === 'expansion';

    if (contentTokens > availableContentTokens) {
      // Sample content to stay within context window
      // Calculate how many cells we can include based on average cell size
      const avgTokensPerCell = contentTokens / selectedCells.length;
      const targetCells = Math.max(6, Math.floor(availableContentTokens / avgTokensPerCell / 2)); // Use half for safety

      const sampleSize = Math.min(Math.ceil(targetCells / 3), isGenerationType ? 5 : 4);
      const midPoint = Math.floor(selectedCells.length / 2);
      const firstCells = selectedCells.slice(0, sampleSize);
      const middleCells = selectedCells.slice(Math.max(0, midPoint - Math.floor(sampleSize/2)), midPoint + Math.ceil(sampleSize/2));
      const lastCells = selectedCells.slice(-sampleSize);

      // Dedupe while preserving order (by content)
      const seen = new Set<string>();
      cellsToProcess = [...firstCells, ...middleCells, ...lastCells].filter(cell => {
        if (seen.has(cell.content)) return false;
        seen.add(cell.content);
        return true;
      });
      sampledForGeneration = true;

      const sampledTokens = estimateTokens(cellsToProcess.map(c => c.content).join(' '));
      console.log(`[Batch Edit API] Sampling ${cellsToProcess.length} cells (~${sampledTokens} tokens) from ${selectedCells.length} total (~${contentTokens} tokens)`);
    }

    // Find which sections these cells belong to
    const sections: DocumentSection[] = [];
    if (documentStructure?.sections) {
      for (const idx of selectedIndices) {
        const section = documentStructure.sections.find(
          (s) => idx >= s.startCell && idx <= s.endCell
        );
        if (section && !sections.find((s) => s.id === section.id)) {
          sections.push(section);
        }
      }
    }

    // Build context from surrounding cells (before first and after last selected)
    const firstIdx = Math.min(...selectedIndices);
    const lastIdx = Math.max(...selectedIndices);
    const contextSize = 2;

    const beforeCells = normalizedCells.slice(
      Math.max(0, firstIdx - contextSize),
      firstIdx
    );
    const afterCells = normalizedCells.slice(
      lastIdx + 1,
      Math.min(normalizedCells.length, lastIdx + 1 + contextSize)
    );

    // Use key terms from structure
    const keyTerms = documentStructure?.keyTerms || [];

    // Load preferences and build system prompt
    const store = await loadPreferences();
    const activeProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
      ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
      : undefined;

    const stylePrompt = buildSystemPrompt(store.baseStyle, activeProfile);

    // Build the context-aware prompt
    const contextParts: string[] = [];

    // Log detection results
    console.log('[Batch Edit API] Instruction:', instruction);
    console.log('[Batch Edit API] Generation type:', generationType);
    console.log('[Batch Edit API] Is add instruction:', isAddInstruction);
    console.log('[Batch Edit API] Sampled for add:', sampledForGeneration);

    // START WITH USER'S INSTRUCTION - this is the PRIMARY directive
    if (instruction && instruction.trim()) {
      contextParts.push('=== PRIMARY INSTRUCTION (MUST FOLLOW) ===');
      contextParts.push('');
      contextParts.push(instruction);
      contextParts.push('');
      contextParts.push('The above instruction is your PRIMARY task. Follow it precisely.');
      contextParts.push('');
      contextParts.push('---');
      contextParts.push('');
    }

    // Style profile comes AFTER - it's for alignment, not the primary task
    contextParts.push('=== STYLE ALIGNMENT (apply after following the instruction) ===');
    contextParts.push('');
    contextParts.push(stylePrompt);
    contextParts.push('');

    // Add syntax mode instructions prominently
    const syntaxInstructions = getSyntaxInstructions(syntaxMode);
    if (syntaxInstructions) {
      contextParts.push('---');
      contextParts.push('');
      contextParts.push(syntaxInstructions);
      contextParts.push('');
    }

    contextParts.push('---');
    contextParts.push('');

    if ((generationType === 'continuation' || generationType === 'expansion') && sampledForGeneration) {
      // Large document - we've sampled content for context, generate new content only
      contextParts.push('You are GENERATING NEW CONTENT to continue this document.');
      contextParts.push('Below are SAMPLE paragraphs from the existing document to show you the topic, style, and direction.');
      contextParts.push('');
      contextParts.push('CRITICAL INSTRUCTIONS:');
      contextParts.push('1. Use the sample content to understand the document\'s topic, argument, and writing style');
      contextParts.push('2. Generate ONLY NEW content that would continue/complete the document');
      contextParts.push('3. Do NOT repeat or include the sample paragraphs in your output');
      contextParts.push('4. For a perspective/opinion piece: write body paragraphs with arguments, evidence, and analysis');
      contextParts.push('5. For a research paper: write methods, results, discussion, or conclusion as appropriate');
      contextParts.push('6. Generate substantial content - at least 4-6 new paragraphs');
      contextParts.push('7. Match the tone, style, and depth of the existing content');
      contextParts.push('');
      contextParts.push('OUTPUT: Return ONLY the new generated content (not the sample paragraphs).');
    } else if (generationType === 'continuation' || generationType === 'expansion') {
      // Smaller document - include existing and add new
      contextParts.push('You are GENERATING NEW CONTENT to continue/expand this document.');
      contextParts.push('The user has provided existing content as context. Your job is to WRITE NEW SECTIONS.');
      contextParts.push('');
      contextParts.push('CRITICAL INSTRUCTIONS:');
      contextParts.push('1. Use the existing content as CONTEXT to understand the document\'s topic, style, and direction');
      contextParts.push('2. GENERATE substantial new content that continues the document logically');
      contextParts.push('3. For a perspective/opinion piece: write body paragraphs with arguments, evidence, and analysis');
      contextParts.push('4. For a research paper: write methods, results, discussion as appropriate');
      contextParts.push('5. Include the existing content in your output, then ADD the new generated sections after it');
      contextParts.push('6. The new content should be substantial - multiple paragraphs developing the ideas');
      contextParts.push('7. Match the tone, style, and depth of the existing content');
      contextParts.push('');
      contextParts.push('OUTPUT STRUCTURE:');
      contextParts.push('- First, include the existing paragraphs (may be lightly polished)');
      contextParts.push('- Then, add NEW substantial content that continues the document');
      contextParts.push('- Generate at least 3-5 new paragraphs unless the instruction specifies otherwise');
    } else if (isAddInstruction && sampledForGeneration) {
      // For large documents, we're only generating new content based on a sample
      contextParts.push('You are GENERATING NEW CONTENT (like an abstract or title) for a document.');
      contextParts.push('Based on the sample paragraphs below, create the requested content.');
      contextParts.push('- Generate ONLY the new content (abstract, title, etc.)');
      contextParts.push('- Do NOT include or repeat the existing paragraphs');
      contextParts.push('- Base your generation on the document context and sample content provided');
    } else if (isAddInstruction) {
      contextParts.push('You are ADDING NEW CONTENT to an existing document.');
      contextParts.push('IMPORTANT: You MUST preserve ALL existing paragraphs and ADD the new content.');
      contextParts.push('- Keep all existing paragraphs intact');
      contextParts.push('- Add the requested new content in the appropriate position');
      contextParts.push('- For abstracts/introductions: add at the BEGINNING');
      contextParts.push('- For conclusions/summaries: add at the END');
      contextParts.push('- Do NOT delete, remove, or significantly alter existing content');
    } else if (sampledForGeneration) {
      // Large document edit - we've sampled content
      contextParts.push('You are editing a LARGE DOCUMENT. Due to size constraints, you are seeing a SAMPLE of the paragraphs.');
      contextParts.push('');
      contextParts.push('INSTRUCTIONS:');
      contextParts.push('1. Apply the requested edits to each sample paragraph');
      contextParts.push('2. Maintain consistency in style and tone across all edits');
      contextParts.push('3. Return the edited versions of the sample paragraphs');
      contextParts.push('4. The edits will be applied as a guide for the full document');
    } else {
      contextParts.push('You are editing MULTIPLE CELLS within a larger document.');
      contextParts.push('');
      contextParts.push('IMPORTANT STRUCTURE RULES:');
      if (hasHeadings) {
        contextParts.push('- This selection includes HEADINGS (marked with [HEADING]). Preserve them as single-line titles.');
        contextParts.push('- Do NOT merge headings with body content or duplicate headings.');
        contextParts.push('- Each heading should remain a separate cell in the output.');
      }
      contextParts.push('- Keep the same NUMBER of output cells unless merging/splitting is clearly beneficial');
      contextParts.push('- Preserve the logical document structure (title -> sections -> body)');
      contextParts.push('- Do NOT create duplicate titles or section headers');
      contextParts.push('');
      contextParts.push('You may:');
      contextParts.push('- Improve clarity and flow within each cell');
      contextParts.push('- Improve transitions between cells');
      contextParts.push('- Merge BODY cells (not headings) if they cover the same idea');
      contextParts.push('- Split cells if they contain multiple distinct ideas');
    }
    contextParts.push('');

    // Add document-level context if available
    if (documentStructure) {
      contextParts.push('DOCUMENT CONTEXT:');
      contextParts.push(`Title: ${documentStructure.title}`);
      contextParts.push(`Type: ${documentStructure.documentType}`);
      contextParts.push(`Main argument: ${documentStructure.mainArgument}`);
      contextParts.push('');
    }

    // Add section-specific guidance
    if (sections.length > 0) {
      contextParts.push('SECTIONS COVERED:');
      for (const section of sections) {
        contextParts.push(`- ${section.name} (${section.type}): ${section.purpose}`);
        contextParts.push(`  Guidance: ${sectionGuidance[section.type]}`);
      }
      contextParts.push('');
    }

    if (keyTerms.length > 0) {
      contextParts.push('KEY TERMS IN THIS DOCUMENT:');
      keyTerms.forEach((t) => contextParts.push(`- ${t}`));
      contextParts.push('');
    }

    if (beforeCells.length > 0) {
      contextParts.push('PRECEDING CONTENT (for context, do not edit):');
      beforeCells.forEach((cell, i) => {
        const typeLabel = cell.type === 'heading' ? '[HEADING]' : '[BODY]';
        contextParts.push(`${typeLabel} ${cell.content}`);
      });
      contextParts.push('');
    }

    if (sampledForGeneration) {
      contextParts.push('SAMPLE CONTENT FROM DOCUMENT (for context to generate new content):');
      cellsToProcess.forEach((cell, i) => {
        const typeLabel = cell.type === 'heading' ? '[HEADING]' : '[BODY]';
        contextParts.push(`[Sample ${i + 1}] ${typeLabel}: ${cell.content}`);
      });
    } else {
      contextParts.push('CELLS TO EDIT:');
      selectedCells.forEach((cell, i) => {
        const typeLabel = cell.type === 'heading' ? '[HEADING]' : '[BODY]';
        contextParts.push(`[Cell ${selectedIndices[i] + 1}] ${typeLabel}: ${cell.content}`);
      });
    }
    contextParts.push('');

    if (afterCells.length > 0) {
      contextParts.push('FOLLOWING CONTENT (for context, do not edit):');
      afterCells.forEach((cell, i) => {
        const typeLabel = cell.type === 'heading' ? '[HEADING]' : '[BODY]';
        contextParts.push(`${typeLabel} ${cell.content}`);
      });
      contextParts.push('');
    }

    contextParts.push('---');
    contextParts.push('');
    // Reminder of the primary instruction
    if (instruction && instruction.trim()) {
      contextParts.push(`REMINDER - Your PRIMARY task: ${instruction}`);
    } else {
      contextParts.push('TASK: Improve and restructure these cells for better flow and clarity.');
    }
    contextParts.push('');

    if ((generationType === 'continuation' || generationType === 'expansion') && sampledForGeneration) {
      // Sampled generation - only return new content
      contextParts.push('REMINDER: Generate ONLY NEW CONTENT to continue this document.');
      contextParts.push('Do NOT include the sample paragraphs in your output - they are just for context.');
      contextParts.push('');
      contextParts.push('The new content should:');
      contextParts.push('- Continue the document logically from where it leaves off');
      contextParts.push('- Develop the main argument or theme');
      contextParts.push('- Add supporting points, evidence, or analysis');
      contextParts.push('- Be substantial (at least 4-6 new paragraphs)');
      contextParts.push('');
      contextParts.push('CRITICAL FORMATTING REQUIREMENT:');
      contextParts.push('- Return ONLY the NEW text content (no meta-commentary)');
      contextParts.push('- Separate each paragraph with: <<<PARAGRAPH_BREAK>>>');
      contextParts.push('- Do NOT include labels like "New paragraph:" or "Continuation:"');
      if (syntaxMode === 'latex') {
        contextParts.push('');
        contextParts.push('REMINDER: Output must be valid LaTeX with complete environment tags.');
      }
    } else if (generationType === 'continuation' || generationType === 'expansion') {
      // Full document generation - include existing and add new
      contextParts.push('REMINDER: You are GENERATING NEW CONTENT to continue this document.');
      contextParts.push('Your output MUST include:');
      contextParts.push('1. The existing paragraphs (lightly polished if needed)');
      contextParts.push('2. SUBSTANTIAL NEW CONTENT - multiple new paragraphs that continue the document');
      contextParts.push('');
      contextParts.push('The new content should:');
      contextParts.push('- Develop the main argument or theme');
      contextParts.push('- Add supporting points, evidence, or analysis');
      contextParts.push('- Be substantial (at least 3-5 new paragraphs)');
      contextParts.push('- Flow naturally from the existing content');
      contextParts.push('');
      contextParts.push('CRITICAL FORMATTING REQUIREMENT:');
      contextParts.push('- Return ONLY the text content (no meta-commentary)');
      contextParts.push('- Separate each paragraph with: <<<PARAGRAPH_BREAK>>>');
      contextParts.push('- Do NOT include labels like "New paragraph:" or section headers unless part of the actual content');
      if (syntaxMode === 'latex') {
        contextParts.push('');
        contextParts.push('REMINDER: Output must be valid LaTeX with complete environment tags.');
      }
    } else if (sampledForGeneration) {
      // For sampled add, we only want the new content
      contextParts.push('IMPORTANT: Generate ONLY the new content requested (e.g., the abstract and/or title).');
      contextParts.push('Do NOT include the sample paragraphs in your output.');
      contextParts.push('');
      contextParts.push('FORMATTING:');
      contextParts.push('- Return ONLY the new content');
      contextParts.push('- If generating multiple items (e.g., title AND abstract), separate them with: <<<PARAGRAPH_BREAK>>>');
      contextParts.push('- Do NOT include labels like "Title:" or "Abstract:" - just the content itself');
      if (syntaxMode === 'latex') {
        contextParts.push('');
        contextParts.push('REMINDER: Output must be valid LaTeX. For abstracts use \\begin{abstract}...\\end{abstract}.');
      }
    } else if (isAddInstruction) {
      contextParts.push('REMINDER: You are ADDING content. Your output MUST include:');
      contextParts.push('1. The NEW content you are adding (abstract, introduction, etc.)');
      contextParts.push('2. ALL of the original paragraphs (possibly with minor improvements)');
      contextParts.push('Do NOT omit any existing paragraphs!');
      contextParts.push('');
      contextParts.push('CRITICAL FORMATTING REQUIREMENT:');
      contextParts.push('- Return ONLY the text content');
      contextParts.push('- You MUST separate each paragraph with the marker: <<<PARAGRAPH_BREAK>>>');
      contextParts.push('- Do NOT include paragraph numbers, explanations, or commentary');
      contextParts.push('- Example output format:');
      contextParts.push('First paragraph text here.');
      contextParts.push('<<<PARAGRAPH_BREAK>>>');
      contextParts.push('Second paragraph text here.');
      contextParts.push('<<<PARAGRAPH_BREAK>>>');
      contextParts.push('Third paragraph text here.');
      if (syntaxMode === 'latex') {
        contextParts.push('');
        contextParts.push('REMINDER: Output must be valid LaTeX with complete environment tags.');
      }
    } else {
      contextParts.push('CRITICAL FORMATTING REQUIREMENT:');
      contextParts.push('- Return ONLY the text content');
      contextParts.push('- You MUST separate each cell with the marker: <<<CELL_BREAK>>>');
      if (hasHeadings) {
        contextParts.push('- For HEADINGS, prefix the line with <<<HEADING>>> (headings should be single-line titles)');
        contextParts.push('- For BODY cells, just output the text (no prefix needed)');
        contextParts.push('- IMPORTANT: Preserve the same number and position of headings');
      }
      contextParts.push('- Do NOT include cell numbers, explanations, or commentary');
      contextParts.push('');
      if (hasHeadings) {
        contextParts.push('Example output format (with headings):');
        contextParts.push('<<<HEADING>>>My Title Here');
        contextParts.push('<<<CELL_BREAK>>>');
        contextParts.push('First body paragraph text here.');
        contextParts.push('<<<CELL_BREAK>>>');
        contextParts.push('Second body paragraph text here.');
      } else {
        contextParts.push('Example output format:');
        contextParts.push('First paragraph text here.');
        contextParts.push('<<<CELL_BREAK>>>');
        contextParts.push('Second paragraph text here.');
        contextParts.push('<<<CELL_BREAK>>>');
        contextParts.push('Third paragraph text here.');
      }
      if (syntaxMode === 'latex') {
        contextParts.push('');
        contextParts.push('REMINDER: Preserve all LaTeX syntax and formatting.');
      }
    }

    const systemPrompt = contextParts.join('\n');

    // Call LLM
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    // Adjust parameters based on task type
    const isGenerating = generationType === 'continuation' || generationType === 'expansion';
    const userMessage = isGenerating
      ? 'Please generate the continuation of this document now. Include the existing content and add substantial new sections.'
      : 'Please edit and restructure the cells now.';

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      maxTokens: isGenerating ? outputLimit : Math.min(outputLimit, 4000), // Use model-aware limit
      temperature: isGenerating ? 0.7 : 0.4, // Higher creativity for generation
    });

    // Clean up the response
    let editedText = result.content.trim();

    console.log('[Batch Edit API] Raw LLM response length:', result.content?.length);
    console.log('[Batch Edit API] Raw LLM response preview:', result.content?.slice(0, 500));

    // Remove common prefixes the LLM might add
    const prefixesToRemove = [
      /^here'?s?\s+(the\s+)?edited\s+(cells?|version|text):?\s*/i,
      /^edited\s+(cells?|version|text):?\s*/i,
      /^the\s+edited\s+(cells?|version|text):?\s*/i,
      /^restructured\s+(cells?|version|text):?\s*/i,
    ];

    for (const prefix of prefixesToRemove) {
      editedText = editedText.replace(prefix, '');
    }

    // Remove surrounding quotes if present
    if ((editedText.startsWith('"') && editedText.endsWith('"')) ||
        (editedText.startsWith("'") && editedText.endsWith("'"))) {
      editedText = editedText.slice(1, -1);
    }

    // Convert markers to standard format (support both old and new markers)
    editedText = editedText.replace(/<<<PARAGRAPH_BREAK>>>/g, '<<<CELL_BREAK>>>');

    // Parse into structured cells with type information
    const rawCells = editedText.split('<<<CELL_BREAK>>>');
    const parsedCells: CellWithType[] = [];

    for (const cellText of rawCells) {
      const trimmed = cellText.trim();
      if (!trimmed) continue;

      // Check for heading marker
      if (trimmed.startsWith('<<<HEADING>>>')) {
        parsedCells.push({
          content: trimmed.replace('<<<HEADING>>>', '').trim(),
          type: 'heading',
        });
      } else {
        parsedCells.push({
          content: trimmed,
          type: 'cell',
        });
      }
    }

    // Also create backward-compatible editedText (joined with double newlines)
    const editedTextCompat = parsedCells.map(c => c.content).join('\n\n');

    // Determine if this is new content that should be appended (continuation) vs prepended (add intro/abstract)
    const isContinuation = generationType === 'continuation' || generationType === 'expansion';

    return NextResponse.json({
      editedText: editedTextCompat,
      editedCells: parsedCells, // New structured output with type info
      originalCells: selectedCells.map(c => c.content), // Keep backward compat as strings
      selectedIndices,
      isAddOnly: sampledForGeneration, // If true, editedText contains only NEW content
      appendToEnd: sampledForGeneration && isContinuation, // If true, append to end instead of prepend
      generationType, // Let frontend know what type of generation this was
      hasHeadings, // Let frontend know if we expect headings in the output
    });
  } catch (error) {
    console.error('Batch edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch edit failed' },
      { status: 500 }
    );
  }
}
