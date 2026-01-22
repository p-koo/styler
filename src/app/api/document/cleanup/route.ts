import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

type SyntaxMode = 'plain' | 'markdown' | 'latex' | 'code';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, syntaxMode, model } = body as {
      content: string;
      syntaxMode: SyntaxMode;
      model?: string;
    };

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const config = getDefaultProviderConfig(model);
    const provider = await createProvider(config);

    const syntaxInstructions = getSyntaxInstructions(syntaxMode);

    const systemPrompt = `You are a document prettifier. Your task is to clean up messy content (often from PDF imports) and make it human-readable.

${syntaxInstructions}

PRETTIFY RULES:
1. MERGE sentences that belong together into proper paragraphs - if consecutive lines are part of the same thought, combine them
2. REMOVE page numbers, line numbers, and other PDF artifacts (e.g., "1", "2", "Page 3", "[1]" at line starts)
3. REMOVE random characters, symbols, or garbled text that don't make sense
4. REMOVE comments, annotations, or editorial marks that aren't part of the main content
5. REMOVE excessive whitespace, blank lines, and trailing spaces
6. FIX broken words that were split across lines (e.g., "docu-\\nment" → "document")
7. PRESERVE meaningful paragraph breaks between different topics/sections
8. PRESERVE headings and structure markers

GOAL: Make the content clean, readable prose that a human would want to read. Remove anything that looks like noise or artifacts.

OUTPUT FORMAT:
Return the prettified content with logical paragraphs/sections separated by <<<SECTION_BREAK>>>
Each section should be a coherent paragraph or logical unit.`;

    const userPrompt = `Prettify this ${syntaxMode} content. Merge fragmented sentences into paragraphs, remove artifacts/noise, make it clean and readable.

CONTENT TO PRETTIFY:
${content}`;

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 8000,
      temperature: 0.1,
    });

    // Split by section breaks
    const sections = result.content
      .split('<<<SECTION_BREAK>>>')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    return NextResponse.json({
      sections,
      originalContent: content,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clean up content' },
      { status: 500 }
    );
  }
}

function getSyntaxInstructions(mode: SyntaxMode): string {
  switch (mode) {
    case 'latex':
      return `This is LaTeX content.
- Remove PDF artifacts (page numbers, line numbers)
- Merge fragmented LaTeX commands that were split across lines
- Remove comments (lines starting with %)
- GROUP all \\usepackage commands together compactly (no blank lines between them)
- Keep \\documentclass at the very top, followed by grouped packages
- Keep the LaTeX structure intact but clean up noise
- Split by logical units: preamble (as one compact section), then content sections/paragraphs`;

    case 'markdown':
      return `This is Markdown content.
- Remove PDF artifacts and noise
- Merge sentences that were incorrectly split across lines
- Preserve markdown formatting (headers, lists, code blocks)
- Split by logical sections (headers, paragraphs)`;

    case 'code':
      return `This is code content.
- Remove line numbers if present
- Keep the code structure intact
- Remove unnecessary comments
- Split by logical units (functions, classes, blocks)`;

    default:
      return `This is plain text (likely from a PDF import).
- Merge sentences/lines that belong in the same paragraph
- Remove page numbers, line numbers, and other artifacts
- Remove random symbols or garbled characters
- Create clean, flowing paragraphs
- Split into logical paragraph units`;
  }
}
