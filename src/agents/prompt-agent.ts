/**
 * Prompt Agent
 *
 * Compiles user preferences into system prompts that guide LLM behavior.
 * Merges base style with active audience profile.
 */

import type { BaseStyle, AudienceProfile, LearnedRule } from '@/types';
import { loadPreferences, mergeStyles } from '@/memory/preference-store';

/**
 * Build a system prompt from preferences
 * Note: baseStyle should already have document-level adjustments applied
 * The audienceProfile overrides are merged but document adjustments for
 * verbosity/formality/hedging take priority (they're in baseStyle)
 */
export function buildSystemPrompt(
  baseStyle: BaseStyle,
  audienceProfile?: AudienceProfile
): string {
  // Merge styles if audience profile is active, but preserve document-level
  // verbosity, formality, and hedging from baseStyle (already adjusted)
  let style = baseStyle;
  if (audienceProfile) {
    const merged = mergeStyles(baseStyle, audienceProfile.overrides);
    // Keep the document-adjusted values for these key settings
    style = {
      ...merged,
      verbosity: baseStyle.verbosity,           // Document adjustment takes priority
      formalityLevel: baseStyle.formalityLevel, // Document adjustment takes priority
      hedgingStyle: baseStyle.hedgingStyle,     // Document adjustment takes priority
    };
  }

  const sections: string[] = [];

  // Core identity
  sections.push(
    'You are a writing assistant that adapts to the user\'s personal writing style and preferences.'
  );

  // Verbosity instruction
  sections.push(buildVerbosityInstruction(style.verbosity));

  // Formality instruction
  sections.push(buildFormalityInstruction(style.formalityLevel));

  // Hedging style
  sections.push(buildHedgingInstruction(style.hedgingStyle));

  // Word preferences - DISABLED
  // Word choices are contextual. We no longer include word-level preferences in prompts.
  // The system focuses on style patterns (verbosity, formality, hedging) and intent instead.

  // Format constraints
  if (style.formatBans.length > 0 || style.requiredFormats.length > 0) {
    sections.push(buildFormatInstruction(style.formatBans, style.requiredFormats));
  }

  // Transition phrases
  if (style.transitionPhrases.length > 0) {
    sections.push(buildTransitionInstruction(style.transitionPhrases));
  }

  // Learned rules
  if (style.learnedRules.length > 0) {
    sections.push(buildLearnedRulesInstruction(style.learnedRules));
  }

  // Audience-specific instructions
  if (audienceProfile) {
    sections.push(buildAudienceInstruction(audienceProfile));
  }

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build verbosity instruction
 */
function buildVerbosityInstruction(verbosity: BaseStyle['verbosity']): string {
  switch (verbosity) {
    case 'terse':
      return `VERBOSITY: EXTREME COMPRESSION MODE - YOUR #1 PRIORITY IS CUTTING WORDS

TARGET: Remove 30-50% of words. If you only cut 10-20%, you have FAILED.

MANDATORY CUTS - DO ALL OF THESE:
1. DELETE these words EVERYWHERE: "that", "very", "really", "just", "actually", "basically", "quite", "rather", "somewhat", "fairly", "pretty", "in order to", "the fact that", "it is", "there are", "there is"
2. DELETE all weak openings: "It is important to note", "It should be noted", "It is worth mentioning", "As we can see", "It goes without saying"
3. DELETE redundant modifiers: "completely eliminate" → "eliminate", "absolutely essential" → "essential", "very unique" → "unique"
4. COMBINE every pair of short sentences into one
5. REPLACE phrases with single words: "in spite of" → "despite", "in the event that" → "if", "at this point in time" → "now", "due to the fact that" → "because", "in close proximity to" → "near"
6. CUT prepositional chains: "the behavior of the system" → "system behavior"
7. USE active voice always: "was observed by us" → "we observed"
8. DELETE hedge phrases: "it appears that", "it seems that", "it is possible that", "may potentially"
9. REMOVE throat-clearing: any sentence that restates what was just said

EVERY SENTENCE must be shorter. NO EXCEPTIONS. Count the words before and after - if it's not at least 30% shorter overall, REWRITE to cut more.`;
    case 'detailed':
      return 'VERBOSITY: Provide comprehensive, detailed responses. Include relevant context and thorough explanations. Expand on key points.';
    default:
      return 'VERBOSITY: Balance conciseness with sufficient detail. Elaborate where necessary but avoid padding.';
  }
}

/**
 * Build formality instruction
 */
function buildFormalityInstruction(level: number): string {
  if (level >= 4) {
    return `FORMALITY: MAXIMUM FORMAL/ACADEMIC MODE - STRICT REQUIREMENT
- Use formal, academic language throughout. This is non-negotiable.
- NEVER use contractions. Replace: don't→do not, isn't→is not, won't→will not, can't→cannot.
- Use precise, technical vocabulary. Prefer Latinate words over Anglo-Saxon.
- Use passive voice where appropriate: "It was observed that" not "We saw".
- Use third person. Avoid "I", "we", "you". Use "one", "the authors", "this study".
- Use formal transitions: "Furthermore", "Moreover", "Consequently", "Nevertheless".
- AVOID casual phrases: "a lot", "things", "stuff", "kind of", "sort of", "pretty much".
- If any contractions or casual language remain, you have FAILED this task.`;
  } else if (level <= 2) {
    return `FORMALITY: MAXIMUM CASUAL/CONVERSATIONAL MODE - STRICT REQUIREMENT
- Write like you're talking to a friend. Be natural and relaxed.
- USE contractions everywhere: don't, isn't, won't, can't, we're, they've, it's.
- Use first and second person freely: "I", "we", "you".
- Use simple, everyday words. Prefer short Anglo-Saxon words over Latinate.
- AVOID stiff academic phrases: "it should be noted", "one might argue", "it is evident".
- AVOID formal transitions: use "But", "So", "And" instead of "However", "Therefore", "Additionally".
- Use colloquial expressions where natural: "a lot", "kind of", "pretty much".
- If the text sounds like an academic paper, you have FAILED this task.`;
  }
  return 'FORMALITY: Use clear, professional language that is accessible but not overly casual.';
}

/**
 * Build hedging instruction
 */
function buildHedgingInstruction(style: BaseStyle['hedgingStyle']): string {
  switch (style) {
    case 'confident':
      return `HEDGING: CONFIDENT MODE
- Make direct, confident assertions.
- REMOVE hedging words: "may", "might", "perhaps", "possibly", "suggests", "appears to", "seems to".
- Replace uncertain phrases with direct statements.
- State findings and conclusions definitively.
- Example: "This approach improves accuracy" NOT "This approach may improve accuracy"`;
    case 'cautious':
      return `HEDGING: CAUTIOUS MODE
- Use appropriate hedging language throughout.
- ADD qualifiers: "may", "might", "suggests", "appears to", "could potentially".
- Acknowledge uncertainty and limitations explicitly.
- Avoid absolute claims; prefer measured, qualified statements.
- Example: "Results suggest this may improve accuracy" NOT "This improves accuracy"`;
    default:
      return 'HEDGING: Balance confidence with appropriate hedging. Be direct but acknowledge limitations where relevant.';
  }
}

/**
 * Build word preference instruction
 * Only lists words to avoid - the LLM picks contextually appropriate alternatives
 */
function buildWordPreferenceInstruction(
  preferred: Record<string, string>,
  avoid: string[]
): string {
  // Combine avoided words from both sources
  const allAvoid = new Set([
    ...avoid,
    ...Object.keys(preferred), // Words we have substitutions for should also be avoided
  ]);

  if (allAvoid.size === 0) return '';

  const avoidList = Array.from(allAvoid)
    .slice(0, 20)
    .map((w) => `"${w}"`)
    .join(', ');

  return `AVOID THESE WORDS/PHRASES: ${avoidList}\n(Choose contextually appropriate alternatives instead.)`;
}

/**
 * Build format instruction
 */
function buildFormatInstruction(bans: string[], required: string[]): string {
  const parts: string[] = ['FORMATTING:'];

  if (bans.length > 0) {
    const banDescriptions: Record<string, string> = {
      emoji: 'emojis',
      'em-dash': 'em-dashes (—)',
      exclamation: 'exclamation marks',
      headers: 'markdown headers',
      'bullet-points': 'bullet points',
      bold: 'bold text',
      italics: 'italics',
    };

    const banList = bans
      .map((b) => banDescriptions[b] || b)
      .join(', ');
    parts.push(`Never use: ${banList}.`);
  }

  if (required.length > 0) {
    const reqDescriptions: Record<string, string> = {
      'code-blocks': 'code blocks for code examples',
      'bullet-points': 'bullet points for lists',
      headers: 'headers to organize content',
      numbered: 'numbered lists for sequential steps',
    };

    const reqList = required
      .map((r) => reqDescriptions[r] || r)
      .join(', ');
    parts.push(`Always use: ${reqList}.`);
  }

  return parts.join(' ');
}

/**
 * Build transition instruction
 */
function buildTransitionInstruction(phrases: string[]): string {
  if (phrases.length === 0) return '';

  const list = phrases.slice(0, 10).map((p) => `"${p}"`).join(', ');
  return `TRANSITIONS: When appropriate, use transition phrases like: ${list}`;
}

/**
 * Build learned rules instruction
 */
function buildLearnedRulesInstruction(rules: LearnedRule[]): string {
  // Only include high-confidence rules
  const highConfidenceRules = rules
    .filter((r) => r.confidence >= 0.6)
    .slice(0, 10);

  if (highConfidenceRules.length === 0) return '';

  const ruleList = highConfidenceRules
    .map((r) => `- ${r.rule}`)
    .join('\n');

  return `SPECIFIC PREFERENCES:\n${ruleList}`;
}

/**
 * Build audience-specific instruction
 */
function buildAudienceInstruction(profile: AudienceProfile): string {
  const parts: string[] = [`AUDIENCE CONTEXT: ${profile.name}`];

  // Jargon level
  switch (profile.jargonLevel) {
    case 'minimal':
      parts.push('Use minimal technical jargon. Make content accessible to a broad audience.');
      break;
    case 'heavy':
      parts.push('Use appropriate technical terminology freely. Assume audience expertise.');
      break;
    default:
      parts.push('Use moderate technical language. Define specialized terms when first used.');
  }

  // Emphasis points
  if (profile.emphasisPoints.length > 0) {
    const emphases = profile.emphasisPoints.join(', ');
    parts.push(`Emphasize: ${emphases}.`);
  }

  // Framing guidance
  if (profile.framingGuidance.length > 0) {
    parts.push('Framing guidance:');
    profile.framingGuidance.forEach((g) => parts.push(`- ${g}`));
  }

  // Length guidance
  if (profile.lengthGuidance) {
    switch (profile.lengthGuidance.target) {
      case 'concise':
        parts.push('Keep responses concise. Word economy is critical.');
        break;
      case 'comprehensive':
        parts.push('Provide comprehensive detail where appropriate.');
        break;
    }

    if (profile.lengthGuidance.maxWords) {
      parts.push(`Target approximately ${profile.lengthGuidance.maxWords} words.`);
    }
  }

  // Discipline terms
  if (profile.disciplineTerms.length > 0) {
    const terms = profile.disciplineTerms.slice(0, 10).join(', ');
    parts.push(`Relevant domain terms: ${terms}`);
  }

  return parts.join('\n');
}

/**
 * Get the compiled system prompt for current settings
 */
export async function getCompiledSystemPrompt(): Promise<string> {
  const store = await loadPreferences();

  const activeProfile = store.activeProfileId
    ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
    : undefined;

  return buildSystemPrompt(store.baseStyle, activeProfile);
}

/**
 * Build complete messages array for LLM call
 */
export async function buildMessages(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
  const systemPrompt = await getCompiledSystemPrompt();

  return [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];
}
