/**
 * Consolidate Guidance API
 *
 * Uses LLM to merge multiple guidance items into fewer, clearer directives.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { guidance, rules, model } = await request.json() as {
      guidance: string[];
      rules?: string[];
      model?: string;
    };

    if (!guidance || guidance.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 guidance items to consolidate' },
        { status: 400 }
      );
    }

    const provider = await createProvider(getDefaultProviderConfig(model));

    const prompt = `You are helping consolidate a list of writing guidance/constraints into fewer, clearer directives.

Current guidance items:
${guidance.map((g, i) => `${i + 1}. ${g}`).join('\n')}

${rules && rules.length > 0 ? `Related rules (for context, don't include these):
${rules.map(r => `- ${r}`).join('\n')}` : ''}

Your task:
1. Identify overlapping or related guidance items
2. Merge them into fewer, more comprehensive directives
3. Preserve all important constraints - don't lose any meaning
4. Aim for 2-4 consolidated items (unless the originals are truly distinct)
5. Each consolidated item should be clear and actionable

Return ONLY a JSON array of consolidated guidance strings, nothing else.
Example: ["Focus on clarity and practical examples", "Use formal academic tone with minimal jargon"]`;

    const result = await provider.complete({
      messages: [
        { role: 'user', content: prompt }
      ],
      maxTokens: 1000,
      temperature: 0.3,
    });

    // Parse the JSON response
    let consolidatedGuidance: string[];
    try {
      // Handle potential markdown code blocks
      let content = result.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      consolidatedGuidance = JSON.parse(content);

      if (!Array.isArray(consolidatedGuidance)) {
        throw new Error('Response is not an array');
      }

      // Validate each item is a string
      consolidatedGuidance = consolidatedGuidance.filter(
        item => typeof item === 'string' && item.trim().length > 0
      );

      if (consolidatedGuidance.length === 0) {
        throw new Error('No valid guidance items in response');
      }
    } catch (parseError) {
      console.error('Failed to parse consolidation response:', result.content);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      consolidatedGuidance,
      originalCount: guidance.length,
      newCount: consolidatedGuidance.length,
    });
  } catch (error) {
    console.error('Failed to consolidate guidance:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to consolidate' },
      { status: 500 }
    );
  }
}
