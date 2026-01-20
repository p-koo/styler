import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { buildSystemPrompt } from '@/agents/prompt-agent';
import { loadPreferences } from '@/memory/preference-store';
import type { DocumentStructure, DocumentSection } from '../analyze/route';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cells, selectedIndices, instruction, profileId, documentStructure, model } = body as {
      cells: string[];
      selectedIndices: number[];
      instruction?: string;
      profileId?: string;
      documentStructure?: DocumentStructure;
      model?: string;
    };

    if (!cells || !selectedIndices || selectedIndices.length < 2) {
      return NextResponse.json(
        { error: 'cells array and at least 2 selectedIndices are required' },
        { status: 400 }
      );
    }

    // Get the selected cells
    const selectedCells = selectedIndices.map((i) => cells[i]).filter(Boolean);
    if (selectedCells.length !== selectedIndices.length) {
      return NextResponse.json(
        { error: 'Invalid cell indices' },
        { status: 400 }
      );
    }

    // Detect if this is an "add" instruction early (for content limiting)
    const instructionLower = (instruction || '').toLowerCase();
    const isAddInstruction = /\b(add|insert|prepend|include|create|write|generate)\s+(an?\s+)?(abstract|introduction|conclusion|section|paragraph|summary|title|header)/i.test(instructionLower);

    // Check total content size - limit for non-add instructions
    const totalContentLength = selectedCells.join(' ').length;
    const MAX_CONTENT_LENGTH = 15000; // ~4000 tokens rough estimate

    console.log(`[Batch Edit API] Selected ${selectedIndices.length} cells, total content: ${totalContentLength} chars, isAdd: ${isAddInstruction}`);

    // For "add" instructions with large content, we'll sample content instead of sending everything
    let cellsToProcess = selectedCells;
    let sampledForAdd = false;

    if (isAddInstruction && totalContentLength > MAX_CONTENT_LENGTH) {
      // For add instructions, sample first few and last few cells to understand the document
      const sampleSize = 3;
      const firstCells = selectedCells.slice(0, sampleSize);
      const lastCells = selectedCells.slice(-sampleSize);
      cellsToProcess = [...new Set([...firstCells, ...lastCells])]; // Dedupe if overlap
      sampledForAdd = true;
      console.log(`[Batch Edit API] Sampling ${cellsToProcess.length} cells for add instruction`);
    } else if (!isAddInstruction && totalContentLength > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Selection is too large (${selectedIndices.length} cells, ${Math.round(totalContentLength/1000)}k chars). Please select fewer cells or use "Selection" scope with a smaller selection.` },
        { status: 400 }
      );
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

    const beforeCells = cells.slice(
      Math.max(0, firstIdx - contextSize),
      firstIdx
    );
    const afterCells = cells.slice(
      lastIdx + 1,
      Math.min(cells.length, lastIdx + 1 + contextSize)
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

    // isAddInstruction was already detected above
    console.log('[Batch Edit API] Instruction:', instruction);
    console.log('[Batch Edit API] Is add instruction:', isAddInstruction);
    console.log('[Batch Edit API] Sampled for add:', sampledForAdd);

    contextParts.push(stylePrompt);
    contextParts.push('');
    contextParts.push('---');
    contextParts.push('');

    if (isAddInstruction && sampledForAdd) {
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
    } else {
      contextParts.push('You are editing MULTIPLE PARAGRAPHS within a larger document. You may:');
      contextParts.push('- Restructure the content for better flow');
      contextParts.push('- Merge cells if they cover the same idea');
      contextParts.push('- Split cells if they contain multiple distinct ideas');
      contextParts.push('- Reorder content within the selected cells');
      contextParts.push('- Improve transitions between cells');
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
      contextParts.push('PRECEDING PARAGRAPHS (for context, do not edit):');
      beforeCells.forEach((p, i) => {
        contextParts.push(`[Paragraph ${firstIdx - beforeCells.length + i + 1}]: ${p}`);
      });
      contextParts.push('');
    }

    if (sampledForAdd) {
      contextParts.push('SAMPLE PARAGRAPHS FROM DOCUMENT (for context to generate new content):');
      cellsToProcess.forEach((p, i) => {
        contextParts.push(`[Sample ${i + 1}]: ${p}`);
      });
    } else {
      contextParts.push('PARAGRAPHS TO EDIT (you may restructure, merge, or split these):');
      selectedCells.forEach((p, i) => {
        contextParts.push(`[Paragraph ${selectedIndices[i] + 1}]: ${p}`);
      });
    }
    contextParts.push('');

    if (afterCells.length > 0) {
      contextParts.push('FOLLOWING PARAGRAPHS (for context, do not edit):');
      afterCells.forEach((p, i) => {
        contextParts.push(`[Paragraph ${lastIdx + 2 + i}]: ${p}`);
      });
      contextParts.push('');
    }

    contextParts.push('---');
    contextParts.push('');
    contextParts.push(`INSTRUCTION: ${instruction || 'Improve and restructure these cells for better flow and clarity.'}`);
    contextParts.push('');

    if (sampledForAdd) {
      // For sampled add, we only want the new content
      contextParts.push('IMPORTANT: Generate ONLY the new content requested (e.g., the abstract and/or title).');
      contextParts.push('Do NOT include the sample paragraphs in your output.');
      contextParts.push('');
      contextParts.push('FORMATTING:');
      contextParts.push('- Return ONLY the new content');
      contextParts.push('- If generating multiple items (e.g., title AND abstract), separate them with: <<<PARAGRAPH_BREAK>>>');
      contextParts.push('- Do NOT include labels like "Title:" or "Abstract:" - just the content itself');
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
    } else {
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
    }

    const systemPrompt = contextParts.join('\n');

    // Call LLM
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Please edit and restructure the cells now.' },
      ],
      temperature: 0.4, // Slightly higher for creative restructuring
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

    // Convert paragraph markers to double newlines for frontend parsing
    editedText = editedText.replace(/<<<PARAGRAPH_BREAK>>>/g, '\n\n');

    // Clean up any excessive whitespace but preserve double newlines
    editedText = editedText
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .join('\n\n');

    return NextResponse.json({
      editedText,
      originalCells: selectedCells,
      selectedIndices,
      isAddOnly: sampledForAdd, // If true, editedText contains only NEW content to prepend
    });
  } catch (error) {
    console.error('Batch edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch edit failed' },
      { status: 500 }
    );
  }
}
