import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { loadPreferences } from '@/memory/preference-store';
import { loadDocumentPreferences } from '@/memory/document-preferences';
import type { LearnedRule } from '@/types';
import { buildSystemPrompt } from '@/agents/prompt-agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, profileId, documentId, model, profileType } = body as {
      content: string;
      profileId?: string;
      documentId?: string;
      model?: string;
      profileType?: 'document' | 'audience';
    };

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      );
    }

    // Load preferences
    const store = await loadPreferences();

    // Get base style
    const baseStyle = store.baseStyle;

    // Get audience profile
    const audienceProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
        ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
        : undefined;

    // Get document preferences if available (skip if profileType is 'audience')
    let documentPreferences;
    if (documentId && profileType !== 'audience') {
      documentPreferences = await loadDocumentPreferences(documentId);
    }

    // Build context from profiles
    const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);

    // Build document adjustments context
    let adjustmentContext = '';
    if (documentPreferences) {
      const adj = documentPreferences.adjustments;
      const adjustments: string[] = [];

      if (adj.verbosityAdjust !== 0) {
        adjustments.push(
          `Verbosity: ${adj.verbosityAdjust > 0 ? 'more detailed' : 'more terse'} (${adj.verbosityAdjust})`
        );
      }
      if (adj.formalityAdjust !== 0) {
        adjustments.push(
          `Formality: ${adj.formalityAdjust > 0 ? 'more formal' : 'less formal'} (${adj.formalityAdjust})`
        );
      }
      if (adj.hedgingAdjust !== 0) {
        adjustments.push(
          `Hedging: ${adj.hedgingAdjust > 0 ? 'more cautious' : 'more confident'} (${adj.hedgingAdjust})`
        );
      }
      if (adj.learnedRules.length > 0) {
        adjustments.push('Learned rules:');
        adj.learnedRules.forEach((r: LearnedRule) => adjustments.push(`- ${r.rule}`));
      }

      if (adjustments.length > 0) {
        adjustmentContext = `\n\nDOCUMENT-SPECIFIC ADJUSTMENTS:\n${adjustments.join('\n')}`;
      }
    }

    // Truncate content if too long
    const truncatedContent = content.length > 4000
      ? content.slice(0, 4000) + '\n\n[... truncated ...]'
      : content;

    // Build the analysis prompt
    const prompt = `You are a writing alignment analyzer. Evaluate how well the given text aligns with the user's writing preferences and profiles.

${stylePrompt}${adjustmentContext}

TEXT TO ANALYZE:
${truncatedContent}

Analyze this text and provide a JSON response with this exact structure:
{
  "alignmentScore": <number 0-1 indicating how well the text matches the preferences>,
  "analysis": "<2-3 sentences explaining how the text aligns or doesn't align with the profiles>",
  "suggestions": ["<specific suggestion for improvement>", "<another suggestion if applicable>"]
}

Consider:
1. Does the verbosity level match the preference?
2. Is the formality appropriate for the audience?
3. Is the hedging style (confident vs cautious) correct?
4. Does the tone match the expected style?
5. Is the jargon level appropriate for the audience?

Return ONLY the JSON object, no other text.`;

    // Get the provider and make the LLM call
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a writing alignment analyzer. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 500,
    });

    // Parse the JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        alignmentScore: 0.7,
        analysis: 'Unable to analyze text alignment.',
        suggestions: [],
        profilesUsed: {
          base: `${baseStyle.verbosity} verbosity`,
          audience: audienceProfile?.name,
          document: documentPreferences ? 'yes' : undefined,
        },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      alignmentScore: Math.max(0, Math.min(1, parsed.alignmentScore || 0.7)),
      analysis: parsed.analysis || 'Analysis complete.',
      suggestions: parsed.suggestions || [],
      profilesUsed: {
        base: `${baseStyle.verbosity} verbosity`,
        audience: audienceProfile?.name,
        document: documentPreferences ? 'yes' : undefined,
        mode: profileType === 'audience' ? 'Audience profile only' : 'Full document profile',
      },
    });
  } catch (error) {
    console.error('Alignment analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
