import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

interface FeedbackItem {
  type: 'strength' | 'improvement' | 'suggestion' | 'warning';
  category: 'clarity' | 'structure' | 'flow' | 'tone' | 'consistency' | 'content' | 'grammar';
  title: string;
  description: string;
  location?: {
    paragraphIndices: number[];
    excerpt?: string;
  };
  priority: 'high' | 'medium' | 'low';
}

export interface ReviewResponse {
  summary: string;
  overallScore: number;
  items: FeedbackItem[];
  actionItems: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      paragraphs,        // Full document paragraphs
      selectedIndices,   // Optional: specific paragraphs to analyze
      documentStructure, // Optional: document structure info
      focusAreas,        // Optional: specific aspects to focus on
      goals,             // Optional: user's goals for the document/section
      model,
    } = body;

    if (!paragraphs || !Array.isArray(paragraphs) || paragraphs.length === 0) {
      return NextResponse.json(
        { error: 'paragraphs array is required' },
        { status: 400 }
      );
    }

    // Determine scope
    const isSection = selectedIndices && selectedIndices.length > 0 && selectedIndices.length < paragraphs.length;
    const indicesToAnalyze = isSection
      ? selectedIndices
      : paragraphs.map((_: unknown, i: number) => i);

    // Format full document for context
    const fullDocumentContext = paragraphs
      .map((p: string, i: number) => `[${i}] ${p}`)
      .join('\n\n');

    // Format section if applicable
    const sectionText = isSection
      ? indicesToAnalyze.map((i: number) => `[${i}] ${paragraphs[i]}`).join('\n\n')
      : fullDocumentContext;

    // Build the prompt
    const prompt = `You are an expert writing coach providing constructive, high-level feedback on ${isSection ? 'a section of' : ''} an academic/professional document.

${isSection ? `FULL DOCUMENT CONTEXT (for understanding how this section fits):
${fullDocumentContext.slice(0, 4000)}${fullDocumentContext.length > 4000 ? '\n...[truncated]' : ''}

SECTION TO REVIEW (paragraphs ${indicesToAnalyze.join(', ')}):
${sectionText}` : `DOCUMENT TO REVIEW:
${fullDocumentContext}`}

${documentStructure ? `DOCUMENT INFO:
- Type: ${documentStructure.documentType || 'unknown'}
- Title: ${documentStructure.title || 'untitled'}
- Main argument: ${documentStructure.mainArgument || 'not specified'}
- Key terms: ${documentStructure.keyTerms?.join(', ') || 'none identified'}` : ''}

${goals ? `USER'S GOALS: ${goals}

Please evaluate the writing specifically in relation to these goals. Prioritize feedback that helps achieve them.` : ''}

${focusAreas && focusAreas.length > 0 ? `FOCUS AREAS REQUESTED: ${focusAreas.join(', ')}` : ''}

Provide comprehensive, actionable feedback as JSON:
{
  "summary": "2-3 sentence overall assessment - what's working and main area for improvement",
  "overallScore": <0-100 quality score based on clarity, structure, and effectiveness>,
  "items": [
    {
      "type": "strength" | "improvement" | "suggestion" | "warning",
      "category": "clarity" | "structure" | "flow" | "tone" | "consistency" | "content" | "grammar",
      "title": "Brief descriptive title (5-8 words)",
      "description": "Detailed explanation with specific, actionable advice. Be concrete about what to change and why.",
      "location": {
        "paragraphIndices": [<affected paragraph numbers from the brackets>],
        "excerpt": "brief relevant quote if helpful"
      },
      "priority": "high" | "medium" | "low"
    }
  ],
  "actionItems": [
    "Most important improvement to make first",
    "Second priority action",
    "Third priority action"
  ]
}

FEEDBACK GUIDELINES:
- Start with 2-3 genuine STRENGTHS to acknowledge what's working well
- Include 4-8 IMPROVEMENT suggestions, prioritized by impact
- Be SPECIFIC: reference exact paragraph numbers and quote problematic text
- Be CONSTRUCTIVE: explain WHY something should change and HOW to fix it
- For sections: evaluate how well the section serves its purpose within the document
- Consider: clarity, logical flow, argument strength, transitions, tone consistency
- Action items should be concrete and ordered by priority
- High priority = significantly impacts reader comprehension or argument effectiveness`;

    const providerConfig = model
      ? { ...getDefaultProviderConfig(), model }
      : getDefaultProviderConfig();
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        {
          role: 'system',
          content: 'You are an expert writing coach and editor. Provide detailed, constructive feedback in valid JSON format. Be specific, actionable, and encouraging.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    // Parse the JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse review feedback');
    }

    const review: ReviewResponse = JSON.parse(jsonMatch[0]);

    // Validate and ensure proper structure
    review.items = (review.items || []).map(item => ({
      ...item,
      type: item.type || 'suggestion',
      category: item.category || 'content',
      priority: item.priority || 'medium',
    }));

    review.overallScore = Math.max(0, Math.min(100, review.overallScore || 70));
    review.actionItems = review.actionItems || [];

    return NextResponse.json({
      success: true,
      review,
      scope: isSection ? 'section' : 'document',
      analyzedParagraphs: indicesToAnalyze,
    });
  } catch (error) {
    console.error('Review generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate review' },
      { status: 500 }
    );
  }
}
