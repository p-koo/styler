/**
 * Consolidate Guidance API
 *
 * Uses LLM to merge multiple guidance items and rules into fewer, clearer directives.
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

    const hasGuidance = guidance && guidance.length >= 2;
    const hasRules = rules && rules.length >= 2;

    if (!hasGuidance && !hasRules) {
      return NextResponse.json(
        { error: 'Need at least 2 guidance items or 2 rules to consolidate' },
        { status: 400 }
      );
    }

    const provider = await createProvider(getDefaultProviderConfig(model));

    let consolidatedGuidance: string[] | undefined;
    let consolidatedRules: string[] | undefined;

    // Consolidate guidance if there are enough items
    if (hasGuidance) {
      const guidancePrompt = `You are helping consolidate a list of writing guidance/constraints into fewer, clearer directives.

Current guidance items:
${guidance.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Your task:
1. Identify overlapping or related guidance items
2. Merge them into fewer, more comprehensive directives
3. Preserve all important constraints - don't lose any meaning
4. Aim for 2-4 consolidated items (unless the originals are truly distinct)
5. Each consolidated item should be clear and actionable

Return ONLY a JSON array of consolidated guidance strings, nothing else.
Example: ["Focus on clarity and practical examples", "Use formal academic tone with minimal jargon"]`;

      const guidanceResult = await provider.complete({
        messages: [{ role: 'user', content: guidancePrompt }],
        maxTokens: 1000,
        temperature: 0.3,
      });

      try {
        let content = guidanceResult.content.trim();
        if (content.startsWith('```')) {
          content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          consolidatedGuidance = parsed.filter(
            item => typeof item === 'string' && item.trim().length > 0
          );
        }
      } catch {
        console.error('Failed to parse guidance consolidation:', guidanceResult.content);
      }
    }

    // Consolidate rules if there are enough items
    if (hasRules) {
      const rulesPrompt = `You are helping consolidate a list of specific writing rules into fewer, stronger directives.

Current rules:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Your task:
1. Identify overlapping or similar rules
2. Merge them into fewer, more comprehensive rules
3. Preserve all important constraints - don't lose any meaning
4. Aim for 2-5 consolidated rules (unless the originals are truly distinct)
5. Use strong, imperative language: "ALWAYS", "NEVER", "DO NOT"
6. Each rule should be specific and actionable

Return ONLY a JSON array of consolidated rule strings, nothing else.
Example: ["NEVER change the core meaning or argument", "Use active voice whenever possible"]`;

      const rulesResult = await provider.complete({
        messages: [{ role: 'user', content: rulesPrompt }],
        maxTokens: 1000,
        temperature: 0.3,
      });

      try {
        let content = rulesResult.content.trim();
        if (content.startsWith('```')) {
          content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          consolidatedRules = parsed.filter(
            item => typeof item === 'string' && item.trim().length > 0
          );
        }
      } catch {
        console.error('Failed to parse rules consolidation:', rulesResult.content);
      }
    }

    return NextResponse.json({
      consolidatedGuidance: consolidatedGuidance || guidance,
      consolidatedRules: consolidatedRules || rules,
      originalGuidanceCount: guidance?.length || 0,
      newGuidanceCount: consolidatedGuidance?.length || guidance?.length || 0,
      originalRulesCount: rules?.length || 0,
      newRulesCount: consolidatedRules?.length || rules?.length || 0,
    });
  } catch (error) {
    console.error('Failed to consolidate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to consolidate' },
      { status: 500 }
    );
  }
}
