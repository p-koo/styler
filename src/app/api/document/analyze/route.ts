import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

export interface DocumentSection {
  id: string;
  name: string;
  type: 'abstract' | 'introduction' | 'methods' | 'results' | 'discussion' | 'conclusion' | 'references' | 'acknowledgments' | 'other';
  startParagraph: number;
  endParagraph: number;
  purpose: string; // LLM's understanding of what this section does
}

export interface DocumentStructure {
  title: string;
  documentType: 'research-paper' | 'grant-proposal' | 'review' | 'thesis' | 'report' | 'other';
  sections: DocumentSection[];
  keyTerms: string[]; // Important terms/acronyms defined in the document
  mainArgument: string; // One-sentence summary of the document's main point
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paragraphs } = body as { paragraphs: string[] };

    if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
      return NextResponse.json(
        { error: 'paragraphs array is required' },
        { status: 400 }
      );
    }

    // Format paragraphs with indices for the LLM
    const numberedText = paragraphs
      .map((p, i) => `[${i}] ${p.slice(0, 500)}${p.length > 500 ? '...' : ''}`)
      .join('\n\n');

    const prompt = `Analyze this academic document and identify its structure.

DOCUMENT:
${numberedText}

Analyze and return a JSON object with this structure:
{
  "title": "document title (infer from content if not explicit)",
  "documentType": "research-paper" | "grant-proposal" | "review" | "thesis" | "report" | "other",
  "mainArgument": "one sentence summarizing the main point/contribution",
  "keyTerms": ["important terms", "acronyms (with definitions)", "key concepts"],
  "sections": [
    {
      "id": "section-id",
      "name": "Section Name",
      "type": "abstract" | "introduction" | "methods" | "results" | "discussion" | "conclusion" | "references" | "acknowledgments" | "other",
      "startParagraph": 0,
      "endParagraph": 2,
      "purpose": "what this section accomplishes in 1 sentence"
    }
  ]
}

RULES:
- Paragraph indices are shown in [brackets] - use these exact numbers
- startParagraph and endParagraph are inclusive
- Every paragraph must belong to exactly one section
- Common academic sections: Abstract, Introduction, Background, Methods/Materials, Results, Discussion, Conclusion
- For grants: Specific Aims, Significance, Innovation, Approach, etc.
- If no clear sections, group by logical themes
- keyTerms should include acronyms with their expansions (e.g., "ML (Machine Learning)")`;

    const providerConfig = getDefaultProviderConfig();
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        {
          role: 'system',
          content: 'You are a document structure analyzer. Output only valid JSON. Be precise with paragraph indices.'
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    // Parse the JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse document structure');
    }

    const structure: DocumentStructure = JSON.parse(jsonMatch[0]);

    // Validate and fix section boundaries
    const maxParagraph = paragraphs.length - 1;
    structure.sections = structure.sections.map((section, index) => ({
      ...section,
      id: section.id || `section-${index}`,
      startParagraph: Math.max(0, Math.min(section.startParagraph, maxParagraph)),
      endParagraph: Math.max(0, Math.min(section.endParagraph, maxParagraph)),
    }));

    // Ensure sections are sorted and non-overlapping
    structure.sections.sort((a, b) => a.startParagraph - b.startParagraph);

    return NextResponse.json({
      success: true,
      structure,
    });
  } catch (error) {
    console.error('Document analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
