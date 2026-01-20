import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { buildSystemPrompt } from '@/agents/prompt-agent';
import { loadPreferences } from '@/memory/preference-store';
import type { DocumentStructure } from '../analyze/route';

interface DocumentContext {
  title: string;
  existingCells: string[];
  structure?: DocumentStructure;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, profileId, documentContext, insertAfterIndex, model } = body as {
      prompt: string;
      profileId?: string;
      documentContext?: DocumentContext | null;
      insertAfterIndex?: number | null;
      model?: string;
    };

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    }

    // Load preferences and build system prompt
    const store = await loadPreferences();
    const activeProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
      ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
      : undefined;

    const stylePrompt = buildSystemPrompt(store.baseStyle, activeProfile);

    // Build the generation prompt
    const contextParts: string[] = [];

    contextParts.push(stylePrompt);
    contextParts.push('');
    contextParts.push('---');
    contextParts.push('');
    contextParts.push('You are helping write content for a document. Generate well-structured paragraphs following the user\'s style preferences.');
    contextParts.push('');

    // Add existing document context if available
    if (documentContext) {
      contextParts.push('EXISTING DOCUMENT:');
      contextParts.push(`Title: ${documentContext.title}`);

      if (documentContext.structure) {
        contextParts.push(`Type: ${documentContext.structure.documentType}`);
        contextParts.push(`Main argument: ${documentContext.structure.mainArgument}`);

        if (documentContext.structure.sections.length > 0) {
          contextParts.push('');
          contextParts.push('Sections:');
          for (const section of documentContext.structure.sections) {
            contextParts.push(`- ${section.name} (${section.type}): ${section.purpose}`);
          }
        }

        if (documentContext.structure.keyTerms.length > 0) {
          contextParts.push('');
          contextParts.push('Key terms: ' + documentContext.structure.keyTerms.slice(0, 10).join(', '));
        }
      }
      contextParts.push('');

      // Show where content will be inserted
      if (documentContext.existingCells.length > 0) {
        if (insertAfterIndex !== null && insertAfterIndex !== undefined && insertAfterIndex >= 0) {
          // Show context around insertion point
          const start = Math.max(0, insertAfterIndex - 1);
          const end = Math.min(documentContext.existingCells.length, insertAfterIndex + 2);

          contextParts.push('CONTEXT AROUND INSERTION POINT:');
          for (let i = start; i < end; i++) {
            const marker = i === insertAfterIndex ? '[INSERT NEW CONTENT AFTER THIS]' : '';
            contextParts.push(`[Paragraph ${i + 1}]: ${documentContext.existingCells[i]} ${marker}`);
          }
          contextParts.push('');
        } else {
          // Content will be added at the end
          const lastCells = documentContext.existingCells.slice(-2);
          if (lastCells.length > 0) {
            contextParts.push('LAST PARAGRAPHS (new content will follow these):');
            lastCells.forEach((p, i) => {
              const idx = documentContext.existingCells.length - lastCells.length + i;
              contextParts.push(`[Paragraph ${idx + 1}]: ${p}`);
            });
            contextParts.push('');
          }
        }
      }
    } else {
      contextParts.push('This is a NEW DOCUMENT. Structure your content appropriately with clear paragraphs.');
      contextParts.push('');
    }

    contextParts.push('---');
    contextParts.push('');
    contextParts.push('GENERATION REQUEST:');
    contextParts.push(prompt);
    contextParts.push('');
    contextParts.push('Generate the requested content. Return ONLY the paragraphs, separated by blank lines. Do not include titles, headers, or explanatory text unless specifically requested. Do not include numbering or bullet points unless specifically requested.');

    const systemPrompt = contextParts.join('\n');

    // Call LLM
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate the content now.' },
      ],
      temperature: 0.5, // Moderate temperature for creative but coherent generation
    });

    // Clean up the response
    let generatedContent = result.content.trim();

    // Remove common prefixes the LLM might add
    const prefixesToRemove = [
      /^here'?s?\s+(the\s+)?(generated\s+)?(content|text|paragraphs?):?\s*/i,
      /^generated\s+(content|text|paragraphs?):?\s*/i,
      /^the\s+(generated\s+)?(content|text|paragraphs?):?\s*/i,
    ];

    for (const prefix of prefixesToRemove) {
      generatedContent = generatedContent.replace(prefix, '');
    }

    // Try to extract a title suggestion if this is a new document
    let suggestedTitle: string | undefined;
    if (!documentContext) {
      // Look for a title-like first line
      const lines = generatedContent.split('\n');
      const firstLine = lines[0]?.trim();
      if (firstLine && firstLine.length < 100 && !firstLine.endsWith('.')) {
        // Might be a title
        if (firstLine.startsWith('#')) {
          suggestedTitle = firstLine.replace(/^#+\s*/, '');
          generatedContent = lines.slice(1).join('\n').trim();
        }
      }
    }

    return NextResponse.json({
      content: generatedContent,
      suggestedTitle,
    });
  } catch (error) {
    console.error('Content generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
