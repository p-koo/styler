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
    const { paragraphs, selectedIndices, instruction, profileId, documentStructure, model } = body as {
      paragraphs: string[];
      selectedIndices: number[];
      instruction?: string;
      profileId?: string;
      documentStructure?: DocumentStructure;
      model?: string;
    };

    if (!paragraphs || !selectedIndices || selectedIndices.length < 2) {
      return NextResponse.json(
        { error: 'paragraphs array and at least 2 selectedIndices are required' },
        { status: 400 }
      );
    }

    // Get the selected paragraphs
    const selectedParagraphs = selectedIndices.map((i) => paragraphs[i]).filter(Boolean);
    if (selectedParagraphs.length !== selectedIndices.length) {
      return NextResponse.json(
        { error: 'Invalid paragraph indices' },
        { status: 400 }
      );
    }

    // Find which sections these paragraphs belong to
    const sections: DocumentSection[] = [];
    if (documentStructure?.sections) {
      for (const idx of selectedIndices) {
        const section = documentStructure.sections.find(
          (s) => idx >= s.startParagraph && idx <= s.endParagraph
        );
        if (section && !sections.find((s) => s.id === section.id)) {
          sections.push(section);
        }
      }
    }

    // Build context from surrounding paragraphs (before first and after last selected)
    const firstIdx = Math.min(...selectedIndices);
    const lastIdx = Math.max(...selectedIndices);
    const contextSize = 2;

    const beforeParagraphs = paragraphs.slice(
      Math.max(0, firstIdx - contextSize),
      firstIdx
    );
    const afterParagraphs = paragraphs.slice(
      lastIdx + 1,
      Math.min(paragraphs.length, lastIdx + 1 + contextSize)
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

    contextParts.push(stylePrompt);
    contextParts.push('');
    contextParts.push('---');
    contextParts.push('');
    contextParts.push('You are editing MULTIPLE PARAGRAPHS within a larger document. You may:');
    contextParts.push('- Restructure the content for better flow');
    contextParts.push('- Merge paragraphs if they cover the same idea');
    contextParts.push('- Split paragraphs if they contain multiple distinct ideas');
    contextParts.push('- Reorder content within the selected paragraphs');
    contextParts.push('- Improve transitions between paragraphs');
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

    if (beforeParagraphs.length > 0) {
      contextParts.push('PRECEDING PARAGRAPHS (for context, do not edit):');
      beforeParagraphs.forEach((p, i) => {
        contextParts.push(`[Paragraph ${firstIdx - beforeParagraphs.length + i + 1}]: ${p}`);
      });
      contextParts.push('');
    }

    contextParts.push('PARAGRAPHS TO EDIT (you may restructure, merge, or split these):');
    selectedParagraphs.forEach((p, i) => {
      contextParts.push(`[Paragraph ${selectedIndices[i] + 1}]: ${p}`);
    });
    contextParts.push('');

    if (afterParagraphs.length > 0) {
      contextParts.push('FOLLOWING PARAGRAPHS (for context, do not edit):');
      afterParagraphs.forEach((p, i) => {
        contextParts.push(`[Paragraph ${lastIdx + 2 + i}]: ${p}`);
      });
      contextParts.push('');
    }

    contextParts.push('---');
    contextParts.push('');
    contextParts.push(`EDIT INSTRUCTION: ${instruction || 'Improve and restructure these paragraphs for better flow and clarity.'}`);
    contextParts.push('');
    contextParts.push('CRITICAL FORMATTING REQUIREMENT:');
    contextParts.push('- Return ONLY the edited text');
    contextParts.push('- You MUST separate each paragraph with the marker: <<<PARAGRAPH_BREAK>>>');
    contextParts.push('- Do NOT include paragraph numbers, explanations, or commentary');
    contextParts.push('- Example output format:');
    contextParts.push('First paragraph text here.');
    contextParts.push('<<<PARAGRAPH_BREAK>>>');
    contextParts.push('Second paragraph text here.');
    contextParts.push('<<<PARAGRAPH_BREAK>>>');
    contextParts.push('Third paragraph text here.');

    const systemPrompt = contextParts.join('\n');

    // Call LLM
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Please edit and restructure the paragraphs now.' },
      ],
      temperature: 0.4, // Slightly higher for creative restructuring
    });

    // Clean up the response
    let editedText = result.content.trim();

    // Remove common prefixes the LLM might add
    const prefixesToRemove = [
      /^here'?s?\s+(the\s+)?edited\s+(paragraphs?|version|text):?\s*/i,
      /^edited\s+(paragraphs?|version|text):?\s*/i,
      /^the\s+edited\s+(paragraphs?|version|text):?\s*/i,
      /^restructured\s+(paragraphs?|version|text):?\s*/i,
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
      originalParagraphs: selectedParagraphs,
      selectedIndices,
    });
  } catch (error) {
    console.error('Batch edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch edit failed' },
      { status: 500 }
    );
  }
}
