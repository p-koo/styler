/**
 * Edit Orchestrator Agent
 *
 * Coordinates between the edit agent and critique agent to produce
 * high-quality edits that align with user preferences. Dynamically
 * updates document-specific preferences based on critique feedback.
 */

import type {
  BaseStyle,
  AudienceProfile,
  DocumentPreferences,
  DocumentAdjustments,
  CritiqueAnalysis,
  CritiqueIssue,
} from '@/types';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { buildSystemPrompt } from './prompt-agent';
import {
  critiqueEdit,
  applyAdjustmentsToStyle,
  buildDocumentContextPrompt,
  DEFAULT_ADJUSTMENTS,
} from './critique-agent';
import {
  getOrCreateDocumentPreferences,
  saveDocumentPreferences,
} from '@/memory/document-preferences';

// Orchestrator configuration
const CONFIG = {
  maxRetries: 3,                    // Max edit attempts before giving up
  alignmentThreshold: 0.8,          // Minimum alignment score to show to user
  strongMisalignmentThreshold: 0.5, // Below this, apply stronger corrections
  adjustmentStrength: {
    normal: 0.3,                    // How much to adjust per iteration
    strong: 0.6,                    // Adjustment for strong misalignment
  },
};

export interface OrchestrationResult {
  editedText: string;
  originalText: string;
  paragraphIndex: number;
  critique: CritiqueAnalysis;
  iterations: number;
  documentPreferences: DocumentPreferences;
  convergenceHistory: Array<{
    attempt: number;
    alignmentScore: number;
    adjustmentsMade: string[];
  }>;
}

export interface OrchestrationRequest {
  paragraphs: string[];
  paragraphIndex: number;
  instruction?: string;
  profileId?: string;
  documentId: string;
  documentStructure?: {
    title: string;
    documentType: string;
    sections: Array<{
      id: string;
      name: string;
      type: string;
      startParagraph: number;
      endParagraph: number;
      purpose: string;
    }>;
    keyTerms: string[];
    mainArgument: string;
  };
  model?: string;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
}

/**
 * Main orchestration function - coordinates edit generation and critique
 */
export async function orchestrateEdit(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const {
    paragraphs,
    paragraphIndex,
    instruction,
    documentId,
    documentStructure,
    model,
    baseStyle,
    audienceProfile,
  } = request;

  const currentParagraph = paragraphs[paragraphIndex];

  // Get or create document preferences
  let documentPrefs = await getOrCreateDocumentPreferences(
    documentId,
    audienceProfile?.id || null
  );

  const convergenceHistory: OrchestrationResult['convergenceHistory'] = [];
  let bestEdit = currentParagraph;
  let bestCritique: CritiqueAnalysis = {
    alignmentScore: 0,
    predictedAcceptance: 0,
    issues: [],
    suggestions: [],
  };
  let iterations = 0;

  // Find current section for context
  let currentSection: NonNullable<OrchestrationRequest['documentStructure']>['sections'][0] | undefined;
  if (documentStructure?.sections) {
    currentSection = documentStructure.sections.find(
      (s) => paragraphIndex >= s.startParagraph && paragraphIndex <= s.endParagraph
    );
  }

  // Orchestration loop
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    iterations = attempt;

    // Apply current document preferences to base style
    const adjustedStyle = applyAdjustmentsToStyle(baseStyle, documentPrefs.adjustments);

    // Generate edit with current preferences
    const editedText = await generateEdit({
      paragraphs,
      paragraphIndex,
      instruction,
      documentStructure,
      model,
      baseStyle: adjustedStyle,
      audienceProfile,
      documentAdjustments: documentPrefs.adjustments,
      previousAttempt: attempt > 1 ? bestEdit : undefined,
      previousIssues: attempt > 1 ? bestCritique.issues : undefined,
    });

    // Critique the edit
    const critique = await critiqueEdit({
      originalText: currentParagraph,
      suggestedEdit: editedText,
      baseStyle: adjustedStyle,
      audienceProfile,
      documentPreferences: documentPrefs,
      sectionType: currentSection?.type,
      model,
    });

    // Track this attempt
    const adjustmentsMade: string[] = [];

    // Update best if this is better
    if (critique.alignmentScore > bestCritique.alignmentScore) {
      bestEdit = editedText;
      bestCritique = critique;
    }

    // Check if we've reached acceptable alignment
    if (critique.alignmentScore >= CONFIG.alignmentThreshold) {
      convergenceHistory.push({
        attempt,
        alignmentScore: critique.alignmentScore,
        adjustmentsMade: ['Alignment threshold met'],
      });
      break;
    }

    // Apply corrections based on critique
    const isStrongMisalignment = critique.alignmentScore < CONFIG.strongMisalignmentThreshold;
    const strength = isStrongMisalignment
      ? CONFIG.adjustmentStrength.strong
      : CONFIG.adjustmentStrength.normal;

    // Update document preferences based on critique issues
    const updatedPrefs = applyCorrectionsFromCritique(
      documentPrefs,
      critique,
      strength
    );

    // Track what adjustments were made
    if (updatedPrefs.adjustments.verbosityAdjust !== documentPrefs.adjustments.verbosityAdjust) {
      adjustmentsMade.push(`Verbosity: ${documentPrefs.adjustments.verbosityAdjust.toFixed(2)} → ${updatedPrefs.adjustments.verbosityAdjust.toFixed(2)}`);
    }
    if (updatedPrefs.adjustments.formalityAdjust !== documentPrefs.adjustments.formalityAdjust) {
      adjustmentsMade.push(`Formality: ${documentPrefs.adjustments.formalityAdjust.toFixed(2)} → ${updatedPrefs.adjustments.formalityAdjust.toFixed(2)}`);
    }
    if (updatedPrefs.adjustments.hedgingAdjust !== documentPrefs.adjustments.hedgingAdjust) {
      adjustmentsMade.push(`Hedging: ${documentPrefs.adjustments.hedgingAdjust.toFixed(2)} → ${updatedPrefs.adjustments.hedgingAdjust.toFixed(2)}`);
    }

    documentPrefs = updatedPrefs;

    convergenceHistory.push({
      attempt,
      alignmentScore: critique.alignmentScore,
      adjustmentsMade,
    });

    // Don't retry on last attempt
    if (attempt === CONFIG.maxRetries) {
      break;
    }
  }

  // Save the updated document preferences
  await saveDocumentPreferences(documentPrefs);

  return {
    editedText: bestEdit,
    originalText: currentParagraph,
    paragraphIndex,
    critique: bestCritique,
    iterations,
    documentPreferences: documentPrefs,
    convergenceHistory,
  };
}

/**
 * Generate an edit using the LLM
 */
async function generateEdit(params: {
  paragraphs: string[];
  paragraphIndex: number;
  instruction?: string;
  documentStructure?: OrchestrationRequest['documentStructure'];
  model?: string;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  documentAdjustments?: DocumentAdjustments;
  previousAttempt?: string;
  previousIssues?: CritiqueIssue[];
}): Promise<string> {
  const {
    paragraphs,
    paragraphIndex,
    instruction,
    documentStructure,
    model,
    baseStyle,
    audienceProfile,
    documentAdjustments,
    previousAttempt,
    previousIssues,
  } = params;

  const currentParagraph = paragraphs[paragraphIndex];

  // Find current section
  let currentSection: NonNullable<OrchestrationRequest['documentStructure']>['sections'][0] | undefined;
  if (documentStructure?.sections) {
    currentSection = documentStructure.sections.find(
      (s) => paragraphIndex >= s.startParagraph && paragraphIndex <= s.endParagraph
    );
  }

  // Build context from surrounding paragraphs
  const contextSize = 2;
  const startBefore = Math.max(0, paragraphIndex - contextSize);
  const endAfter = Math.min(paragraphs.length, paragraphIndex + contextSize + 1);
  const beforeParagraphs = paragraphs.slice(startBefore, paragraphIndex);
  const afterParagraphs = paragraphs.slice(paragraphIndex + 1, endAfter);

  // Build style prompt
  const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);

  // Build the context-aware prompt
  const contextParts: string[] = [];
  contextParts.push(stylePrompt);
  contextParts.push('');
  contextParts.push('---');
  contextParts.push('');
  contextParts.push('You are editing a specific paragraph within a larger document.');
  contextParts.push('');

  // Add document-level context
  if (documentStructure) {
    contextParts.push('DOCUMENT CONTEXT:');
    contextParts.push(`Title: ${documentStructure.title}`);
    contextParts.push(`Type: ${documentStructure.documentType}`);
    contextParts.push(`Main argument: ${documentStructure.mainArgument}`);
    contextParts.push('');
  }

  // Add section-specific guidance
  if (currentSection) {
    contextParts.push(`CURRENT SECTION: ${currentSection.name} (${currentSection.type})`);
    contextParts.push(`Section purpose: ${currentSection.purpose}`);
    contextParts.push('');
  }

  // Add key terms
  if (documentStructure?.keyTerms && documentStructure.keyTerms.length > 0) {
    contextParts.push('KEY TERMS:');
    documentStructure.keyTerms.forEach((t) => contextParts.push(`- ${t}`));
    contextParts.push('');
  }

  // Add document-specific context from learned preferences and imported constraints
  if (documentAdjustments) {
    const docContextPrompt = buildDocumentContextPrompt(documentAdjustments);
    if (docContextPrompt.trim()) {
      contextParts.push(docContextPrompt);
    }
  }

  // Add surrounding context
  if (beforeParagraphs.length > 0) {
    contextParts.push('PRECEDING PARAGRAPHS (for context, do not edit):');
    beforeParagraphs.forEach((p, i) => {
      contextParts.push(`[Paragraph ${startBefore + i + 1}]: ${p}`);
    });
    contextParts.push('');
  }

  contextParts.push('PARAGRAPH TO EDIT:');
  contextParts.push(currentParagraph);
  contextParts.push('');

  if (afterParagraphs.length > 0) {
    contextParts.push('FOLLOWING PARAGRAPHS (for context, do not edit):');
    afterParagraphs.forEach((p, i) => {
      contextParts.push(`[Paragraph ${paragraphIndex + 2 + i}]: ${p}`);
    });
    contextParts.push('');
  }

  // Add feedback from previous attempt if this is a retry
  if (previousAttempt && previousIssues && previousIssues.length > 0) {
    contextParts.push('---');
    contextParts.push('');
    contextParts.push('FEEDBACK ON PREVIOUS ATTEMPT:');
    contextParts.push('Your previous edit had these issues that need to be addressed:');
    previousIssues.forEach((issue) => {
      contextParts.push(`- ${issue.type}: ${issue.description}`);
    });
    contextParts.push('');
    contextParts.push('Please generate an improved version that addresses these issues.');
    contextParts.push('');
  }

  contextParts.push('---');
  contextParts.push('');

  // Build edit instruction - emphasize word cutting when in terse mode
  const isTerseMode = documentAdjustments && documentAdjustments.verbosityAdjust <= -0.5;
  const baseInstruction = instruction || 'Improve this paragraph according to my style preferences.';

  if (isTerseMode) {
    contextParts.push('EDIT INSTRUCTION: ' + baseInstruction);
    contextParts.push('');
    contextParts.push('⚠️ CRITICAL WORD COUNT REQUIREMENT ⚠️');
    contextParts.push('You MUST cut at least 30% of words. Count them. Original has approximately ' +
      currentParagraph.split(/\s+/).length + ' words.');
    contextParts.push('Your output MUST have fewer than ' +
      Math.floor(currentParagraph.split(/\s+/).length * 0.7) + ' words.');
    contextParts.push('If your edit is not significantly shorter, START OVER and cut more aggressively.');
  } else {
    contextParts.push(`EDIT INSTRUCTION: ${baseInstruction}`);
  }

  contextParts.push('');
  contextParts.push('Return ONLY the edited paragraph text. Do not include any explanation.');

  const systemPrompt = contextParts.join('\n');

  // Call LLM
  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  const result = await provider.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Please edit the paragraph now.' },
    ],
    temperature: 0.3,
  });

  // Clean up the response
  let editedText = result.content.trim();

  // Remove common prefixes
  const prefixesToRemove = [
    /^here'?s?\s+(the\s+)?edited\s+(paragraph|version|text):?\s*/i,
    /^edited\s+(paragraph|version|text):?\s*/i,
    /^the\s+edited\s+(paragraph|version|text):?\s*/i,
  ];

  for (const prefix of prefixesToRemove) {
    editedText = editedText.replace(prefix, '');
  }

  // Remove surrounding quotes
  if ((editedText.startsWith('"') && editedText.endsWith('"')) ||
      (editedText.startsWith("'") && editedText.endsWith("'"))) {
    editedText = editedText.slice(1, -1);
  }

  return editedText;
}

/**
 * Apply corrections to document preferences based on critique
 * NOTE: We only adjust word choices and avoid words here, NOT the slider values
 * (verbosity, formality, hedging). The slider values are user-controlled and
 * should only be changed through explicit user action or accept/reject learning.
 */
function applyCorrectionsFromCritique(
  prefs: DocumentPreferences,
  critique: CritiqueAnalysis,
  _strength: number
): DocumentPreferences {
  const newAdjustments = { ...prefs.adjustments };

  for (const issue of critique.issues) {
    switch (issue.type) {
      case 'word_choice':
        // Extract words to avoid from the issue description
        const wordMatch = issue.description.match(/["']([^"']+)["']/g);
        if (wordMatch) {
          const words = wordMatch.map(w => w.replace(/["']/g, ''));
          newAdjustments.additionalAvoidWords = [
            ...new Set([...newAdjustments.additionalAvoidWords, ...words]),
          ].slice(0, 50);
        }
        break;

      // Don't auto-adjust verbosity, formality, or hedging sliders
      // These should only change via user action or accept/reject learning
      case 'verbosity':
      case 'formality':
      case 'hedging':
      case 'tone':
      case 'structure':
        // No automatic adjustment - respect user's slider settings
        break;
    }
  }

  return {
    ...prefs,
    adjustments: newAdjustments,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Track rejection and apply stronger corrections
 */
export async function handleRejection(
  documentId: string,
  originalText: string,
  rejectedEdit: string,
  critique: CritiqueAnalysis,
  baseStyle: BaseStyle,
  audienceProfile?: AudienceProfile,
  model?: string
): Promise<DocumentPreferences> {
  let prefs = await getOrCreateDocumentPreferences(documentId, audienceProfile?.id || null);

  // Count recent rejections
  const recentDecisions = prefs.editHistory.slice(-10);
  const recentRejections = recentDecisions.filter(d => d.decision === 'rejected').length;

  // Apply stronger corrections if there's a pattern of rejections
  const strength = recentRejections >= 3
    ? CONFIG.adjustmentStrength.strong * 1.5  // Even stronger for persistent misalignment
    : CONFIG.adjustmentStrength.strong;

  // Apply corrections from critique
  prefs = applyCorrectionsFromCritique(prefs, critique, strength);

  // Save
  await saveDocumentPreferences(prefs);

  return prefs;
}

/**
 * Helper to clamp a number
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
