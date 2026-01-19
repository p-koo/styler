/**
 * ChatGPT Export Parser
 *
 * Parses the conversations.json file from ChatGPT data export
 * and extracts structured conversation data for analysis.
 */

import type {
  ChatGPTConversation,
  ChatGPTMessage,
  ParsedConversation,
} from '@/types';

/**
 * Parse raw ChatGPT export JSON into structured conversations
 */
export function parseChatGPTExport(
  rawData: ChatGPTConversation[]
): ParsedConversation[] {
  return rawData
    .map((conv) => parseConversation(conv))
    .filter((conv) => conv.messages.length > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Parse a single conversation from ChatGPT format
 */
function parseConversation(conv: ChatGPTConversation): ParsedConversation {
  const messages: ParsedConversation['messages'] = [];

  // Build message chain from mapping
  const messageChain = buildMessageChain(conv);

  for (const msg of messageChain) {
    if (!msg.message) continue;

    const role = msg.message.author.role;
    if (role !== 'user' && role !== 'assistant') continue;

    const content = extractContent(msg.message);
    if (!content || content.trim() === '') continue;

    messages.push({
      role,
      content,
      timestamp: msg.message.create_time
        ? new Date(msg.message.create_time * 1000)
        : undefined,
    });
  }

  return {
    id: conv.id,
    title: conv.title || 'Untitled',
    createdAt: new Date(conv.create_time * 1000),
    messages,
  };
}

/**
 * Build ordered message chain from conversation mapping
 */
function buildMessageChain(
  conv: ChatGPTConversation
): Array<{ id: string; message?: ChatGPTMessage }> {
  const chain: Array<{ id: string; message?: ChatGPTMessage }> = [];
  const mapping = conv.mapping;

  // Find root node (has no parent or parent is not in mapping)
  let currentId: string | undefined;

  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent || !mapping[node.parent]) {
      currentId = id;
      break;
    }
  }

  // Traverse from root to current_node following first child
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = mapping[currentId];

    if (node) {
      chain.push({ id: currentId, message: node.message });

      // Follow first child (main conversation branch)
      if (node.children && node.children.length > 0) {
        currentId = node.children[0];
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return chain;
}

/**
 * Extract text content from ChatGPT message format
 */
function extractContent(message: ChatGPTMessage): string {
  const content = message.content;

  if (content.parts && content.parts.length > 0) {
    // Filter out non-string parts (images, etc.)
    return content.parts
      .filter((part): part is string => typeof part === 'string')
      .join('\n');
  }

  if (content.text) {
    return content.text;
  }

  return '';
}

/**
 * Extract user corrections from conversation pairs
 * Looks for patterns like:
 * - User asks for something
 * - Assistant responds
 * - User corrects or asks for revision
 */
export function extractCorrections(
  conversations: ParsedConversation[]
): Array<{
  original: string;
  correction: string;
  context: string;
  conversationId: string;
}> {
  const corrections: Array<{
    original: string;
    correction: string;
    context: string;
    conversationId: string;
  }> = [];

  // Correction indicator phrases
  const correctionPhrases = [
    'no,',
    "don't",
    'instead',
    'actually',
    'please',
    'more',
    'less',
    'too',
    'not',
    'change',
    'rewrite',
    'revise',
    'shorter',
    'longer',
    'simpler',
    'clearer',
    'formal',
    'informal',
    'remove',
    'add',
    'avoid',
    "shouldn't",
    'without',
  ];

  for (const conv of conversations) {
    for (let i = 2; i < conv.messages.length; i++) {
      const prevAssistant = conv.messages[i - 1];
      const userMsg = conv.messages[i];

      if (prevAssistant.role !== 'assistant' || userMsg.role !== 'user') {
        continue;
      }

      const lowerContent = userMsg.content.toLowerCase();

      // Check if this looks like a correction
      const isCorrection = correctionPhrases.some(
        (phrase) =>
          lowerContent.startsWith(phrase) ||
          lowerContent.includes(` ${phrase} `)
      );

      if (isCorrection) {
        corrections.push({
          original: prevAssistant.content.slice(0, 500), // Truncate for storage
          correction: userMsg.content,
          context: conv.messages[i - 2]?.content.slice(0, 200) || '',
          conversationId: conv.id,
        });
      }
    }
  }

  return corrections;
}

/**
 * Detect conversation type based on content keywords
 */
export function detectConversationType(
  conv: ParsedConversation
): string | undefined {
  const allText = conv.messages.map((m) => m.content.toLowerCase()).join(' ');

  // Grant-related keywords
  const grantKeywords = [
    'grant',
    'funding',
    'nih',
    'nsf',
    'proposal',
    'specific aims',
    'significance',
    'innovation',
    'broader impacts',
    'r01',
    'r21',
    'career',
  ];

  // Paper/publication keywords
  const paperKeywords = [
    'manuscript',
    'paper',
    'journal',
    'publication',
    'abstract',
    'introduction',
    'methods',
    'results',
    'discussion',
    'figure',
    'table',
    'citation',
    'reference',
    'reviewer',
  ];

  // High-impact journal keywords
  const highImpactKeywords = [
    'nature',
    'science',
    'cell',
    'lancet',
    'nejm',
    'jama',
    'pnas',
  ];

  // Technical documentation keywords
  const technicalKeywords = [
    'documentation',
    'api',
    'code',
    'implementation',
    'function',
    'class',
    'method',
    'algorithm',
    'architecture',
  ];

  // Count keyword matches
  const grantScore = grantKeywords.filter((k) => allText.includes(k)).length;
  const paperScore = paperKeywords.filter((k) => allText.includes(k)).length;
  const highImpactScore = highImpactKeywords.filter((k) =>
    allText.includes(k)
  ).length;
  const technicalScore = technicalKeywords.filter((k) =>
    allText.includes(k)
  ).length;

  // Determine type based on highest score
  const scores = [
    { type: 'grant', score: grantScore, threshold: 2 },
    { type: 'paper', score: paperScore, threshold: 3 },
    { type: 'high-impact-journal', score: highImpactScore + paperScore, threshold: 4 },
    { type: 'technical', score: technicalScore, threshold: 3 },
  ];

  const best = scores
    .filter((s) => s.score >= s.threshold)
    .sort((a, b) => b.score - a.score)[0];

  return best?.type;
}

/**
 * Extract keywords from conversation
 */
export function extractKeywords(conv: ParsedConversation): string[] {
  const allText = conv.messages.map((m) => m.content).join(' ');

  // Simple keyword extraction: find capitalized multi-word phrases and technical terms
  const words = allText.split(/\s+/);
  const keywords = new Set<string>();

  // Extract capitalized phrases (potential proper nouns/terms)
  const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const matches = allText.match(capitalizedPattern) || [];
  matches.forEach((m) => {
    if (m.length > 3 && m.length < 50) {
      keywords.add(m);
    }
  });

  // Extract common academic/technical terms
  const academicTerms = [
    'hypothesis',
    'methodology',
    'analysis',
    'framework',
    'model',
    'data',
    'results',
    'conclusion',
    'evidence',
    'study',
    'research',
    'experiment',
  ];

  words.forEach((word) => {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    if (academicTerms.includes(lower)) {
      keywords.add(lower);
    }
  });

  return Array.from(keywords).slice(0, 20); // Limit to top 20
}

/**
 * Parse ChatGPT export file and add metadata
 */
export function parseAndAnnotate(
  rawData: ChatGPTConversation[]
): ParsedConversation[] {
  const parsed = parseChatGPTExport(rawData);

  return parsed.map((conv) => ({
    ...conv,
    detectedType: detectConversationType(conv),
    keywords: extractKeywords(conv),
  }));
}
