/**
 * Conversation Clusterer
 *
 * Groups conversations by detected type/audience to build
 * audience-specific style profiles.
 */

import type {
  ParsedConversation,
  ConversationCluster,
  StylePattern,
} from '@/types';

/**
 * Cluster conversations by their detected type
 */
export function clusterConversations(
  conversations: ParsedConversation[]
): ConversationCluster[] {
  // Group by detected type
  const groups = new Map<string, ParsedConversation[]>();

  for (const conv of conversations) {
    const type = conv.detectedType || 'general';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(conv);
  }

  // Convert to clusters with analysis
  const clusters: ConversationCluster[] = [];

  for (const [type, convs] of groups) {
    if (convs.length < 2) continue; // Skip single-conversation clusters

    clusters.push({
      id: `cluster-${type}`,
      name: formatClusterName(type),
      conversations: convs,
      keywords: extractClusterKeywords(convs),
      averageFormalityLevel: estimateFormalityLevel(convs),
      commonPatterns: extractCommonPatterns(convs),
    });
  }

  return clusters.sort((a, b) => b.conversations.length - a.conversations.length);
}

/**
 * Format cluster type into display name
 */
function formatClusterName(type: string): string {
  const names: Record<string, string> = {
    grant: 'Grant Writing',
    paper: 'Academic Papers',
    'high-impact-journal': 'High-Impact Journals',
    technical: 'Technical Documentation',
    general: 'General',
  };
  return names[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Extract common keywords across cluster conversations
 */
function extractClusterKeywords(conversations: ParsedConversation[]): string[] {
  const keywordCounts = new Map<string, number>();

  for (const conv of conversations) {
    const keywords = conv.keywords || [];
    for (const kw of keywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
    }
  }

  // Return keywords that appear in at least 20% of conversations
  const threshold = Math.max(2, conversations.length * 0.2);
  return Array.from(keywordCounts.entries())
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([kw]) => kw)
    .slice(0, 30);
}

/**
 * Estimate formality level from conversation content
 */
function estimateFormalityLevel(conversations: ParsedConversation[]): number {
  // Formality indicators
  const formalIndicators = [
    'furthermore',
    'moreover',
    'consequently',
    'therefore',
    'thus',
    'hereby',
    'whereas',
    'nevertheless',
    'notwithstanding',
    'accordingly',
    'subsequently',
    'hitherto',
  ];

  const informalIndicators = [
    'gonna',
    'wanna',
    'kinda',
    'sorta',
    'yeah',
    'yep',
    'nope',
    'hey',
    'cool',
    'awesome',
    'stuff',
    'thing',
    'like',
    'basically',
    'actually',
    'literally',
  ];

  let formalCount = 0;
  let informalCount = 0;
  let totalWords = 0;

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;

      const words = msg.content.toLowerCase().split(/\s+/);
      totalWords += words.length;

      for (const word of words) {
        if (formalIndicators.includes(word)) formalCount++;
        if (informalIndicators.includes(word)) informalCount++;
      }
    }
  }

  if (totalWords === 0) return 3;

  // Calculate formality score 1-5
  const formalRatio = formalCount / totalWords;
  const informalRatio = informalCount / totalWords;
  const netFormality = formalRatio - informalRatio;

  // Map to 1-5 scale
  if (netFormality > 0.01) return 5;
  if (netFormality > 0.005) return 4;
  if (netFormality > -0.005) return 3;
  if (netFormality > -0.01) return 2;
  return 1;
}

/**
 * Extract common patterns from user messages in cluster
 */
function extractCommonPatterns(
  conversations: ParsedConversation[]
): StylePattern[] {
  const patterns: StylePattern[] = [];

  // Analyze sentence starters
  const starters = new Map<string, string[]>();

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;

      const sentences = msg.content.split(/[.!?]+/).filter((s) => s.trim());
      for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/).slice(0, 3);
        if (words.length >= 2) {
          const starter = words.join(' ').toLowerCase();
          if (!starters.has(starter)) {
            starters.set(starter, []);
          }
          starters.get(starter)!.push(sentence.trim());
        }
      }
    }
  }

  // Find common starters
  for (const [starter, examples] of starters) {
    if (examples.length >= 3) {
      patterns.push({
        pattern: `Sentence starter: "${starter}..."`,
        examples: examples.slice(0, 3),
        frequency: examples.length,
        confidence: Math.min(examples.length / 10, 1),
      });
    }
  }

  // Analyze transition phrases
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
  ];

  const transitionCounts = new Map<string, number>();
  let totalUserMessages = 0;

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;
      totalUserMessages++;

      const lower = msg.content.toLowerCase();
      for (const trans of transitions) {
        if (lower.includes(trans)) {
          transitionCounts.set(trans, (transitionCounts.get(trans) || 0) + 1);
        }
      }
    }
  }

  // Add common transitions as patterns
  for (const [trans, count] of transitionCounts) {
    if (count >= 2) {
      patterns.push({
        pattern: `Uses transition: "${trans}"`,
        examples: [],
        frequency: count,
        confidence: Math.min(count / totalUserMessages, 1),
      });
    }
  }

  return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 20);
}

/**
 * Merge similar clusters if they're too small
 */
export function mergeSimilarClusters(
  clusters: ConversationCluster[],
  minSize: number = 5
): ConversationCluster[] {
  const result: ConversationCluster[] = [];
  const small: ConversationCluster[] = [];

  for (const cluster of clusters) {
    if (cluster.conversations.length >= minSize) {
      result.push(cluster);
    } else {
      small.push(cluster);
    }
  }

  // Merge small clusters into "general" or most similar larger cluster
  if (small.length > 0) {
    const generalCluster: ConversationCluster = {
      id: 'cluster-general',
      name: 'General Writing',
      conversations: small.flatMap((c) => c.conversations),
      keywords: extractClusterKeywords(small.flatMap((c) => c.conversations)),
      averageFormalityLevel: 3,
      commonPatterns: [],
    };

    if (generalCluster.conversations.length >= 2) {
      generalCluster.averageFormalityLevel = estimateFormalityLevel(
        generalCluster.conversations
      );
      generalCluster.commonPatterns = extractCommonPatterns(
        generalCluster.conversations
      );
      result.push(generalCluster);
    }
  }

  return result;
}
