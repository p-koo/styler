/**
 * Style Extractor
 *
 * Uses LLM to analyze conversations and extract writing style preferences.
 * Builds both base style (common across all) and audience-specific overlays.
 */

import type {
  ParsedConversation,
  ConversationCluster,
  BaseStyle,
  AudienceProfile,
  StylePattern,
  LearnedRule,
  StyleExtractionResult,
} from '@/types';
import { extractCorrections } from './chatgpt-parser';

// Default base style as starting point
const DEFAULT_BASE_STYLE: BaseStyle = {
  verbosity: 'moderate',
  sentencePatterns: [],
  paragraphStructure: [],
  preferredWords: {},
  avoidWords: [],
  formalityLevel: 3,
  hedgingStyle: 'balanced',
  activeVoicePreference: 0.7,
  formatBans: [],
  requiredFormats: [],
  argumentStyle: [],
  transitionPhrases: [],
  learnedRules: [],
};

/**
 * Extract base style from all conversations
 */
export function extractBaseStyle(
  conversations: ParsedConversation[]
): BaseStyle {
  const style: BaseStyle = { ...DEFAULT_BASE_STYLE };

  // Analyze user messages only
  const userMessages = conversations.flatMap((c) =>
    c.messages.filter((m) => m.role === 'user').map((m) => m.content)
  );

  if (userMessages.length === 0) return style;

  // Analyze verbosity
  style.verbosity = analyzeVerbosity(userMessages);

  // Analyze formality
  style.formalityLevel = analyzeFormalityLevel(userMessages);

  // Extract word preferences from corrections
  const corrections = extractCorrections(conversations);
  const wordPrefs = extractWordPreferences(corrections);
  style.preferredWords = wordPrefs.preferred;
  style.avoidWords = wordPrefs.avoid;

  // Extract hedging style
  style.hedgingStyle = analyzeHedgingStyle(userMessages);

  // Extract transition phrases
  style.transitionPhrases = extractTransitionPhrases(userMessages);

  // Convert corrections to learned rules
  style.learnedRules = correctionsToRules(corrections);

  // Detect format preferences from corrections
  const formatPrefs = detectFormatPreferences(corrections);
  style.formatBans = formatPrefs.bans;
  style.requiredFormats = formatPrefs.required;

  return style;
}

/**
 * Analyze verbosity preference from message lengths
 */
function analyzeVerbosity(
  messages: string[]
): 'terse' | 'moderate' | 'detailed' {
  const avgLength =
    messages.reduce((sum, m) => sum + m.split(/\s+/).length, 0) /
    messages.length;

  // Check for explicit verbosity corrections
  const verbosityIndicators = messages.filter(
    (m) =>
      m.toLowerCase().includes('shorter') ||
      m.toLowerCase().includes('more concise') ||
      m.toLowerCase().includes('brief') ||
      m.toLowerCase().includes('longer') ||
      m.toLowerCase().includes('more detail') ||
      m.toLowerCase().includes('elaborate')
  );

  const wantsShorter = verbosityIndicators.filter(
    (m) =>
      m.toLowerCase().includes('shorter') ||
      m.toLowerCase().includes('concise') ||
      m.toLowerCase().includes('brief')
  ).length;

  const wantsLonger = verbosityIndicators.filter(
    (m) =>
      m.toLowerCase().includes('longer') ||
      m.toLowerCase().includes('detail') ||
      m.toLowerCase().includes('elaborate')
  ).length;

  if (wantsShorter > wantsLonger) return 'terse';
  if (wantsLonger > wantsShorter) return 'detailed';

  // Fall back to average message length
  if (avgLength < 30) return 'terse';
  if (avgLength > 100) return 'detailed';
  return 'moderate';
}

/**
 * Analyze formality level from word choices
 */
function analyzeFormalityLevel(messages: string[]): number {
  const formalMarkers = [
    'furthermore',
    'moreover',
    'consequently',
    'therefore',
    'thus',
    'hereby',
    'whereas',
    'nevertheless',
    'accordingly',
    'subsequently',
    'demonstrate',
    'indicate',
    'utilize',
    'facilitate',
    'implement',
  ];

  const informalMarkers = [
    'gonna',
    'wanna',
    'kinda',
    'yeah',
    'yep',
    'nope',
    'cool',
    'awesome',
    'stuff',
    'thing',
    'basically',
    'pretty much',
    'a lot',
    'kind of',
    'sort of',
  ];

  let formalCount = 0;
  let informalCount = 0;

  for (const msg of messages) {
    const lower = msg.toLowerCase();
    for (const marker of formalMarkers) {
      if (lower.includes(marker)) formalCount++;
    }
    for (const marker of informalMarkers) {
      if (lower.includes(marker)) informalCount++;
    }
  }

  const total = formalCount + informalCount;
  if (total === 0) return 3;

  const formalRatio = formalCount / total;
  if (formalRatio > 0.8) return 5;
  if (formalRatio > 0.6) return 4;
  if (formalRatio > 0.4) return 3;
  if (formalRatio > 0.2) return 2;
  return 1;
}

/**
 * Extract word preferences from corrections
 */
function extractWordPreferences(
  corrections: Array<{
    original: string;
    correction: string;
    context: string;
    conversationId: string;
  }>
): { preferred: Record<string, string>; avoid: string[] } {
  const preferred: Record<string, string> = {};
  const avoid: string[] = [];

  // Common words to ignore (not meaningful preferences)
  const ignoreWords = new Set([
    'it', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as',
    'not', 'no', 'yes', 'any', 'all', 'some', 'more', 'less', 'very',
    'just', 'only', 'also', 'so', 'if', 'or', 'and', 'but', 'then',
  ]);

  // Look for explicit "don't say/use X" patterns with quoted words
  const dontSayQuotedPattern =
    /(?:don'?t|do not|never|avoid|stop)\s+(?:say(?:ing)?|us(?:e|ing)|writ(?:e|ing))\s+["']([^"']+)["']/gi;

  // Look for "use X instead of Y" patterns with quoted words
  const useInsteadPattern =
    /(?:use|say|write)\s+["']([^"']+)["']\s+instead\s+of\s+["']([^"']+)["']/gi;

  // Look for "replace X with Y" patterns
  const replacePattern =
    /(?:replace|change)\s+["']([^"']+)["']\s+(?:with|to)\s+["']([^"']+)["']/gi;

  for (const corr of corrections) {
    const text = corr.correction;

    // Check "don't say X" patterns (quoted only)
    let match;
    while ((match = dontSayQuotedPattern.exec(text)) !== null) {
      const avoidWord = match[1].toLowerCase().trim();
      if (avoidWord.length > 1 && avoidWord.length < 30 && !ignoreWords.has(avoidWord)) {
        avoid.push(avoidWord);
      }
    }

    // Check "use X instead of Y" patterns
    while ((match = useInsteadPattern.exec(text)) !== null) {
      const preferWord = match[1].toLowerCase().trim();
      const avoidWord = match[2].toLowerCase().trim();

      if (avoidWord.length > 1 && !ignoreWords.has(avoidWord)) {
        preferred[avoidWord] = preferWord;
        avoid.push(avoidWord);
      }
    }

    // Check "replace X with Y" patterns
    while ((match = replacePattern.exec(text)) !== null) {
      const avoidWord = match[1].toLowerCase().trim();
      const preferWord = match[2].toLowerCase().trim();

      if (avoidWord.length > 1 && !ignoreWords.has(avoidWord)) {
        preferred[avoidWord] = preferWord;
        avoid.push(avoidWord);
      }
    }
  }

  return { preferred, avoid: [...new Set(avoid)] };
}

/**
 * Analyze hedging style from user's writing
 */
function analyzeHedgingStyle(
  messages: string[]
): 'confident' | 'cautious' | 'balanced' {
  const confidentMarkers = [
    'clearly',
    'obviously',
    'certainly',
    'definitely',
    'undoubtedly',
    'demonstrates',
    'proves',
    'shows that',
    'establishes',
  ];

  const cautiousMarkers = [
    'may',
    'might',
    'could',
    'possibly',
    'potentially',
    'suggests',
    'appears',
    'seems',
    'likely',
    'probable',
  ];

  let confidentCount = 0;
  let cautiousCount = 0;

  for (const msg of messages) {
    const lower = msg.toLowerCase();
    for (const marker of confidentMarkers) {
      if (lower.includes(marker)) confidentCount++;
    }
    for (const marker of cautiousMarkers) {
      if (lower.includes(marker)) cautiousCount++;
    }
  }

  const total = confidentCount + cautiousCount;
  if (total === 0) return 'balanced';

  const confidentRatio = confidentCount / total;
  if (confidentRatio > 0.6) return 'confident';
  if (confidentRatio < 0.4) return 'cautious';
  return 'balanced';
}

/**
 * Extract common transition phrases
 */
function extractTransitionPhrases(messages: string[]): string[] {
  const transitions = [
    'however',
    'therefore',
    'furthermore',
    'additionally',
    'moreover',
    'in contrast',
    'on the other hand',
    'as a result',
    'consequently',
    'specifically',
    'for example',
    'in particular',
    'notably',
    'importantly',
    'significantly',
    'interestingly',
    'first',
    'second',
    'finally',
    'in summary',
    'to summarize',
    'in conclusion',
  ];

  const counts = new Map<string, number>();

  for (const msg of messages) {
    const lower = msg.toLowerCase();
    for (const trans of transitions) {
      if (lower.includes(trans)) {
        counts.set(trans, (counts.get(trans) || 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([trans]) => trans);
}

/**
 * Convert corrections to learned rules
 */
function correctionsToRules(
  corrections: Array<{
    original: string;
    correction: string;
    context: string;
    conversationId: string;
  }>
): LearnedRule[] {
  const rules: LearnedRule[] = [];

  // Patterns that indicate a request, not a style directive
  const requestPatterns = [
    /^(improve|edit|rewrite|simplify|make|change|update|fix|help|can you|please|could you)/i,
    /this (abstract|paragraph|sentence|text|section|draft)/i,
    /^["'].*["']$/,  // Just quoted text
    /:\s*["']/,  // Contains quoted content to edit
  ];

  // Patterns that indicate actual style directives
  const directivePatterns = [
    /^(don'?t|do not|never|always|avoid|prefer|use|keep|ensure)/i,
    /\b(too|more|less)\s+(verbose|concise|formal|informal|technical|simple)/i,
    /\b(shorter|longer|clearer|simpler|more precise)\b/i,
    /\b(remove|add|include|exclude)\s+(the\s+)?(emoji|bold|headers|bullets)/i,
  ];

  for (const corr of corrections) {
    const text = corr.correction.trim();

    // Skip very short or very long corrections
    if (text.length < 15 || text.length > 300) continue;

    // Skip if it looks like a content request (not a style directive)
    const isRequest = requestPatterns.some(p => p.test(text));
    const isDirective = directivePatterns.some(p => p.test(text));

    // Only include if it looks like a style directive, not a request
    if (isRequest && !isDirective) continue;

    // Skip if it contains a lot of quoted/pasted content
    const quoteCount = (text.match(/["']/g) || []).length;
    if (quoteCount > 4) continue;

    rules.push({
      rule: text,
      confidence: isDirective ? 0.8 : 0.5,
      source: 'inferred',
      timestamp: new Date().toISOString(),
      examples: [],
    });
  }

  // Deduplicate similar rules
  return deduplicateRules(rules).slice(0, 20);
}

/**
 * Deduplicate similar rules
 */
function deduplicateRules(rules: LearnedRule[]): LearnedRule[] {
  const unique: LearnedRule[] = [];

  for (const rule of rules) {
    const isDuplicate = unique.some((existing) => {
      const similarity = calculateSimilarity(
        existing.rule.toLowerCase(),
        rule.rule.toLowerCase()
      );
      return similarity > 0.7;
    });

    if (!isDuplicate) {
      unique.push(rule);
    }
  }

  return unique;
}

/**
 * Simple string similarity (Jaccard on words)
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));

  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Detect format preferences from corrections
 */
function detectFormatPreferences(
  corrections: Array<{
    original: string;
    correction: string;
    context: string;
    conversationId: string;
  }>
): { bans: string[]; required: string[] } {
  const banCounts = new Map<string, number>();
  const requireCounts = new Map<string, number>();

  const banPatterns: Record<string, string[]> = {
    emoji: ['no emoji', 'without emoji', "don't use emoji", 'remove emoji', 'no emojis'],
    'em-dash': ['no em-dash', 'no em dash', "don't use em-dash", 'avoid dashes', 'no dashes'],
    exclamation: [
      'no exclamation',
      "don't use exclamation",
      'avoid exclamation',
    ],
    headers: ['no headers', 'without headers', "don't use headers", 'remove headers'],
    'bullet-points': ['no bullets', 'no bullet points', 'without bullets', 'no lists', 'remove bullets'],
    bold: ['no bold', 'without bold', "don't bold", 'remove bold'],
    italics: ['no italics', 'without italics', "don't italicize"],
  };

  const requirePatterns: Record<string, string[]> = {
    'code-blocks': ['use code blocks', 'with code blocks', 'in code blocks', 'add code block'],
    'bullet-points': [
      'use bullets',
      'add bullets',
      'make it a list',
      'bulleted list',
      'format as list',
    ],
    headers: ['use headers', 'with headers', 'add headers', 'add a header'],
    numbered: ['numbered list', 'numbered steps', 'use numbers', 'add numbers'],
  };

  for (const corr of corrections) {
    const lower = corr.correction.toLowerCase();

    for (const [format, patterns] of Object.entries(banPatterns)) {
      if (patterns.some((p) => lower.includes(p))) {
        banCounts.set(format, (banCounts.get(format) || 0) + 1);
      }
    }

    for (const [format, patterns] of Object.entries(requirePatterns)) {
      if (patterns.some((p) => lower.includes(p))) {
        requireCounts.set(format, (requireCounts.get(format) || 0) + 1);
      }
    }
  }

  // Resolve conflicts: if both ban and require exist for same format,
  // use whichever has more occurrences. On tie, ban wins (explicit negative feedback).
  const bans: string[] = [];
  const required: string[] = [];

  const allFormats = new Set([...banCounts.keys(), ...requireCounts.keys()]);

  for (const format of allFormats) {
    const banCount = banCounts.get(format) || 0;
    const reqCount = requireCounts.get(format) || 0;

    if (banCount >= reqCount && banCount > 0) {
      bans.push(format);
    } else if (reqCount > banCount) {
      required.push(format);
    }
  }

  return { bans, required };
}

/**
 * Create audience profile from conversation cluster
 */
export function createAudienceProfile(
  cluster: ConversationCluster,
  baseStyle: BaseStyle
): AudienceProfile {
  const conversations = cluster.conversations;
  const userMessages = conversations.flatMap((c) =>
    c.messages.filter((m) => m.role === 'user').map((m) => m.content)
  );

  // Determine jargon level
  const jargonLevel = estimateJargonLevel(userMessages, cluster.name);

  // Extract emphasis points based on cluster type
  const emphasisPoints = extractEmphasisPoints(cluster.name, userMessages);

  // Calculate overrides from base style
  const overrides: Partial<BaseStyle> = {};

  // Adjust formality if different from base
  if (Math.abs(cluster.averageFormalityLevel - baseStyle.formalityLevel) > 1) {
    overrides.formalityLevel = cluster.averageFormalityLevel;
  }

  // Adjust verbosity based on cluster type
  if (cluster.name.includes('Grant')) {
    overrides.verbosity = 'detailed';
  } else if (cluster.name.includes('High-Impact')) {
    overrides.verbosity = 'terse';
  }

  // Filter discipline terms to only meaningful ones
  const filteredTerms = filterDisciplineTerms(cluster.keywords);

  return {
    id: cluster.id,
    name: cluster.name,
    description: `Auto-generated profile from ${conversations.length} conversations`,
    source: 'inferred',
    inferredFrom: conversations.map((c) => c.id),
    overrides,
    jargonLevel,
    disciplineTerms: filteredTerms.slice(0, 15),
    emphasisPoints,
    framingGuidance: generateFramingGuidance(cluster.name),
    lengthGuidance: getLengthGuidance(cluster.name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Filter discipline terms to only meaningful domain-specific words
 */
function filterDisciplineTerms(keywords: string[]): string[] {
  // Common words that aren't meaningful domain terms
  const ignoreTerms = new Set([
    'this', 'that', 'these', 'those', 'here', 'there', 'however', 'therefore',
    'while', 'although', 'because', 'since', 'when', 'where', 'what', 'which',
    'first', 'second', 'third', 'finally', 'also', 'additionally', 'furthermore',
    'moreover', 'indeed', 'thus', 'hence', 'the', 'and', 'but', 'for', 'with',
    'can', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'our', 'your', 'their', 'its', 'his', 'her', 'we', 'you', 'they',
    'new', 'old', 'good', 'bad', 'great', 'best', 'more', 'less', 'most',
    'very', 'really', 'just', 'only', 'still', 'even', 'now', 'then',
  ]);

  return keywords.filter(term => {
    const lower = term.toLowerCase();
    // Skip if in ignore list
    if (ignoreTerms.has(lower)) return false;
    // Skip if too short
    if (term.length < 3) return false;
    // Skip if all caps (likely acronym without context)
    if (term === term.toUpperCase() && term.length < 4) return false;
    // Keep multi-word terms (likely meaningful)
    if (term.includes(' ')) return true;
    // Keep if it looks like a technical term (has numbers or mixed case)
    if (/\d/.test(term) || /[A-Z].*[a-z].*[A-Z]/.test(term)) return true;
    // Keep longer single words
    return term.length >= 5;
  });
}

/**
 * Estimate jargon level from messages
 */
function estimateJargonLevel(
  messages: string[],
  clusterName: string
): 'minimal' | 'moderate' | 'heavy' {
  // High-impact journals typically need less jargon (broader audience)
  if (clusterName.includes('High-Impact')) return 'minimal';

  // Technical documentation uses heavy jargon
  if (clusterName.includes('Technical')) return 'heavy';

  // Default to moderate
  return 'moderate';
}

/**
 * Extract emphasis points based on cluster type
 */
function extractEmphasisPoints(
  clusterName: string,
  messages: string[]
): string[] {
  const emphasisByType: Record<string, string[]> = {
    'Grant Writing': [
      'significance',
      'innovation',
      'approach',
      'impact',
      'feasibility',
    ],
    'Academic Papers': [
      'methodology',
      'results',
      'implications',
      'limitations',
    ],
    'High-Impact Journals': [
      'novelty',
      'broad significance',
      'key findings',
      'accessibility',
    ],
    'Technical Documentation': [
      'clarity',
      'precision',
      'completeness',
      'examples',
    ],
  };

  return emphasisByType[clusterName] || [];
}

/**
 * Generate framing guidance based on cluster type
 */
function generateFramingGuidance(clusterName: string): string[] {
  const guidanceByType: Record<string, string[]> = {
    'Grant Writing': [
      'Lead with the problem and its significance',
      'Emphasize innovation and differentiation from existing work',
      'Connect to broader impacts and applications',
      'Be specific about methods and feasibility',
    ],
    'Academic Papers': [
      'Present findings objectively',
      'Acknowledge limitations upfront',
      'Connect to existing literature',
      'Be precise about methodology',
    ],
    'High-Impact Journals': [
      'Lead with the key finding or insight',
      'Make the significance accessible to non-specialists',
      'Be concise - every word counts',
      'Focus on what makes this work transformative',
    ],
    'Technical Documentation': [
      'Be precise and unambiguous',
      'Include concrete examples',
      'Define terms before using them',
      'Structure for easy reference',
    ],
  };

  return guidanceByType[clusterName] || [];
}

/**
 * Get length guidance based on cluster type
 */
function getLengthGuidance(
  clusterName: string
): AudienceProfile['lengthGuidance'] {
  if (clusterName.includes('High-Impact')) {
    return { target: 'concise' };
  }
  if (clusterName.includes('Grant')) {
    return { target: 'comprehensive' };
  }
  return { target: 'standard' };
}

/**
 * Full style extraction pipeline
 */
export function extractStylesFromConversations(
  conversations: ParsedConversation[],
  clusters: ConversationCluster[]
): { baseStyle: BaseStyle; audienceProfiles: AudienceProfile[] } {
  // Extract base style from all conversations
  const baseStyle = extractBaseStyle(conversations);

  // Create audience profiles from each cluster
  const audienceProfiles = clusters.map((cluster) =>
    createAudienceProfile(cluster, baseStyle)
  );

  return { baseStyle, audienceProfiles };
}
