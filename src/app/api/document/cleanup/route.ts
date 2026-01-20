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

    const systemPrompt = `You are a document formatting expert. Your task is to clean up and format the given content for readability.

${syntaxInstructions}

FORMATTING RULES:
1. Remove excessive blank lines - use single blank lines to separate logical sections
2. Group related content together (e.g., related package imports, comments with their code)
3. Preserve meaningful structure and indentation
4. Keep comments with the code they describe
5. For preambles/headers, group related settings together
6. Remove trailing whitespace
7. Ensure consistent spacing

CRITICAL:
- Do NOT change the actual content/code - only format whitespace and line breaks
- Do NOT add or remove any commands, text, or functionality
- Do NOT add explanations or comments that weren't there
- Return ONLY the formatted content, nothing else

OUTPUT FORMAT:
Return the cleaned content with logical sections separated by <<<SECTION_BREAK>>>
Each section should be a coherent unit (e.g., preamble setup, package imports, document content, a paragraph, etc.)`;

    const userPrompt = `Clean up and format this ${syntaxMode} content for readability. Split into logical sections.

CONTENT TO FORMAT:
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
- Group related \\usepackage commands together
- Keep \\documentclass and basic setup at the top
- Group custom commands/definitions together
- Keep comments with the commands they explain
- Separate preamble sections logically (packages, formatting, custom commands, title/author)
- After \\begin{document}, split by logical content units (title block, abstract, sections, paragraphs)`;

    case 'markdown':
      return `This is Markdown content.
- Keep headers with their immediate content
- Group related list items
- Keep code blocks intact
- Separate sections by headers`;

    case 'code':
      return `This is code content.
- Keep imports/includes together at the top
- Group related functions/classes
- Keep comments with the code they describe
- Preserve meaningful blank lines between logical units`;

    default:
      return `This is plain text.
- Split into logical paragraphs
- Group related sentences
- Remove excessive blank lines`;
  }
}
