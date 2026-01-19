/**
 * LLM-Powered Style Analyzer
 *
 * Analyzes before/after pairs from ChatGPT history to learn writing style.
 * Uses GPT-4 to understand what the user changed and why.
 */

import type { ParsedConversation, BaseStyle, AudienceProfile } from '@/types';
import { createProvider } from '@/providers/base';

/**
 * A correction pair: what ChatGPT wrote vs what the user wanted
 */
interface CorrectionPair {
  conversationId: string;
  conversationTitle: string;
  originalAssistant: string;
  userCorrection: string;
  contextBefore?: string; // What the user originally asked
}

/**
 * Analyzed style pattern from LLM
 */
interface StylePattern {
  category: 'word_choice' | 'sentence_structure' | 'tone' | 'formatting' | 'content' | 'other';
  pattern: string;
  examples: string[];
  frequency: number;
}

/**
 * Full analysis result
 */
interface StyleAnalysisResult {
  patterns: StylePattern[];
  wordPreferences: { avoid: string[]; prefer: Record<string, string> };
  tonePreferences: string[];
  structurePreferences: string[];
  formattingPreferences: string[];
  summary: string;
}

/**
 * Filter conversations to only academic/grant writing
 */
export function filterAcademicConversations(
  conversations: ParsedConversation[]
): ParsedConversation[] {
  const academicKeywords = [
    // Paper-related
    'paper', 'manuscript', 'abstract', 'introduction', 'methods', 'results',
    'discussion', 'conclusion', 'figure', 'table', 'citation', 'reference',
    'journal', 'publication', 'review', 'revision', 'draft', 'edit',
    'paragraph', 'section', 'rewrite', 'improve', 'simplify', 'clarify',
    // Grant-related
    'grant', 'proposal', 'funding', 'nih', 'nsf', 'r01', 'r21', 'career',
    'specific aims', 'significance', 'innovation', 'approach', 'impact',
    'broader impacts', 'preliminary data', 'budget',
    // Scientific writing
    'hypothesis', 'experiment', 'data', 'analysis', 'findings', 'evidence',
    'demonstrate', 'suggest', 'indicate', 'conclude', 'methodology',
  ];

  // Keywords that indicate NOT academic writing
  const excludeKeywords = [
    'image', 'picture', 'generate', 'draw', 'dalle', 'midjourney',
    'code', 'function', 'error', 'bug', 'programming', 'javascript', 'python',
    'recipe', 'travel', 'movie', 'game', 'song', 'story',
  ];

  return conversations.filter((conv) => {
    const allText = conv.messages.map((m) => m.content.toLowerCase()).join(' ');
    const title = conv.title.toLowerCase();

    // Exclude if contains exclude keywords
    const hasExclude = excludeKeywords.some(
      (kw) => allText.includes(kw) || title.includes(kw)
    );
    if (hasExclude) return false;

    // Include if contains academic keywords
    const hasAcademic = academicKeywords.some(
      (kw) => allText.includes(kw) || title.includes(kw)
    );

    // Also include if it looks like editing (short back-and-forth)
    const hasEditingPattern = conv.messages.some((m) => {
      const lower = m.content.toLowerCase();
      return (
        lower.includes('make it') ||
        lower.includes('rewrite') ||
        lower.includes('edit this') ||
        lower.includes('improve') ||
        lower.includes('too') ||
        lower.includes('more concise') ||
        lower.includes('shorter') ||
        lower.includes('clearer')
      );
    });

    return hasAcademic || hasEditingPattern;
  });
}

/**
 * Extract correction pairs from conversations
 * Looks for patterns where:
 * 1. User asks for something
 * 2. Assistant responds
 * 3. User corrects or asks for revision
 */
export function extractCorrectionPairs(
  conversations: ParsedConversation[]
): CorrectionPair[] {
  const pairs: CorrectionPair[] = [];

  // Patterns that indicate user is correcting/revising
  const correctionIndicators = [
    'no,', 'no.', 'not quite', 'instead', 'actually', 'but', 'however',
    'make it', 'change', 'rewrite', 'edit', 'revise', 'try again',
    'shorter', 'longer', 'simpler', 'clearer', 'more', 'less', 'too',
    "don't", 'avoid', 'remove', 'without', 'not so', 'better if',
  ];

  for (const conv of conversations) {
    for (let i = 1; i < conv.messages.length; i++) {
      const prevMsg = conv.messages[i - 1];
      const currMsg = conv.messages[i];

      // Look for: assistant message followed by user correction
      if (prevMsg.role === 'assistant' && currMsg.role === 'user') {
        const userLower = currMsg.content.toLowerCase().trim();

        // Check if this looks like a correction
        const isCorrection = correctionIndicators.some((indicator) =>
          userLower.startsWith(indicator) || userLower.includes(` ${indicator}`)
        );

        // Also check if user provided alternative text (quoted or formatted)
        const hasAlternativeText =
          currMsg.content.includes('"') ||
          currMsg.content.includes("'") ||
          currMsg.content.length > 100; // Longer responses often contain rewrites

        if (isCorrection || hasAlternativeText) {
          // Get context (what user originally asked)
          const contextMsg = i >= 2 ? conv.messages[i - 2] : undefined;

          pairs.push({
            conversationId: conv.id,
            conversationTitle: conv.title,
            originalAssistant: prevMsg.content.slice(0, 2000), // Limit size
            userCorrection: currMsg.content.slice(0, 1000),
            contextBefore:
              contextMsg?.role === 'user'
                ? contextMsg.content.slice(0, 500)
                : undefined,
          });
        }
      }
    }
  }

  return pairs;
}

/**
 * Use LLM to analyze a batch of correction pairs
 */
async function analyzeCorrectionBatch(
  pairs: CorrectionPair[],
  apiKey: string
): Promise<string> {
  const provider = await createProvider({
    type: 'openai',
    apiKey,
    model: 'gpt-4o',
  });

  // Format pairs for analysis
  const pairsText = pairs
    .slice(0, 10) // Limit to 10 pairs per batch
    .map(
      (pair, i) => `
--- Correction ${i + 1} ---
Context: ${pair.contextBefore || 'N/A'}

ChatGPT wrote:
${pair.originalAssistant.slice(0, 800)}

User's feedback/correction:
${pair.userCorrection}
`
    )
    .join('\n');

  const prompt = `You are analyzing a user's WRITING STYLE preferences from their ChatGPT editing history.
These are instances where the user corrected ChatGPT's academic/scientific writing.

YOUR TASK: Identify words/phrases the user consistently wants AVOIDED.

ONLY flag words that are:
1. HYPE WORDS the user removes: "novel", "groundbreaking", "cutting-edge", "revolutionary", "unprecedented", "remarkable", "game-changing"
2. OVERLY VERBOSE phrases: "utilize" (use), "in order to" (to), "due to the fact that" (because), "at this point in time" (now)
3. INFORMAL language in academic context: "a lot", "really", "pretty much", "kind of"
4. FORMATTING the user removes: em-dashes, exclamation marks, emojis, excessive bold/headers

DO NOT flag:
- Contextual word choices like "demonstrated" vs "shown" or "emerged" vs "arose" - these are interchangeable
- Proper nouns, brand names, or topic-specific vocabulary
- One-time content changes

${pairsText}

Output a JSON object:
{
  "words_to_avoid": ["only words/phrases the user consistently removes or complains about"],
  "tone_preferences": ["specific tone preferences"],
  "structure_preferences": ["specific structure preferences"],
  "formatting_rules": ["e.g., no em-dashes, no bullet points, no emojis"],
  "length_preferences": ["e.g., prefers concise sentences"],
  "common_complaints": ["what the user repeatedly complains about"],
  "key_insights": ["other patterns"]
}

Be conservative - only include words the user CLEARLY and REPEATEDLY wants avoided.`;

  const result = await provider.complete({
    messages: [
      { role: 'system', content: 'You are a writing style analyst. Output only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
  });

  return result.content;
}

/**
 * Words that are interchangeable in academic writing - not worth flagging
 */
function isInterchangeableWord(word: string): boolean {
  const interchangeable = [
    // Verbs that are stylistic choices, not problems
    'demonstrated', 'shown', 'showed', 'displays', 'exhibited',
    'emerged', 'arose', 'appeared', 'developed', 'evolved',
    'indicated', 'suggested', 'implied', 'revealed',
    'conducted', 'performed', 'carried out', 'executed',
    'obtained', 'acquired', 'gained', 'received',
    'examined', 'investigated', 'explored', 'studied', 'analyzed',
    'found', 'discovered', 'identified', 'observed', 'noted',
    'reported', 'described', 'documented', 'recorded',
    'proposed', 'suggested', 'recommended', 'advocated',
    'confirmed', 'verified', 'validated', 'established',
    'increased', 'decreased', 'improved', 'enhanced', 'reduced',
    // Adjectives that are contextual
    'significant', 'substantial', 'considerable', 'notable',
    'important', 'key', 'critical', 'essential', 'crucial',
    'various', 'several', 'multiple', 'numerous',
    'recent', 'current', 'present', 'modern',
    'previous', 'prior', 'earlier', 'former',
    // Transition words
    'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore',
    'additionally', 'consequently', 'nevertheless', 'nonetheless',
  ];

  return interchangeable.includes(word.toLowerCase().trim());
}

/**
 * Check if a word looks like a proper noun or brand name
 */
function isProperNounOrBrand(word: string): boolean {
  // Known brand names and proper nouns to filter
  const brandNames = [
    'nordstrom', 'neiman marcus', 'target', 'walmart', 'amazon', 'google',
    'apple', 'microsoft', 'facebook', 'twitter', 'instagram', 'linkedin',
    'chatgpt', 'openai', 'anthropic', 'gpt', 'dalle', 'midjourney',
  ];

  const lower = word.toLowerCase().trim();
  if (brandNames.some((b) => lower.includes(b))) return true;

  // Check if it's a capitalized word that's likely a proper noun
  // (but allow common words that might be capitalized at sentence start)
  const commonWords = [
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'they',
    'we', 'you', 'i', 'he', 'she', 'our', 'their', 'its', 'my', 'your',
    'use', 'avoid', 'prefer', 'novel', 'new', 'important', 'significant',
  ];

  // If it starts with capital and isn't a common word, might be proper noun
  if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
    if (!commonWords.includes(lower)) {
      // Check if it looks like a name (capitalized, not all caps)
      if (word !== word.toUpperCase() && word.length > 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if two words/phrases are valid style substitutions
 * (same general meaning, different style)
 */
function isValidStyleSubstitution(avoid: string, prefer: string): boolean {
  // Known valid style substitutions (verbose → concise, hype → measured)
  const validPatterns: Array<[RegExp, RegExp]> = [
    // Verbose → Concise
    [/utilize/, /use/],
    [/implement/, /use|do|make/],
    [/facilitate/, /help|enable/],
    [/subsequently/, /then|later/],
    [/previously/, /before|earlier/],
    [/additionally/, /also/],
    [/furthermore/, /also|and/],
    [/however/, /but/],
    [/therefore/, /so/],
    [/consequently/, /so/],
    [/nevertheless/, /but|still/],
    [/approximately/, /about|around/],
    [/demonstrate/, /show/],
    [/indicate/, /show|suggest/],
    [/establish/, /show|set/],
    [/obtain/, /get/],
    [/require/, /need/],
    [/sufficient/, /enough/],
    [/numerous/, /many/],
    [/prior to/, /before/],
    [/in order to/, /to/],
    [/due to the fact/, /because/],
    [/at this point in time/, /now/],
    [/in the event that/, /if/],

    // Hype → Measured (academic tone)
    [/novel/, /new/],
    [/groundbreaking/, /significant|important/],
    [/revolutionary/, /significant|important|major/],
    [/cutting.?edge/, /recent|modern|current/],
    [/state.?of.?the.?art/, /current|best|leading/],
    [/paradigm.?shift/, /change|shift/],
    [/game.?chang/, /significant|important/],
    [/breakthrough/, /advance|finding|result/],
    [/remarkable/, /notable|significant/],
    [/tremendous/, /large|significant/],
    [/exceptional/, /notable|strong/],
    [/unprecedented/, /unusual|rare|first/],
    [/unique/, /distinct|specific|particular/],

    // Informal → Formal or vice versa
    [/a lot/, /many|much|numerous/],
    [/kind of/, /somewhat|rather/],
    [/sort of/, /somewhat|rather/],
    [/pretty/, /fairly|quite/],
    [/really/, /very|highly/],
    [/big/, /large|significant|substantial/],
    [/small/, /minor|limited/],
    [/get/, /obtain|receive|become/],
    [/show/, /demonstrate|indicate|reveal/],
  ];

  // Check if this matches a known valid pattern
  for (const [avoidPattern, preferPattern] of validPatterns) {
    if (avoidPattern.test(avoid) && preferPattern.test(prefer)) {
      return true;
    }
    // Also check reverse (user might prefer more formal language)
    if (preferPattern.test(avoid) && avoidPattern.test(prefer)) {
      return true;
    }
  }

  // For unknown pairs, check basic validity:
  // - Both should be common English words (not proper nouns/jargon)
  // - They should be roughly similar length (within 3x)
  // - Neither should contain numbers or special characters

  const avoidWords = avoid.split(/\s+/);
  const preferWords = prefer.split(/\s+/);

  // Length sanity check
  if (avoidWords.length > 5 || preferWords.length > 7) return false;

  // Check for numbers or special chars (likely content, not style)
  if (/\d/.test(avoid) || /\d/.test(prefer)) return false;
  if (/[^a-z\s\-']/.test(avoid) || /[^a-z\s\-']/.test(prefer)) return false;

  // If the words are identical, not a valid substitution
  if (avoid === prefer) return false;

  // Allow it if both are short and look like style words
  if (avoidWords.length <= 3 && preferWords.length <= 4) {
    return true;
  }

  return false;
}

/**
 * Parse LLM analysis results
 */
function parseAnalysisResults(
  results: string[]
): {
  wordPreferences: { avoid: string[]; prefer: Record<string, string> };
  tonePreferences: string[];
  structurePreferences: string[];
  formattingRules: string[];
  commonComplaints: string[];
  keyInsights: string[];
} {
  const merged = {
    wordPreferences: { avoid: [] as string[], prefer: {} as Record<string, string> },
    tonePreferences: [] as string[],
    structurePreferences: [] as string[],
    formattingRules: [] as string[],
    commonComplaints: [] as string[],
    keyInsights: [] as string[],
  };

  for (const result of results) {
    try {
      // Extract JSON from response (might be wrapped in markdown)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);

      // Merge words to avoid
      if (parsed.words_to_avoid) {
        for (const word of parsed.words_to_avoid) {
          if (!word || typeof word !== 'string') continue;

          const cleaned = word.toLowerCase().trim();

          // Skip proper nouns and brand names
          if (isProperNounOrBrand(word)) continue;

          // Skip very long phrases (likely content, not style)
          if (cleaned.split(' ').length > 5) continue;

          // Skip if it's a common interchangeable word (not truly problematic)
          if (isInterchangeableWord(cleaned)) continue;

          if (!merged.wordPreferences.avoid.includes(cleaned)) {
            merged.wordPreferences.avoid.push(cleaned);
          }
        }
      }

      // Also handle old format for backwards compatibility
      if (parsed.word_changes) {
        for (const change of parsed.word_changes) {
          if (!change.avoid) continue;
          const cleaned = change.avoid.toLowerCase().trim();
          if (isProperNounOrBrand(change.avoid)) continue;
          if (isInterchangeableWord(cleaned)) continue;
          if (!merged.wordPreferences.avoid.includes(cleaned)) {
            merged.wordPreferences.avoid.push(cleaned);
          }
        }
      }

      // Merge other arrays
      if (parsed.tone_preferences) {
        merged.tonePreferences.push(...parsed.tone_preferences);
      }
      if (parsed.structure_preferences) {
        merged.structurePreferences.push(...parsed.structure_preferences);
      }
      if (parsed.formatting_rules) {
        merged.formattingRules.push(...parsed.formatting_rules);
      }
      if (parsed.common_complaints) {
        merged.commonComplaints.push(...parsed.common_complaints);
      }
      if (parsed.key_insights) {
        merged.keyInsights.push(...parsed.key_insights);
      }
    } catch (err) {
      console.error('Failed to parse analysis result:', err);
    }
  }

  // Deduplicate
  merged.tonePreferences = [...new Set(merged.tonePreferences)];
  merged.structurePreferences = [...new Set(merged.structurePreferences)];
  merged.formattingRules = [...new Set(merged.formattingRules)];
  merged.commonComplaints = [...new Set(merged.commonComplaints)];
  merged.keyInsights = [...new Set(merged.keyInsights)];

  return merged;
}

/**
 * Generate a comprehensive style summary using LLM
 */
async function generateStyleSummary(
  analysis: ReturnType<typeof parseAnalysisResults>,
  apiKey: string
): Promise<string> {
  const provider = await createProvider({
    type: 'openai',
    apiKey,
    model: 'gpt-4o',
  });

  const prompt = `Based on this analysis of a user's writing preferences, generate a concise style guide that can be used as ChatGPT custom instructions.

Analysis:
- Words to avoid: ${analysis.wordPreferences.avoid.join(', ') || 'none identified'}
- Word substitutions: ${JSON.stringify(analysis.wordPreferences.prefer)}
- Tone preferences: ${analysis.tonePreferences.join('; ') || 'none identified'}
- Structure preferences: ${analysis.structurePreferences.join('; ') || 'none identified'}
- Formatting rules: ${analysis.formattingRules.join('; ') || 'none identified'}
- Common complaints: ${analysis.commonComplaints.join('; ') || 'none identified'}
- Key insights: ${analysis.keyInsights.join('; ') || 'none identified'}

Generate a clear, actionable style guide in this format:

WRITING STYLE:
[2-3 bullet points about overall style]

STRUCTURE:
[2-3 bullet points about how to structure content]

WORD CHOICE:
[specific words to avoid and prefer]

FORMATTING:
[specific formatting rules]

IMPORTANT:
[the most critical preferences this user has]

Be specific and actionable. This will be pasted directly into ChatGPT's custom instructions.`;

  const result = await provider.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  return result.content;
}

/**
 * Filter conversations using LLM based on user's extraction prompt
 */
async function filterConversationsWithLLM(
  conversations: ParsedConversation[],
  extractionPrompt: string,
  apiKey: string
): Promise<ParsedConversation[]> {
  // Create summaries of conversations for LLM to evaluate
  const summaries = conversations.slice(0, 200).map((conv, idx) => ({
    idx,
    title: conv.title,
    preview: conv.messages.slice(0, 3).map(m =>
      `${m.role}: ${m.content.slice(0, 150)}${m.content.length > 150 ? '...' : ''}`
    ).join('\n'),
  }));

  // Batch the summaries for efficiency
  const batchSize = 50;
  const relevantIndices: number[] = [];

  for (let i = 0; i < summaries.length; i += batchSize) {
    const batch = summaries.slice(i, i + batchSize);
    const batchText = batch.map(s =>
      `[${s.idx}] "${s.title}"\n${s.preview}`
    ).join('\n\n---\n\n');

    const provider = await createProvider({
      type: 'openai',
      apiKey,
      model: 'gpt-4o-mini',
    });

    const result = await provider.complete({
      messages: [
        {
          role: 'system',
          content: `You are helping filter ChatGPT conversation history based on user instructions.

User's focus: "${extractionPrompt}"

Given a list of conversations with their titles and previews, return ONLY the indices of conversations that match the user's focus. Return as a JSON array of numbers.

Example response: [0, 3, 7, 12]

If none match, return: []`,
        },
        {
          role: 'user',
          content: `Which of these conversations match my focus?\n\n${batchText}`,
        },
      ],
      temperature: 0.1,
    });

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const indices = JSON.parse(jsonStr);
      if (Array.isArray(indices)) {
        relevantIndices.push(...indices.filter((n: unknown) => typeof n === 'number'));
      }
    } catch {
      // If parsing fails, skip this batch
    }
  }

  // Return the filtered conversations
  const filtered = relevantIndices
    .filter(idx => idx >= 0 && idx < conversations.length)
    .map(idx => conversations[idx]);

  // If no matches found, fall back to all conversations (user can analyze everything)
  return filtered.length > 0 ? filtered : conversations.slice(0, 50);
}

/**
 * Main function: Analyze conversations and build style profile
 */
export async function analyzeWritingStyle(
  conversations: ParsedConversation[],
  apiKey: string,
  onProgress?: (message: string) => void,
  extractionPrompt?: string
): Promise<{
  analysis: ReturnType<typeof parseAnalysisResults>;
  styleSummary: string;
  correctionCount: number;
  conversationCount: number;
}> {
  const log = onProgress || console.log;

  let filtered: ParsedConversation[];

  // Step 1: Filter conversations based on extraction prompt or default to academic
  if (extractionPrompt) {
    log('Filtering conversations based on your instructions...');
    filtered = await filterConversationsWithLLM(conversations, extractionPrompt, apiKey);
    log(`Found ${filtered.length} relevant conversations based on your focus`);
  } else {
    log('Filtering to academic and grant writing conversations...');
    filtered = filterAcademicConversations(conversations);
    log(`Found ${filtered.length} relevant conversations (from ${conversations.length} total)`);
  }

  if (filtered.length === 0) {
    throw new Error(extractionPrompt
      ? 'No matching conversations found for your focus criteria'
      : 'No academic/grant writing conversations found in your history');
  }

  // Step 2: Extract correction pairs
  log('Extracting your corrections and edits...');
  const pairs = extractCorrectionPairs(filtered);
  log(`Found ${pairs.length} instances where you corrected ChatGPT's writing`);

  if (pairs.length === 0) {
    throw new Error('No correction patterns found. The system needs examples where you edited or corrected ChatGPT\'s writing.');
  }

  // Step 3: Analyze in batches
  log('Analyzing your editing patterns with GPT-4...');
  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    batches.push(pairs.slice(i, i + batchSize));
  }

  // Limit to 5 batches (50 corrections) to manage cost
  const batchesToAnalyze = batches.slice(0, 5);
  const analysisResults: string[] = [];

  for (let i = 0; i < batchesToAnalyze.length; i++) {
    log(`Analyzing batch ${i + 1}/${batchesToAnalyze.length}...`);
    const result = await analyzeCorrectionBatch(batchesToAnalyze[i], apiKey);
    analysisResults.push(result);
  }

  // Step 4: Parse and merge results
  log('Synthesizing patterns...');
  const analysis = parseAnalysisResults(analysisResults);

  // Step 5: Generate summary
  log('Generating style guide...');
  const styleSummary = await generateStyleSummary(analysis, apiKey);

  return {
    analysis,
    styleSummary,
    correctionCount: pairs.length,
    conversationCount: filtered.length,
  };
}

/**
 * Convert analysis to BaseStyle format
 */
export function analysisToBaseStyle(
  analysis: ReturnType<typeof parseAnalysisResults>
): Partial<BaseStyle> {
  const style: Partial<BaseStyle> = {
    avoidWords: analysis.wordPreferences.avoid.slice(0, 20),
    preferredWords: analysis.wordPreferences.prefer,
    learnedRules: [],
  };

  // Convert insights to learned rules
  const allInsights = [
    ...analysis.tonePreferences,
    ...analysis.structurePreferences,
    ...analysis.formattingRules,
    ...analysis.commonComplaints,
  ];

  style.learnedRules = allInsights.slice(0, 20).map((insight) => ({
    rule: insight,
    confidence: 0.9,
    source: 'inferred' as const,
    timestamp: new Date().toISOString(),
  }));

  // Detect formatting preferences
  const formatBans: string[] = [];
  const allRules = analysis.formattingRules.join(' ').toLowerCase();

  if (allRules.includes('no emoji') || allRules.includes('avoid emoji')) {
    formatBans.push('emoji');
  }
  if (allRules.includes('no em-dash') || allRules.includes('em dash') || allRules.includes('avoid dash')) {
    formatBans.push('em-dash');
  }
  if (allRules.includes('no bold') || allRules.includes('avoid bold')) {
    formatBans.push('bold');
  }
  if (allRules.includes('no bullet') || allRules.includes('avoid bullet') || allRules.includes('no list')) {
    formatBans.push('bullet-points');
  }

  style.formatBans = formatBans;

  // Detect verbosity preference
  const complaints = analysis.commonComplaints.join(' ').toLowerCase();
  if (complaints.includes('too long') || complaints.includes('verbose') || complaints.includes('wordy')) {
    style.verbosity = 'terse';
  } else if (complaints.includes('too short') || complaints.includes('more detail')) {
    style.verbosity = 'detailed';
  }

  return style;
}
