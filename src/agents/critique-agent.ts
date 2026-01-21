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
  FeedbackCategory,
  EditExample,
  DiffPattern,
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
  editExamples: [],
  diffPatterns: [],
};

// Feedback category to adjustment mapping
const FEEDBACK_ADJUSTMENTS: Record<FeedbackCategory, Partial<{
  verbosity: number;
  formality: number;
  hedging: number;
  rule: string;
}>> = {
  too_formal: { formality: -0.5, rule: 'Use a more casual, conversational tone' },
  too_casual: { formality: 0.5, rule: 'Maintain a more formal, professional tone' },
  too_verbose: { verbosity: -0.5, rule: 'Be more concise - cut unnecessary words' },
  too_terse: { verbosity: 0.5, rule: 'Provide more detail and explanation' },
  changed_meaning: { rule: 'NEVER change the core meaning or argument - only style' },
  over_edited: { rule: 'Make MINIMAL changes - preserve original phrasing where possible' },
  wrong_tone: { rule: 'Match the original tone and voice more closely' },
  bad_word_choice: { rule: 'Preserve domain-specific terminology and word choices' },
  lost_nuance: { rule: 'Preserve subtle distinctions and nuanced language' },
  other: {},
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

  // IMPORTANT: Only learn style preferences, NOT specific word choices
  // Word choices are contextual - "utilize" might be wrong in one context but right in another
  // We learn PATTERNS (too formal, too verbose) not MEMORIZATION (always use X word)
  const prompt = `You are a preference learning agent. Analyze why a user ${decision.decision} an edit suggestion.

${stylePrompt}

ORIGINAL TEXT:
${decision.originalText}

SUGGESTED EDIT:
${decision.suggestedEdit}

USER'S DECISION: ${decision.decision}
${decision.decision !== 'accepted' ? `USER'S FINAL VERSION:\n${decision.finalText}` : ''}
${decision.instruction ? `USER'S INSTRUCTION: ${decision.instruction}` : ''}

Based on the difference between the suggested edit and what the user actually wanted, infer STYLE adjustments.

IMPORTANT: Do NOT learn specific word preferences. Word choices are CONTEXTUAL.
- Bad: "always use 'use' instead of 'utilize'" (too specific, context-dependent)
- Good: "prefers simpler, less formal word choices" (style pattern)
- Bad: "always say 'important' not 'significant'" (memorization)
- Good: "avoid unnecessarily academic vocabulary" (pattern)

Respond with a JSON object:
{
  "verbosityAdjust": <-2 to +2, negative if user wanted shorter, positive if longer>,
  "formalityAdjust": <-2 to +2, negative if user wanted less formal, positive if more formal>,
  "hedgingAdjust": <-2 to +2, negative if user wanted more confident, positive if more cautious>,
  "learnedRule": "<a STYLE pattern rule, or null if nothing generalizable>"
}

Rules should be about STYLE PATTERNS, not specific word substitutions.
Use 0 for adjustments you're not sure about.
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

    // Apply learned adjustments with dampening
    // Higher rate for rejections (user explicitly said no), lower for partial
    const isRejection = decision.decision === 'rejected';
    const dampening = isRejection ? 0.5 : 0.35; // 50% for rejections, 35% for partial
    const currentAdj = documentPreferences.adjustments;

    // Build new rules list
    let newRules = currentAdj.learnedRules;
    if (parsed.learnedRule) {
      newRules = [
        ...currentAdj.learnedRules,
        {
          rule: parsed.learnedRule,
          confidence: isRejection ? 0.8 : 0.6, // Higher confidence for rejections
          source: 'inferred' as const,
          timestamp: new Date().toISOString(),
        },
      ];

      // Consolidate rules if they've accumulated past threshold
      // This prevents dilution from having too many similar rules
      if (newRules.length >= 8) {
        console.log(`Rules accumulated to ${newRules.length}, triggering consolidation...`);
        newRules = await consolidateLearnedRules({ rules: newRules, model });
      }
    }

    // Only learn STYLE adjustments, not word preferences
    // Word preferences lead to overfitting - memorizing context-specific choices
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
      // Keep existing avoid/prefer words but don't add new ones from LLM inference
      // Only explicit feedback or very high-confidence diff patterns should add words
      additionalAvoidWords: currentAdj.additionalAvoidWords,
      additionalPreferWords: currentAdj.additionalPreferWords,
      additionalFramingGuidance: currentAdj.additionalFramingGuidance,
      learnedRules: newRules,
      editExamples: currentAdj.editExamples,
      diffPatterns: currentAdj.diffPatterns,
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

/**
 * Learn from explicit user feedback (button clicks like "too formal", "over-edited")
 * This provides much clearer signal than inferring from diffs.
 */
export function learnFromExplicitFeedback(params: {
  feedback: FeedbackCategory[];
  documentPreferences: DocumentPreferences;
  suggestedEdit: string;
  userVersion: string;
  instruction?: string;
}): DocumentPreferences {
  const { feedback, documentPreferences, suggestedEdit, userVersion, instruction } = params;

  const newAdjustments = { ...documentPreferences.adjustments };

  // Apply adjustments for each feedback category
  for (const category of feedback) {
    const adjustment = FEEDBACK_ADJUSTMENTS[category];
    if (!adjustment) continue;

    // NOTE: We no longer auto-adjust the style sliders (verbosity, formality, hedging).
    // These are user-controlled only to prevent style drift.
    // The sliders should only change through explicit user action on the UI sliders.

    // Add rule with HIGH confidence since it's explicit feedback
    if (adjustment.rule) {
      // Check if similar rule already exists
      const existingRule = newAdjustments.learnedRules.find(
        r => r.rule.toLowerCase().includes(adjustment.rule!.toLowerCase().slice(0, 20))
      );

      if (existingRule) {
        // Boost existing rule confidence
        existingRule.confidence = Math.min(0.95, existingRule.confidence + 0.15);
      } else {
        newAdjustments.learnedRules.push({
          rule: adjustment.rule,
          confidence: 0.85, // High confidence for explicit feedback
          source: 'explicit',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Store as an example for example-based learning
  // But DON'T store word-level details - just the feedback categories
  const examples = newAdjustments.editExamples || [];
  examples.push({
    id: `ex-${Date.now()}`,
    // Store shorter snippets - we want the pattern, not memorization
    suggestedEdit: suggestedEdit.slice(0, 200),
    userVersion: userVersion.slice(0, 200),
    instruction,
    feedback,
    timestamp: new Date().toISOString(),
  });
  newAdjustments.editExamples = examples.slice(-5); // Keep fewer examples to prevent overfitting

  return {
    ...documentPreferences,
    adjustments: newAdjustments,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Compute word-level diff between suggested edit and user's version.
 * Returns patterns of what the user typically changes.
 */
export function computeWordDiff(suggested: string, userVersion: string): {
  removals: string[];
  additions: string[];
  substitutions: Array<{ from: string; to: string }>;
} {
  // Simple word-level diff
  const suggestedWords = suggested.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const userWords = userVersion.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const suggestedSet = new Set(suggestedWords);
  const userSet = new Set(userWords);

  // Words in suggested but not in user version (removals)
  const removals = suggestedWords.filter(w => !userSet.has(w));

  // Words in user version but not in suggested (additions)
  const additions = userWords.filter(w => !suggestedSet.has(w));

  // Try to find substitutions (words that appear in similar positions)
  const substitutions: Array<{ from: string; to: string }> = [];

  // Simple heuristic: if a word was removed and another added nearby, it might be a substitution
  for (const removed of removals.slice(0, 5)) {
    const removedIndex = suggestedWords.indexOf(removed);
    for (const added of additions.slice(0, 5)) {
      const addedIndex = userWords.indexOf(added);
      // If they're in similar relative positions, consider it a substitution
      if (Math.abs(removedIndex / suggestedWords.length - addedIndex / userWords.length) < 0.1) {
        substitutions.push({ from: removed, to: added });
        break;
      }
    }
  }

  return {
    removals: [...new Set(removals)].slice(0, 10),
    additions: [...new Set(additions)].slice(0, 10),
    substitutions: substitutions.slice(0, 5),
  };
}

/**
 * Learn from word-level diffs - DISABLED.
 *
 * Word choices are contextual. "That" isn't universally bad - sometimes you need it.
 * The system should focus on style patterns (verbosity, formality, hedging) and
 * document goals/intent, not memorizing specific words.
 *
 * This function is kept for backwards compatibility but no longer modifies preferences.
 */
export function learnFromDiff(params: {
  suggestedEdit: string;
  userVersion: string;
  documentPreferences: DocumentPreferences;
}): DocumentPreferences {
  // Word-level learning disabled - too contextual and can steer in wrong direction.
  // Instead, the system focuses on style patterns and intent.
  return {
    ...params.documentPreferences,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Consolidate learned rules by merging similar rules into stronger, unified directives.
 * This should be called when rules accumulate to prevent dilution.
 */
export async function consolidateLearnedRules(params: {
  rules: LearnedRule[];
  model?: string;
}): Promise<LearnedRule[]> {
  const { rules, model } = params;

  // Don't consolidate if we have few rules
  if (rules.length < 5) {
    return rules;
  }

  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  const rulesText = rules.map((r, i) =>
    `${i + 1}. [confidence: ${r.confidence.toFixed(2)}] ${r.rule}`
  ).join('\n');

  const prompt = `You are a preference consolidation agent. Analyze these learned editing rules and consolidate similar ones into stronger, unified directives.

CURRENT RULES:
${rulesText}

TASK:
1. Identify rules that express similar or related preferences
2. Merge similar rules into ONE clear, strong directive
3. Boost confidence when multiple rules agree (max 0.95)
4. Keep distinct rules separate
5. Use DIRECT, IMPERATIVE language (e.g., "NEVER add..." not "The user prefers not to...")
6. Maximum 8 consolidated rules

Respond with a JSON array:
[
  {
    "rule": "<clear, strong directive>",
    "confidence": <0.5-0.95 based on how many rules support this>,
    "mergedFrom": [<indices of original rules that were merged, 1-indexed>]
  }
]

Important:
- If 3+ rules say similar things, confidence should be 0.85+
- If 2 rules agree, confidence should be 0.7-0.8
- Single rules keep their original confidence
- Use strong language: "ALWAYS", "NEVER", "MUST", "DO NOT"

Return ONLY the JSON array.`;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a preference consolidation agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1, // Very low for consistent consolidation
    });

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Failed to parse consolidation response');
      return rules.slice(-8); // Fallback: keep recent rules
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string;
      confidence: number;
      mergedFrom: number[];
    }>;

    // Convert to LearnedRule format
    const consolidated: LearnedRule[] = parsed.map((p) => ({
      rule: p.rule,
      confidence: Math.min(0.95, Math.max(0.5, p.confidence)),
      source: 'inferred' as const,
      timestamp: new Date().toISOString(),
    }));

    console.log(`Consolidated ${rules.length} rules into ${consolidated.length} rules`);
    return consolidated;
  } catch (error) {
    console.error('Rule consolidation error:', error);
    return rules.slice(-8); // Fallback: keep recent rules
  }
}
