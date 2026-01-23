/**
 * Critique Agent
 *
 * Evaluates suggested edits against user preferences. Runs during the
 * edit-critique-refine loop where latency matters (user is waiting).
 *
 * Separated from Learning Agent for different performance requirements:
 * - Critique: Fast evaluation during edit loop (user waiting)
 * - Learning: Thorough analysis after decision (user not waiting)
 */

import type {
  BaseStyle,
  AudienceProfile,
  DocumentPreferences,
  DocumentAdjustments,
  CritiqueAnalysis,
  EditDecision,
  LearnedRule,
} from '@/types';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { buildSystemPrompt } from './prompt-agent';

// Default adjustments for new documents
export const DEFAULT_ADJUSTMENTS: DocumentAdjustments = {
  verbosityAdjust: 0,
  formalityAdjust: 0,
  hedgingAdjust: 0,
  styleUserModified: undefined, // Not user-modified by default - can be set by constraints
  additionalAvoidWords: [],
  additionalPreferWords: {},
  additionalFramingGuidance: [],
  learnedRules: [],
  editExamples: [],
  diffPatterns: [],
  documentGoals: undefined,
  documentConstraints: undefined,
  genAlphaMode: undefined,
};

/**
 * Evaluate a suggested edit against preferences
 */
export async function critiqueEdit(params: {
  originalText: string;
  suggestedEdit: string;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  documentPreferences?: DocumentPreferences;
  sectionType?: string;
  model?: string;
}): Promise<CritiqueAnalysis> {
  const {
    originalText,
    suggestedEdit,
    baseStyle,
    audienceProfile,
    documentPreferences,
    sectionType,
    model,
  } = params;

  // Build the style context
  const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);

  // Build adjustment context if we have document preferences
  let adjustmentContext = '';
  if (documentPreferences) {
    const adj = documentPreferences.adjustments;
    const adjustments: string[] = [];

    if (adj.verbosityAdjust !== 0) {
      adjustments.push(
        `Verbosity adjustment: ${adj.verbosityAdjust > 0 ? 'more detailed' : 'more terse'} (${adj.verbosityAdjust})`
      );
    }
    if (adj.formalityAdjust !== 0) {
      adjustments.push(
        `Formality adjustment: ${adj.formalityAdjust > 0 ? 'more formal' : 'less formal'} (${adj.formalityAdjust})`
      );
    }
    if (adj.hedgingAdjust !== 0) {
      adjustments.push(
        `Hedging adjustment: ${adj.hedgingAdjust > 0 ? 'more cautious' : 'more confident'} (${adj.hedgingAdjust})`
      );
    }
    // NOTE: We no longer include additionalAvoidWords in critique context.
    // Word choices are contextual and shouldn't affect alignment scoring.
    if (adj.learnedRules.length > 0) {
      adjustments.push('Learned rules from this document:');
      adj.learnedRules.forEach((r) => adjustments.push(`- ${r.rule}`));
    }

    if (adjustments.length > 0) {
      adjustmentContext = `\n\nDOCUMENT-SPECIFIC ADJUSTMENTS:\n${adjustments.join('\n')}`;
    }
  }

  const prompt = `You are a writing critique agent. Evaluate how well a suggested edit aligns with the user's writing preferences.

${stylePrompt}${adjustmentContext}

${sectionType ? `SECTION TYPE: ${sectionType}` : ''}

ORIGINAL TEXT:
${originalText}

SUGGESTED EDIT:
${suggestedEdit}

Analyze the suggested edit and provide a JSON response with this exact structure:
{
  "alignmentScore": <number 0-1 indicating how well the edit matches the preferences>,
  "predictedAcceptance": <number 0-1 predicting likelihood user will accept>,
  "issues": [
    {
      "type": "<verbosity|formality|word_choice|structure|tone|hedging>",
      "severity": "<minor|moderate|major>",
      "description": "<brief description of the issue>"
    }
  ],
  "suggestions": ["<brief suggestion for improvement>"]
}

Focus on:
1. Does the edit match the verbosity preference?
2. Is the formality level appropriate?
3. Does the hedging style match the preference?
4. Is the tone consistent with the style preferences?
5. Does the structure preserve the original meaning and flow?

Return ONLY the JSON object, no other text.`;

  try {
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a writing critique agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    // Parse the JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultCritique();
    }

    const parsed = JSON.parse(jsonMatch[0]) as CritiqueAnalysis;

    // Validate and normalize the response
    return {
      alignmentScore: Math.max(0, Math.min(1, parsed.alignmentScore || 0.5)),
      predictedAcceptance: Math.max(0, Math.min(1, parsed.predictedAcceptance || 0.5)),
      issues: (parsed.issues || []).map((issue) => ({
        type: issue.type || 'structure',
        severity: issue.severity || 'minor',
        description: issue.description || '',
      })),
      suggestions: parsed.suggestions || [],
    };
  } catch (error) {
    console.error('Critique agent error:', error);
    return getDefaultCritique();
  }
}

/**
 * Get a default critique when analysis fails
 */
function getDefaultCritique(): CritiqueAnalysis {
  return {
    alignmentScore: 0.7,
    predictedAcceptance: 0.7,
    issues: [],
    suggestions: [],
  };
}

/**
 * Apply document adjustments to base style for editing
 */
export function applyAdjustmentsToStyle(
  baseStyle: BaseStyle,
  adjustments: DocumentAdjustments
): BaseStyle {
  // Clone the base style
  const adjusted = { ...baseStyle };

  // Apply verbosity adjustment using clear thresholds
  // -2 to -0.5 = terse, -0.5 to 0.5 = moderate, 0.5 to 2 = detailed
  if (adjustments.verbosityAdjust <= -0.5) {
    adjusted.verbosity = 'terse';
  } else if (adjustments.verbosityAdjust >= 0.5) {
    adjusted.verbosity = 'detailed';
  }
  // else keep the base style's verbosity

  // Apply formality adjustment
  if (adjustments.formalityAdjust !== 0) {
    adjusted.formalityLevel = clamp(
      adjusted.formalityLevel + adjustments.formalityAdjust,
      1,
      5
    );
  }

  // Apply hedging adjustment using clear thresholds
  if (adjustments.hedgingAdjust <= -0.5) {
    adjusted.hedgingStyle = 'confident';
  } else if (adjustments.hedgingAdjust >= 0.5) {
    adjusted.hedgingStyle = 'cautious';
  }
  // else keep the base style's hedging

  // Add avoid words (combine base avoid words with document-specific)
  adjusted.avoidWords = [
    ...new Set([...adjusted.avoidWords, ...adjustments.additionalAvoidWords]),
  ];

  // Add preferred words (document-specific take precedence)
  adjusted.preferredWords = {
    ...adjusted.preferredWords,
    ...adjustments.additionalPreferWords,
  };

  // Add learned rules
  adjusted.learnedRules = [...adjusted.learnedRules, ...adjustments.learnedRules];

  return adjusted;
}

/**
 * Build additional context from document adjustments for prompts
 */
export function buildDocumentContextPrompt(adjustments: DocumentAdjustments): string {
  const parts: string[] = [];

  // Verbosity-specific instructions take priority
  if (adjustments.verbosityAdjust <= -0.5) {
    parts.push('CRITICAL - EXTREME COMPRESSION: You MUST cut 30-50% of words. Delete "that/very/really/just/actually". Combine sentences. Cut prepositional phrases. If only 10% shorter, you have FAILED. Rewrite until at least 30% shorter.');
    parts.push('');
  } else if (adjustments.verbosityAdjust >= 0.5) {
    parts.push('IMPORTANT - DETAILED MODE: This document requires comprehensive, detailed writing. Your edit should maintain or INCREASE the word count. Do NOT cut content. Expand on ideas where appropriate. Ignore any conflicting instructions about being concise or reducing words.');
    parts.push('');
  }

  // Formality-specific instructions
  if (adjustments.formalityAdjust <= -1) {
    parts.push('CRITICAL - MAXIMUM CASUAL: Use contractions everywhere (don\'t, won\'t, it\'s). Write like talking to a friend. No academic stiffness. If it sounds formal, you have FAILED.');
    parts.push('');
  } else if (adjustments.formalityAdjust >= 1) {
    parts.push('CRITICAL - MAXIMUM FORMAL: ZERO contractions allowed. Use "do not", "will not", "cannot". Third person only. Academic register. If any contractions remain, you have FAILED.');
    parts.push('');
  }

  // Hedging-specific instructions
  if (adjustments.hedgingAdjust <= -0.5) {
    parts.push('IMPORTANT - CONFIDENT ASSERTIONS: Remove hedging words (may, might, suggests, appears). Make direct, definitive statements.');
    parts.push('');
  } else if (adjustments.hedgingAdjust >= 0.5) {
    parts.push('IMPORTANT - CAUTIOUS HEDGING: Add qualifiers (may, might, suggests, could). Acknowledge uncertainty. Avoid absolute claims.');
    parts.push('');
  }

  // Framing guidance - filter out conflicting verbosity instructions
  // Also limit to 8 items max to prevent prompt bloat
  if (adjustments.additionalFramingGuidance.length > 0) {
    // Filter out concise/terse guidance if verbosity is set to detailed
    let filteredGuidance = adjustments.verbosityAdjust >= 0.5
      ? adjustments.additionalFramingGuidance.filter(g => {
          const lower = g.toLowerCase();
          return !lower.includes('concise') &&
                 !lower.includes('terse') &&
                 !lower.includes('pruning') &&
                 !lower.includes('shorter') &&
                 !lower.includes('reduce') &&
                 !lower.includes('word police');
        })
      : adjustments.additionalFramingGuidance;

    // Hard limit to prevent prompt bloat
    filteredGuidance = filteredGuidance.slice(0, 8);

    if (filteredGuidance.length > 0) {
      parts.push('DOCUMENT-SPECIFIC CONSTRAINTS:');
      filteredGuidance.forEach(g => {
        parts.push(`- ${g}`);
      });
      parts.push('');
    }
  }

  // Word preferences with substitutions
  if (Object.keys(adjustments.additionalPreferWords).length > 0) {
    parts.push('WORD SUBSTITUTIONS FOR THIS DOCUMENT:');
    Object.entries(adjustments.additionalPreferWords).forEach(([from, to]) => {
      parts.push(`- Instead of "${from}", use "${to}"`);
    });
    parts.push('');
  }

  // Additional avoid words
  if (adjustments.additionalAvoidWords.length > 0) {
    parts.push(`ADDITIONAL WORDS TO AVOID: ${adjustments.additionalAvoidWords.join(', ')}`);
    parts.push('');
  }

  // Edit examples - show FEEDBACK PATTERNS, not full text (to avoid memorization)
  if (adjustments.editExamples && adjustments.editExamples.length > 0) {
    // Only show examples that have explicit feedback
    const examplesWithFeedback = adjustments.editExamples.filter(
      ex => ex.feedback && ex.feedback.length > 0
    );

    if (examplesWithFeedback.length > 0) {
      parts.push('FEEDBACK PATTERNS FROM PREVIOUS REJECTIONS:');
      parts.push('The user has given this feedback on rejected edits:');
      parts.push('');

      // Count feedback categories
      const feedbackCounts: Record<string, number> = {};
      examplesWithFeedback.forEach(ex => {
        ex.feedback?.forEach(f => {
          feedbackCounts[f] = (feedbackCounts[f] || 0) + 1;
        });
      });

      // Show as aggregated feedback, not individual examples
      Object.entries(feedbackCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([feedback, count]) => {
          const label = feedback.replace(/_/g, ' ');
          parts.push(`- "${label}" (mentioned ${count}x)`);
        });
      parts.push('');
      parts.push('Avoid making edits that would trigger these feedback categories.');
      parts.push('────────────────────────────────────────────────────────────────────');
      parts.push('');
    }
  }

  // Learned rules - these come from user rejections and are CRITICAL
  // Present them with maximum emphasis since they represent user feedback
  // Limit to 8 items max to prevent prompt bloat
  if (adjustments.learnedRules.length > 0) {
    parts.push('╔══════════════════════════════════════════════════════════════════╗');
    parts.push('║  ⚠️  MANDATORY RULES - LEARNED FROM USER REJECTIONS  ⚠️          ║');
    parts.push('╚══════════════════════════════════════════════════════════════════╝');
    parts.push('');
    parts.push('The user has EXPLICITLY REJECTED edits that violated these rules.');
    parts.push('FAILURE TO FOLLOW THESE RULES WILL RESULT IN REJECTION.');
    parts.push('');

    // Sort by confidence, highest first, then limit to top 8
    const sortedRules = [...adjustments.learnedRules]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);

    sortedRules.forEach((r, i) => {
      const priority = r.confidence >= 0.85 ? '🚨 [CRITICAL]' :
                       r.confidence >= 0.7 ? '⚠️ [HIGH]' : '[MEDIUM]';
      parts.push(`${i + 1}. ${priority} ${r.rule}`);
    });
    parts.push('');
    parts.push('────────────────────────────────────────────────────────────────────');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Get edit statistics for a document
 */
export function getEditStats(editHistory: EditDecision[]): {
  total: number;
  accepted: number;
  rejected: number;
  partial: number;
  acceptanceRate: number;
} {
  const stats = {
    total: editHistory.length,
    accepted: editHistory.filter((d) => d.decision === 'accepted').length,
    rejected: editHistory.filter((d) => d.decision === 'rejected').length,
    partial: editHistory.filter((d) => d.decision === 'partial').length,
    acceptanceRate: 0,
  };

  stats.acceptanceRate =
    stats.total > 0
      ? (stats.accepted + stats.partial * 0.5) / stats.total
      : 0;

  return stats;
}

/**
 * Helper to clamp a number between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
