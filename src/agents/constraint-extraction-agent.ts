/**
 * Constraint Extraction Agent
 *
 * Analyzes imported documents (grant calls, style guides, submission requirements)
 * and extracts structured writing constraints and preferences.
 */

import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import type { DocumentAdjustments, LearnedRule } from '@/types';

export interface ExtractedConstraints {
  verbosityAdjust: number;
  formalityAdjust: number;
  hedgingAdjust: number;
  avoidWords: string[];
  preferWords: Record<string, string>;
  framingGuidance: string[];
  rules: string[];
  summary: string;
}

const EXTRACTION_PROMPT = `You are an expert at analyzing document requirements and guidelines.

Given the following text (which may be from a grant call, style guide, submission requirements, or other instructional document), extract specific writing constraints and preferences.

Analyze the text and extract:

1. VERBOSITY PREFERENCE (-2 to +2 scale):
   - -2 = Extremely terse/concise required
   - 0 = Neutral/no strong preference
   - +2 = Detailed/comprehensive required
   Consider page limits, word counts, or explicit guidance about length.

2. FORMALITY PREFERENCE (-2 to +2 scale):
   - -2 = Casual/conversational tone
   - 0 = Balanced
   - +2 = Highly formal/academic tone
   Consider the audience and context.

3. HEDGING PREFERENCE (-2 to +2 scale):
   - -2 = Bold, confident claims expected
   - 0 = Balanced
   - +2 = Cautious, hedged language expected
   Consider whether claims need qualification or if assertive statements are preferred.

4. WORDS TO AVOID: List specific words or phrases that should not be used (if mentioned or implied).

5. WORD SUBSTITUTIONS: Pairs of [avoid → prefer] for terminology preferences.
   Example: "utilize" → "use", "very" → "highly"

6. FRAMING GUIDANCE: High-level constraints about how content should be framed.
   Example: "Focus on innovation", "Emphasize clinical relevance", "Target expert audience"

7. SPECIFIC RULES: Concrete rules extracted from the requirements.
   Example: "Use active voice", "Define acronyms on first use", "Include specific aims"

Respond in JSON format:
{
  "verbosityAdjust": <number>,
  "formalityAdjust": <number>,
  "hedgingAdjust": <number>,
  "avoidWords": [<string>, ...],
  "preferWords": {"avoid": "prefer", ...},
  "framingGuidance": [<string>, ...],
  "rules": [<string>, ...],
  "summary": "<brief summary of what this document requires>"
}

TEXT TO ANALYZE:
`;

/**
 * Extract writing constraints from document text (e.g., grant calls, style guides)
 */
export async function extractConstraints(
  text: string,
  model?: string
): Promise<ExtractedConstraints> {
  if (!text || text.trim().length < 50) {
    throw new Error('Please provide at least 50 characters of text to analyze');
  }

  // Truncate very long text to avoid token limits
  const truncatedText = text.length > 15000
    ? text.slice(0, 15000) + '\n\n[Text truncated...]'
    : text;

  // Call LLM to extract constraints
  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  const result = await provider.complete({
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: truncatedText },
    ],
    temperature: 0.2,
  });

  // Parse the JSON response
  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const extracted = JSON.parse(jsonMatch[0]);

  // Validate and clamp values
  return {
    verbosityAdjust: clamp(extracted.verbosityAdjust ?? 0, -2, 2),
    formalityAdjust: clamp(extracted.formalityAdjust ?? 0, -2, 2),
    hedgingAdjust: clamp(extracted.hedgingAdjust ?? 0, -2, 2),
    avoidWords: Array.isArray(extracted.avoidWords) ? extracted.avoidWords.slice(0, 50) : [],
    preferWords: typeof extracted.preferWords === 'object' ? extracted.preferWords : {},
    framingGuidance: Array.isArray(extracted.framingGuidance) ? extracted.framingGuidance.slice(0, 20) : [],
    rules: Array.isArray(extracted.rules) ? extracted.rules.slice(0, 30) : [],
    summary: extracted.summary || 'Constraints extracted from provided text',
  };
}

/**
 * Merge extracted constraints into existing document adjustments
 */
export function mergeConstraintsIntoAdjustments(
  existing: DocumentAdjustments,
  constraints: ExtractedConstraints
): DocumentAdjustments {
  return {
    verbosityAdjust: existing.verbosityAdjust !== 0
      ? (existing.verbosityAdjust + constraints.verbosityAdjust) / 2
      : constraints.verbosityAdjust,
    formalityAdjust: existing.formalityAdjust !== 0
      ? (existing.formalityAdjust + constraints.formalityAdjust) / 2
      : constraints.formalityAdjust,
    hedgingAdjust: existing.hedgingAdjust !== 0
      ? (existing.hedgingAdjust + constraints.hedgingAdjust) / 2
      : constraints.hedgingAdjust,
    additionalAvoidWords: [
      ...new Set([...existing.additionalAvoidWords, ...constraints.avoidWords]),
    ].slice(0, 100),
    additionalPreferWords: {
      ...existing.additionalPreferWords,
      ...constraints.preferWords,
    },
    additionalFramingGuidance: [
      ...new Set([...existing.additionalFramingGuidance, ...constraints.framingGuidance]),
    ].slice(0, 30),
    learnedRules: [
      ...existing.learnedRules,
      ...constraints.rules.map((rule): LearnedRule => ({
        rule,
        confidence: 0.9,
        source: 'document',
        timestamp: new Date().toISOString(),
      })),
    ].slice(0, 50),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
