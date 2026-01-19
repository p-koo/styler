/**
 * Critique Agent
 *
 * Evaluates suggested edits against user preferences and learns from
 * accept/reject decisions to improve document-specific preferences.
 */

import type {
  BaseStyle,
  AudienceProfile,
  DocumentPreferences,
  DocumentAdjustments,
  CritiqueAnalysis,
  CritiqueIssue,
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
  additionalAvoidWords: [],
  additionalPreferWords: {},
  additionalFramingGuidance: [],
  learnedRules: [],
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
    if (adj.additionalAvoidWords.length > 0) {
      adjustments.push(`Additional words to avoid: ${adj.additionalAvoidWords.join(', ')}`);
    }
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
3. Are avoided words being introduced or preferred words being removed?
4. Does the hedging style match the preference?
5. Does the structure match style patterns?

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
 * Learn from a user's accept/reject decision
 */
export async function learnFromDecision(params: {
  decision: EditDecision;
  documentPreferences: DocumentPreferences;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  model?: string;
}): Promise<DocumentPreferences> {
  const { decision, documentPreferences, baseStyle, audienceProfile, model } = params;

  // If accepted without changes, no learning needed
  if (decision.decision === 'accepted' && decision.suggestedEdit === decision.finalText) {
    return {
      ...documentPreferences,
      editHistory: [...documentPreferences.editHistory, decision],
      updatedAt: new Date().toISOString(),
    };
  }

  // Build analysis prompt
  const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);

  const prompt = `You are a preference learning agent. Analyze why a user ${decision.decision} an edit suggestion.

${stylePrompt}

ORIGINAL TEXT:
${decision.originalText}

SUGGESTED EDIT:
${decision.suggestedEdit}

USER'S DECISION: ${decision.decision}
${decision.decision !== 'accepted' ? `USER'S FINAL VERSION:\n${decision.finalText}` : ''}
${decision.instruction ? `USER'S INSTRUCTION: ${decision.instruction}` : ''}

Based on the difference between the suggested edit and what the user actually wanted, infer adjustments to preferences.

Respond with a JSON object:
{
  "verbosityAdjust": <-2 to +2, negative if user wanted shorter, positive if longer>,
  "formalityAdjust": <-2 to +2, negative if user wanted less formal, positive if more formal>,
  "hedgingAdjust": <-2 to +2, negative if user wanted more confident, positive if more cautious>,
  "avoidWords": ["<words from the suggested edit the user seemed to reject>"],
  "preferWords": {"<replaced word>": "<user's preferred word>"},
  "learnedRule": "<a specific rule we can learn from this, or null if nothing specific>"
}

Only include adjustments that are clearly indicated by the user's changes. Use 0 for adjustments you're not sure about.
Return ONLY the JSON object.`;

  try {
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a preference learning agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return addDecisionToHistory(documentPreferences, decision);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Apply learned adjustments with dampening (don't swing too far from one example)
    const dampening = 0.3; // Apply 30% of the suggested adjustment
    const currentAdj = documentPreferences.adjustments;

    const newAdjustments: DocumentAdjustments = {
      verbosityAdjust: clamp(
        currentAdj.verbosityAdjust + (parsed.verbosityAdjust || 0) * dampening,
        -2,
        2
      ),
      formalityAdjust: clamp(
        currentAdj.formalityAdjust + (parsed.formalityAdjust || 0) * dampening,
        -2,
        2
      ),
      hedgingAdjust: clamp(
        currentAdj.hedgingAdjust + (parsed.hedgingAdjust || 0) * dampening,
        -2,
        2
      ),
      additionalAvoidWords: [
        ...new Set([...currentAdj.additionalAvoidWords, ...(parsed.avoidWords || [])]),
      ].slice(0, 50), // Cap at 50 words
      additionalPreferWords: {
        ...currentAdj.additionalPreferWords,
        ...(parsed.preferWords || {}),
      },
      additionalFramingGuidance: currentAdj.additionalFramingGuidance,
      learnedRules: parsed.learnedRule
        ? [
            ...currentAdj.learnedRules,
            {
              rule: parsed.learnedRule,
              confidence: 0.6,
              source: 'inferred' as const,
              timestamp: new Date().toISOString(),
            },
          ].slice(-20) // Keep last 20 rules
        : currentAdj.learnedRules,
    };

    return {
      ...documentPreferences,
      adjustments: newAdjustments,
      editHistory: [...documentPreferences.editHistory, decision],
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Learn from decision error:', error);
    return addDecisionToHistory(documentPreferences, decision);
  }
}

/**
 * Add a decision to history without learning
 */
function addDecisionToHistory(
  prefs: DocumentPreferences,
  decision: EditDecision
): DocumentPreferences {
  return {
    ...prefs,
    editHistory: [...prefs.editHistory, decision],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Analyze patterns across multiple decisions
 */
export async function analyzeEditPatterns(params: {
  decisions: EditDecision[];
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  model?: string;
}): Promise<{
  patterns: string[];
  suggestedAdjustments: Partial<DocumentAdjustments>;
}> {
  const { decisions, baseStyle, audienceProfile, model } = params;

  if (decisions.length < 3) {
    return { patterns: [], suggestedAdjustments: {} };
  }

  // Get rejections and partial accepts for analysis
  const relevantDecisions = decisions.filter(
    (d) => d.decision === 'rejected' || d.decision === 'partial'
  );

  if (relevantDecisions.length < 2) {
    return { patterns: [], suggestedAdjustments: {} };
  }

  const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);

  const decisionSummaries = relevantDecisions.slice(-10).map((d, i) => `
Decision ${i + 1} (${d.decision}):
- Suggested: "${d.suggestedEdit.slice(0, 200)}..."
- User wanted: "${d.finalText.slice(0, 200)}..."
${d.instruction ? `- Instruction: ${d.instruction}` : ''}`).join('\n');

  const prompt = `Analyze patterns across these edit decisions to understand user preferences:

${stylePrompt}

RECENT EDIT DECISIONS:
${decisionSummaries}

Look for consistent patterns in what the user changes. Respond with JSON:
{
  "patterns": ["<pattern 1>", "<pattern 2>"],
  "suggestedAdjustments": {
    "verbosityAdjust": <-2 to 2 or null>,
    "formalityAdjust": <-2 to 2 or null>,
    "hedgingAdjust": <-2 to 2 or null>,
    "additionalAvoidWords": ["<words to avoid>"],
    "additionalFramingGuidance": ["<framing guidance>"]
  }
}

Only include adjustments with clear patterns. Return ONLY the JSON object.`;

  try {
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a pattern analysis agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { patterns: [], suggestedAdjustments: {} };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      patterns: parsed.patterns || [],
      suggestedAdjustments: parsed.suggestedAdjustments || {},
    };
  } catch (error) {
    console.error('Pattern analysis error:', error);
    return { patterns: [], suggestedAdjustments: {} };
  }
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
  if (adjustments.additionalFramingGuidance.length > 0) {
    // Filter out concise/terse guidance if verbosity is set to detailed
    const filteredGuidance = adjustments.verbosityAdjust >= 0.5
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

  // Learned rules
  if (adjustments.learnedRules.length > 0) {
    parts.push('SPECIFIC RULES FOR THIS DOCUMENT:');
    adjustments.learnedRules.forEach(r => {
      parts.push(`- ${r.rule}`);
    });
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
