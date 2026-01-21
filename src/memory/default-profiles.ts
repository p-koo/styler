/**
 * Default Audience Profiles
 *
 * Pre-configured profiles for common academic and professional contexts.
 * These provide a starting point for users before they customize.
 */

import type { AudienceProfile } from '@/types';

export const DEFAULT_PROFILES: AudienceProfile[] = [
  {
    id: 'nature-science',
    name: 'Nature / Science',
    description: 'High-impact journal style: concise, accessible, significant claims with strong evidence',
    source: 'manual',
    overrides: {
      verbosity: 'moderate',
      formalityLevel: 4,
      hedgingStyle: 'balanced',
      activeVoicePreference: 0.8,
      formatBans: ['emoji', 'exclamation'],
      avoidWords: [
        'very', 'really', 'basically', 'actually', 'obviously',
        'clearly', 'of course', 'interestingly', 'importantly',
        'it is worth noting', 'it should be noted'
      ],
      learnedRules: [
        {
          rule: 'Lead with the key finding or insight, not background',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Use precise, quantitative language over vague qualifiers',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Connect findings to broader scientific significance',
          confidence: 0.85,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Keep sentences under 25 words when possible',
          confidence: 0.8,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
      ],
    },
    jargonLevel: 'moderate',
    disciplineTerms: [],
    emphasisPoints: [
      'Novelty and significance of findings',
      'Broader impact and implications',
      'Rigorous methodology',
      'Clear mechanistic insights',
    ],
    framingGuidance: [
      'Frame results in terms of what they reveal, not what was done',
      'Connect to outstanding questions in the field',
      'Emphasize what is new and why it matters',
      'Be direct about limitations but confident about conclusions',
    ],
    lengthGuidance: {
      target: 'concise',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ml-paper',
    name: 'ML Paper',
    description: 'Machine learning research: technical precision, clear methodology, reproducibility focus',
    source: 'manual',
    overrides: {
      verbosity: 'moderate',
      formalityLevel: 4,
      hedgingStyle: 'balanced',
      activeVoicePreference: 0.6,
      formatBans: ['emoji'],
      avoidWords: [
        'obviously', 'clearly', 'trivially', 'simply',
        'state-of-the-art', 'novel', 'first',
      ],
      learnedRules: [
        {
          rule: 'Be precise about what was compared and how',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Include confidence intervals or statistical significance',
          confidence: 0.85,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Avoid overclaiming - use "outperforms" only with proper baselines',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Describe ablations and what they reveal about the method',
          confidence: 0.8,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
      ],
    },
    jargonLevel: 'heavy',
    disciplineTerms: [
      'ablation', 'baseline', 'benchmark', 'hyperparameter',
      'architecture', 'downstream', 'upstream', 'fine-tuning',
      'pre-training', 'embedding', 'latent', 'representation',
    ],
    emphasisPoints: [
      'Technical contribution and novelty',
      'Empirical validation and ablations',
      'Reproducibility and implementation details',
      'Comparison to strong baselines',
    ],
    framingGuidance: [
      'Clearly state the problem and why existing solutions fall short',
      'Separate method description from experimental validation',
      'Be specific about datasets, metrics, and evaluation protocols',
      'Acknowledge limitations and failure cases',
    ],
    lengthGuidance: {
      target: 'standard',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'nih-grant',
    name: 'NIH Grant',
    description: 'NIH grant proposals: significance, innovation, approach, investigator qualifications',
    source: 'manual',
    overrides: {
      verbosity: 'detailed',
      formalityLevel: 4,
      hedgingStyle: 'balanced',
      activeVoicePreference: 0.7,
      formatBans: ['emoji', 'exclamation'],
      avoidWords: [
        'breakthrough', 'paradigm shift', 'revolutionary',
        'very', 'really', 'extremely', 'highly',
      ],
      learnedRules: [
        {
          rule: 'Start sections with clear, direct statements of significance',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Use "will" for proposed work, "have" for preliminary data',
          confidence: 0.85,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Connect each aim to the overall goal and public health relevance',
          confidence: 0.9,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
        {
          rule: 'Anticipate and address potential pitfalls with alternatives',
          confidence: 0.85,
          source: 'explicit',
          timestamp: new Date().toISOString(),
        },
      ],
    },
    jargonLevel: 'heavy',
    disciplineTerms: [],
    emphasisPoints: [
      'Significance and public health impact',
      'Innovation beyond current approaches',
      'Rigor and reproducibility',
      'Investigator qualifications and environment',
      'Feasibility with preliminary data',
    ],
    framingGuidance: [
      'Frame significance in terms of disease burden and unmet need',
      'Clearly articulate the gap in knowledge being addressed',
      'Emphasize innovation without overclaiming',
      'Demonstrate feasibility through preliminary data',
      'Show awareness of potential problems and alternative approaches',
    ],
    lengthGuidance: {
      target: 'comprehensive',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Get default profiles with fresh timestamps
 */
export function getDefaultProfiles(): AudienceProfile[] {
  const now = new Date().toISOString();
  return DEFAULT_PROFILES.map(profile => ({
    ...profile,
    createdAt: now,
    updatedAt: now,
    overrides: {
      ...profile.overrides,
      learnedRules: profile.overrides.learnedRules?.map(rule => ({
        ...rule,
        timestamp: now,
      })) || [],
    },
  }));
}
