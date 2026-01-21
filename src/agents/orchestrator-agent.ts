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
  ParagraphIntent,
  DocumentGoals,
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
import { loadConfig } from '@/memory/config-store';
import { analyzeIntent } from './intent-agent';

// Get orchestrator configuration (reads from config store with defaults)
function getConfig() {
  const appConfig = loadConfig();
  return {
    maxRetries: appConfig.maxRefinementLoops || 3,
    alignmentThreshold: appConfig.alignmentThreshold || 0.8,
    strongMisalignmentThreshold: 0.5, // Below this, apply stronger corrections
    adjustmentStrength: {
      normal: 0.3,                    // How much to adjust per iteration
      strong: 0.6,                    // Adjustment for strong misalignment
    },
  };
}

// Agent trace for transparency/debugging
export interface AgentTraceEntry {
  agent: 'intent' | 'prompt' | 'llm' | 'critique';
  timestamp: number;
  durationMs: number;
  summary: string;
  details?: Record<string, unknown>;
}

export interface OrchestrationResult {
  editedText: string;
  originalText: string;
  cellIndex: number;
  critique: CritiqueAnalysis;
  iterations: number;
  documentPreferences: DocumentPreferences;
  convergenceHistory: Array<{
    attempt: number;
    alignmentScore: number;
    adjustmentsMade: string[];
  }>;
  agentTrace: AgentTraceEntry[];
}

export type SyntaxMode = 'plain' | 'markdown' | 'latex' | 'code';

// User refinement context from iterative feedback
export interface RefinementContext {
  previousEdit: string;      // The previous suggested edit
  userCurrentText: string;   // Text after user toggled changes
  userFeedback: string;      // User's typed feedback
  rejectedChanges: string[]; // Descriptions of changes user reverted
}

export interface OrchestrationRequest {
  cells: string[];
  cellIndex: number;
  instruction?: string;
  profileId?: string;
  documentId: string;
  syntaxMode?: SyntaxMode;
  documentStructure?: {
    title: string;
    documentType: string;
    sections: Array<{
      id: string;
      name: string;
      type: string;
      startCell: number;
      endCell: number;
      purpose: string;
    }>;
    keyTerms: string[];
    mainArgument: string;
  };
  model?: string;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  refinementContext?: RefinementContext;
}

/**
 * Main orchestration function - coordinates edit generation and critique
 */
export async function orchestrateEdit(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const CONFIG = getConfig(); // Load config at start of each edit

  const {
    cells,
    cellIndex,
    instruction,
    documentId,
    syntaxMode,
    documentStructure,
    model,
    baseStyle,
    audienceProfile,
    refinementContext,
  } = request;

  const currentCell = cells[cellIndex];

  // Get or create document preferences
  let documentPrefs = await getOrCreateDocumentPreferences(
    documentId,
    audienceProfile?.id || null
  );

  const convergenceHistory: OrchestrationResult['convergenceHistory'] = [];
  const agentTrace: AgentTraceEntry[] = [];
  let bestEdit = currentCell;
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
      (s) => cellIndex >= s.startCell && cellIndex <= s.endCell
    );
  }

  // Get document goals from preferences
  const documentGoals = documentPrefs.adjustments.documentGoals;

  // Analyze paragraph intent (considers document goals)
  let paragraphIntent: ParagraphIntent | undefined;
  const intentStartTime = Date.now();
  try {
    const previousParagraph = cellIndex > 0 ? cells[cellIndex - 1] : undefined;
    const nextParagraph = cellIndex < cells.length - 1 ? cells[cellIndex + 1] : undefined;

    paragraphIntent = await analyzeIntent({
      paragraph: currentCell,
      previousParagraph,
      nextParagraph,
      sectionName: currentSection?.name,
      sectionPurpose: currentSection?.purpose,
      documentGoals,
      documentTitle: documentStructure?.title,
      model,
    });

    agentTrace.push({
      agent: 'intent',
      timestamp: intentStartTime,
      durationMs: Date.now() - intentStartTime,
      summary: paragraphIntent?.purpose
        ? `Identified purpose: ${paragraphIntent.purpose.slice(0, 60)}${paragraphIntent.purpose.length > 60 ? '...' : ''}`
        : 'Analyzed paragraph intent',
      details: {
        purpose: paragraphIntent?.purpose,
        connectionToPrevious: paragraphIntent?.connectionToPrevious,
        roleInGoals: paragraphIntent?.roleInGoals,
      },
    });
  } catch (error) {
    console.error('Intent analysis error:', error);
    agentTrace.push({
      agent: 'intent',
      timestamp: intentStartTime,
      durationMs: Date.now() - intentStartTime,
      summary: 'Intent analysis failed (non-critical)',
      details: { error: String(error) },
    });
    // Continue without intent - it's not critical
  }

  // Build user refinement issues if refinementContext provided
  const buildRefinementIssues = (ctx: typeof refinementContext): CritiqueIssue[] => {
    if (!ctx) return [];
    const issues: CritiqueIssue[] = [];

    // Add user's typed feedback as an issue
    if (ctx.userFeedback && ctx.userFeedback.trim()) {
      issues.push({
        type: 'user_feedback',
        severity: 'major',
        description: `User feedback: ${ctx.userFeedback.trim()}`,
      });
    }

    // Add rejected changes as issues
    for (const rejected of ctx.rejectedChanges || []) {
      issues.push({
        type: 'rejected_change',
        severity: 'minor',
        description: rejected,
      });
    }

    return issues;
  };

  // Orchestration loop
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    iterations = attempt;

    // Apply current document preferences to base style
    const adjustedStyle = applyAdjustmentsToStyle(baseStyle, documentPrefs.adjustments);

    // Determine previous attempt and issues
    // On first attempt with refinementContext, use the user's current text and feedback
    // On subsequent attempts, use the best edit so far
    let previousAttempt: string | undefined;
    let previousIssues: CritiqueIssue[] | undefined;

    if (attempt === 1 && refinementContext) {
      // User is refining: start from their current text with their feedback
      previousAttempt = refinementContext.userCurrentText;
      previousIssues = buildRefinementIssues(refinementContext);
    } else if (attempt > 1) {
      // Internal retry loop
      previousAttempt = bestEdit;
      previousIssues = bestCritique.issues;
    }

    // Track Prompt Agent (happens inside generateEdit, but we trace the whole generation)
    const promptStartTime = Date.now();

    // Generate edit with current preferences
    const editedText = await generateEdit({
      cells,
      cellIndex,
      instruction,
      syntaxMode,
      documentStructure,
      model,
      baseStyle: adjustedStyle,
      audienceProfile,
      documentAdjustments: documentPrefs.adjustments,
      paragraphIntent,
      documentGoals,
      previousAttempt,
      previousIssues,
      userRefinementFeedback: refinementContext?.userFeedback,
    });

    const llmDuration = Date.now() - promptStartTime;
    agentTrace.push({
      agent: 'prompt',
      timestamp: promptStartTime,
      durationMs: Math.round(llmDuration * 0.1), // ~10% is prompt building
      summary: `Built prompt for attempt ${attempt}${instruction ? ` with instruction: "${instruction.slice(0, 50)}${instruction.length > 50 ? '...' : ''}"` : ''}`,
      details: {
        attempt,
        hasInstruction: !!instruction,
        hasPreviousAttempt: !!previousAttempt,
        issueCount: previousIssues?.length || 0,
      },
    });

    agentTrace.push({
      agent: 'llm',
      timestamp: promptStartTime + Math.round(llmDuration * 0.1),
      durationMs: Math.round(llmDuration * 0.9), // ~90% is LLM generation
      summary: `Generated edit (${editedText.length} chars)`,
      details: {
        attempt,
        inputLength: currentCell.length,
        outputLength: editedText.length,
        model: model || 'default',
      },
    });

    // Critique the edit
    // Optimization: skip critique on final iteration if we already have a good score
    const isLastAttempt = attempt === CONFIG.maxRetries;
    const hasGoodScore = bestCritique.alignmentScore >= CONFIG.alignmentThreshold * 0.9; // 90% of threshold
    const skipCritique = isLastAttempt && hasGoodScore;

    let critique: CritiqueAnalysis;

    if (skipCritique) {
      // Use previous best and assume this edit is similar
      critique = {
        ...bestCritique,
        alignmentScore: Math.min(bestCritique.alignmentScore + 0.05, 1.0), // Slight boost for final attempt
      };
      agentTrace.push({
        agent: 'critique',
        timestamp: Date.now(),
        durationMs: 1,
        summary: `Skipped (using previous score ${Math.round(bestCritique.alignmentScore * 100)}%)`,
        details: { attempt, skipped: true, reason: 'final iteration optimization' },
      });
    } else {
      const critiqueStartTime = Date.now();
      critique = await critiqueEdit({
        originalText: currentCell,
        suggestedEdit: editedText,
        baseStyle: adjustedStyle,
        audienceProfile,
        documentPreferences: documentPrefs,
        sectionType: currentSection?.type,
        model,
      });

      agentTrace.push({
        agent: 'critique',
        timestamp: critiqueStartTime,
        durationMs: Date.now() - critiqueStartTime,
        summary: `Scored ${Math.round(critique.alignmentScore * 100)}% alignment${critique.issues.length > 0 ? `, ${critique.issues.length} issue${critique.issues.length > 1 ? 's' : ''}` : ''}`,
        details: {
          attempt,
          alignmentScore: critique.alignmentScore,
          predictedAcceptance: critique.predictedAcceptance,
          issueCount: critique.issues.length,
          issueTypes: critique.issues.map(i => i.type),
        },
      });
    }

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
  // IMPORTANT: Reload from disk first to preserve any changes made during orchestration
  // (e.g., goals added by Intent Agent while edit was in progress)
  const latestPrefs = await getOrCreateDocumentPreferences(documentId, audienceProfile?.id || null);

  // NOTE: We intentionally do NOT overwrite the style sliders (verbosityAdjust, formalityAdjust, hedgingAdjust).
  // These are user-controlled only - the orchestrator reads them for guidance but never modifies them.
  // This prevents style drift and ensures user preferences are always respected.
  // The orchestrator only updates the timestamp to indicate an edit was processed.
  latestPrefs.updatedAt = new Date().toISOString();

  await saveDocumentPreferences(latestPrefs);

  return {
    editedText: bestEdit,
    originalText: currentCell,
    cellIndex,
    critique: bestCritique,
    iterations,
    documentPreferences: latestPrefs,
    convergenceHistory,
    agentTrace,
  };
}

/**
 * Generate an edit using the LLM
 */
async function generateEdit(params: {
  cells: string[];
  cellIndex: number;
  instruction?: string;
  syntaxMode?: SyntaxMode;
  documentStructure?: OrchestrationRequest['documentStructure'];
  model?: string;
  baseStyle: BaseStyle;
  audienceProfile?: AudienceProfile;
  documentAdjustments?: DocumentAdjustments;
  paragraphIntent?: ParagraphIntent;
  documentGoals?: DocumentGoals;
  previousAttempt?: string;
  previousIssues?: CritiqueIssue[];
  userRefinementFeedback?: string;
}): Promise<string> {
  const {
    cells,
    cellIndex,
    instruction,
    syntaxMode,
    documentStructure,
    model,
    baseStyle,
    audienceProfile,
    documentAdjustments,
    paragraphIntent,
    documentGoals,
    previousAttempt,
    previousIssues,
    userRefinementFeedback,
  } = params;

  const currentCell = cells[cellIndex];

  // Find current section
  let currentSection: NonNullable<OrchestrationRequest['documentStructure']>['sections'][0] | undefined;
  if (documentStructure?.sections) {
    currentSection = documentStructure.sections.find(
      (s) => cellIndex >= s.startCell && cellIndex <= s.endCell
    );
  }

  // Build context from surrounding cells
  const contextSize = 2;
  const startBefore = Math.max(0, cellIndex - contextSize);
  const endAfter = Math.min(cells.length, cellIndex + contextSize + 1);
  const beforeCells = cells.slice(startBefore, cellIndex);
  const afterCells = cells.slice(cellIndex + 1, endAfter);

  // Detect if this is a generation/expansion request vs a pure edit
  // BE CAREFUL: Only trigger generation mode for clear generation requests
  // Regular edit instructions should NOT trigger this (e.g., "improve the argument" is editing, not generation)
  const instructionLower = (instruction || '').toLowerCase();

  // Check for explicit generation verbs FOLLOWED by content type
  const hasGenerationVerb = /\b(generate|write|create|draft|compose|produce)\b/.test(instructionLower);
  const hasExpansionVerb = /\b(expand|elaborate|develop|flesh\s*out|add\s+more|continue)\b/.test(instructionLower);

  // Content type words that WITH a generation verb indicate generation
  const hasContentType = /\b(text|content|paragraph|section|abstract|introduction|conclusion|discussion|summary|perspective|overview|methods?|results?)\b/.test(instructionLower);

  // Specific phrases that clearly indicate ADD/generation (preserve existing + add new)
  // Match: "add a discussion", "draft a discussion", "write a conclusion", "create an abstract", etc.
  const hasAddPhrase = /\b(add|draft|write|create|compose)\s+(a|an|the)?\s*(new\s+)?(appropriate\s+)?(paragraph|section|abstract|introduction|conclusion|discussion|summary|part)/i.test(instructionLower);

  // Specific phrases that clearly indicate generation
  const hasGenerationPhrase =
    /\b(generate|write|create)\s+(a|an|the|new|more)\s+\w+/i.test(instructionLower) ||
    hasAddPhrase ||
    /\bstructured?\s+correctly/i.test(instructionLower);

  // Generation mode: only when there's a clear generation intent
  // NOT for regular edits like "improve structure" or "clarify the argument"
  const isGenerationRequest =
    (hasGenerationVerb && hasContentType) ||
    hasExpansionVerb ||
    hasGenerationPhrase;

  // ADD mode: user wants to add new content while preserving existing
  const isAddRequest = hasAddPhrase;

  // Debug logging for ADD mode
  if (isAddRequest) {
    console.log('[Orchestrator] ADD MODE DETECTED for instruction:', instruction);
  }
  if (isGenerationRequest) {
    console.log('[Orchestrator] Generation mode:', { hasGenerationVerb, hasContentType, hasExpansionVerb, hasGenerationPhrase, isAddRequest });
  }

  // Build syntax mode instructions
  const getSyntaxInstructions = (mode?: SyntaxMode): string => {
    switch (mode) {
      case 'latex':
        return `CRITICAL SYNTAX REQUIREMENT - LaTeX:
This document uses LaTeX syntax. You MUST:
- Use proper LaTeX commands and environments (e.g., \\textbf{}, \\emph{}, \\cite{})
- Include BOTH opening AND closing tags for any environment (e.g., \\begin{abstract}...\\end{abstract})
- Use LaTeX math mode for equations: $inline$ or \\[display\\]
- Preserve any existing LaTeX structure and commands
- Do NOT output plain text without LaTeX formatting when LaTeX is expected
- Common environments: abstract, figure, table, equation, itemize, enumerate
- If generating a new section/environment, ALWAYS include the complete \\begin{...} and \\end{...} pair`;
      case 'markdown':
        return `SYNTAX REQUIREMENT - Markdown:
This document uses Markdown syntax. You MUST:
- Use proper Markdown formatting (# headers, **bold**, *italic*, \`code\`)
- Use proper list syntax (- or * for bullets, 1. for numbered)
- Use code blocks with triple backticks when appropriate
- Preserve any existing Markdown structure`;
      case 'code':
        return `SYNTAX REQUIREMENT - Code:
This is a code document. You MUST:
- Preserve proper code syntax and indentation
- Maintain language-specific conventions
- Keep comments in the appropriate format for the language`;
      default:
        return '';
    }
  };

  // Build style prompt
  const stylePrompt = buildSystemPrompt(baseStyle, audienceProfile);
  const syntaxInstructions = getSyntaxInstructions(syntaxMode);

  // Build the context-aware prompt
  const contextParts: string[] = [];

  // START WITH USER'S INSTRUCTION - this is the PRIMARY directive
  const baseInstruction = instruction || 'Improve this paragraph according to my style preferences.';
  if (instruction && instruction.trim()) {
    contextParts.push('=== PRIMARY INSTRUCTION (MUST FOLLOW) ===');
    contextParts.push('');
    contextParts.push(instruction);
    contextParts.push('');
    contextParts.push('The above instruction is your PRIMARY task. Follow it precisely.');
    contextParts.push('');
    contextParts.push('---');
    contextParts.push('');
  }

  // Style profile comes AFTER - it's for alignment, not the primary task
  contextParts.push('=== STYLE ALIGNMENT (apply after following the instruction) ===');
  contextParts.push('');
  contextParts.push(stylePrompt);
  contextParts.push('');

  // Add syntax mode instructions
  if (syntaxInstructions) {
    contextParts.push('---');
    contextParts.push('');
    contextParts.push(syntaxInstructions);
    contextParts.push('');
  }

  contextParts.push('---');
  contextParts.push('');

  if (isAddRequest) {
    // For ADD mode, we only generate the NEW content - we'll append it ourselves
    // This avoids asking the LLM to repeat massive documents
    contextParts.push('The user wants to ADD a new section (discussion, conclusion, etc.) to their document.');
    contextParts.push('');
    contextParts.push('IMPORTANT: Generate ONLY the NEW section content.');
    contextParts.push('- Do NOT include or repeat ANY of the existing document content');
    contextParts.push('- Just write the new section (e.g., the discussion) that will be appended');
    contextParts.push('- The new content should reference and build upon the existing document');
    contextParts.push('- Make sure the new section flows naturally as a continuation');
    contextParts.push('');
  } else if (isGenerationRequest) {
    contextParts.push('You are working on a document and need to GENERATE or significantly EXPAND content based on the instruction.');
    contextParts.push('IMPORTANT:');
    contextParts.push('- You are NOT limited to just editing the existing text');
    contextParts.push('- You can rewrite, expand, restructure, or generate entirely new content');
    contextParts.push('- If the instruction asks to generate/write content, produce SUBSTANTIAL new text');
    contextParts.push('- Structure the output appropriately (multiple paragraphs, sections as needed)');
    contextParts.push('- The existing content below is CONTEXT - use it to understand the topic, but generate new content as instructed');
  } else {
    contextParts.push('You are editing a specific paragraph within a larger document.');
    contextParts.push('');
    contextParts.push('EDITING PRINCIPLES:');
    contextParts.push('- Make MINIMAL, TARGETED changes - only edit what the instruction asks for');
    contextParts.push('- PRESERVE the original voice, tone, and structure as much as possible');
    contextParts.push('- Consider the CONTEXT: how this paragraph flows from the previous and into the next');
    contextParts.push('- Do NOT rewrite the entire paragraph unless explicitly asked');
    contextParts.push('- Do NOT add or remove content unless the instruction requires it');
    contextParts.push('');
    contextParts.push('CRITICAL: You must return the COMPLETE edited text.');
    contextParts.push('- Even if the instruction only asks to edit part of the text (e.g., "fix the ending"), you must return the ENTIRE paragraph/text with that edit applied.');
    contextParts.push('- NEVER return only the edited portion - always return the full text with edits incorporated.');
    contextParts.push('- The original content that is NOT being edited must be preserved exactly as-is.');
  }
  contextParts.push('');

  // Add document-level context
  if (documentStructure) {
    contextParts.push('DOCUMENT CONTEXT:');
    contextParts.push(`Title: ${documentStructure.title}`);
    contextParts.push(`Type: ${documentStructure.documentType}`);
    contextParts.push(`Main argument: ${documentStructure.mainArgument}`);
    contextParts.push('');
  }

  // Add document goals (from Intent Agent)
  if (documentGoals) {
    contextParts.push('DOCUMENT GOALS:');
    contextParts.push(`Summary: ${documentGoals.summary}`);
    if (documentGoals.objectives.length > 0) {
      contextParts.push('Objectives:');
      documentGoals.objectives.forEach((obj, i) => {
        contextParts.push(`  ${i + 1}. ${obj}`);
      });
    }
    if (documentGoals.mainArgument) {
      contextParts.push(`Main Argument: ${documentGoals.mainArgument}`);
    }
    if (documentGoals.audienceNeeds) {
      contextParts.push(`Audience Needs: ${documentGoals.audienceNeeds}`);
    }
    if (documentGoals.successCriteria) {
      contextParts.push(`Success Criteria: ${documentGoals.successCriteria}`);
    }
    contextParts.push('');
  }

  // Add section-specific guidance
  if (currentSection) {
    contextParts.push(`CURRENT SECTION: ${currentSection.name} (${currentSection.type})`);
    contextParts.push(`Section purpose: ${currentSection.purpose}`);
    contextParts.push('');
  }

  // Add paragraph intent (from Intent Agent analysis)
  if (paragraphIntent) {
    contextParts.push('PARAGRAPH INTENT:');
    contextParts.push(`Purpose: ${paragraphIntent.purpose}`);
    if (paragraphIntent.connectionToPrevious) {
      contextParts.push(`Connection to previous: ${paragraphIntent.connectionToPrevious}`);
    }
    if (paragraphIntent.connectionToNext) {
      contextParts.push(`Connection to next: ${paragraphIntent.connectionToNext}`);
    }
    if (paragraphIntent.roleInGoals) {
      contextParts.push(`Role in document goals: ${paragraphIntent.roleInGoals}`);
    }
    contextParts.push('');
    contextParts.push('IMPORTANT: Preserve this paragraph\'s intent and role in the document when editing.');
    contextParts.push('');
  }

  // Add document-specific LEARNED RULES FIRST - these are critical user feedback
  // They must appear before other context so the LLM prioritizes them
  if (documentAdjustments) {
    const docContextPrompt = buildDocumentContextPrompt(documentAdjustments);
    if (docContextPrompt.trim()) {
      contextParts.push(docContextPrompt);
    }
  }

  // Add key terms
  if (documentStructure?.keyTerms && documentStructure.keyTerms.length > 0) {
    contextParts.push('KEY TERMS:');
    documentStructure.keyTerms.forEach((t) => contextParts.push(`- ${t}`));
    contextParts.push('');
  }

  // Add surrounding context
  if (beforeCells.length > 0) {
    contextParts.push('PRECEDING PARAGRAPHS (for context, do not edit):');
    beforeCells.forEach((p, i) => {
      contextParts.push(`[Paragraph ${startBefore + i + 1}]: ${p}`);
    });
    contextParts.push('');
  }

  if (isGenerationRequest) {
    contextParts.push('EXISTING CONTENT (use as context for your generation):');
  } else {
    contextParts.push('PARAGRAPH TO EDIT:');
  }
  contextParts.push(currentCell);
  contextParts.push('');

  if (afterCells.length > 0) {
    contextParts.push('FOLLOWING PARAGRAPHS (for context, do not edit):');
    afterCells.forEach((p, i) => {
      contextParts.push(`[Paragraph ${cellIndex + 2 + i}]: ${p}`);
    });
    contextParts.push('');
  }

  // Add feedback from previous attempt if this is a retry or refinement
  if (previousAttempt && previousIssues && previousIssues.length > 0) {
    contextParts.push('---');
    contextParts.push('');

    // Check if this is user refinement feedback (has user_feedback or rejected_change types)
    const userFeedbackIssues = previousIssues.filter(i => i.type === 'user_feedback');
    const rejectedChanges = previousIssues.filter(i => i.type === 'rejected_change');
    const critiqueIssues = previousIssues.filter(i => i.type !== 'user_feedback' && i.type !== 'rejected_change');

    if (userFeedbackIssues.length > 0 || rejectedChanges.length > 0) {
      // User refinement - prioritize their feedback
      contextParts.push('=== USER REFINEMENT REQUEST (HIGHEST PRIORITY) ===');
      contextParts.push('');
      contextParts.push('The user reviewed your previous edit and has specific feedback:');
      contextParts.push('');

      if (userFeedbackIssues.length > 0) {
        contextParts.push('USER\'S FEEDBACK:');
        userFeedbackIssues.forEach((issue) => {
          // Remove the "User feedback: " prefix we added
          const feedback = issue.description.replace(/^User feedback:\s*/i, '');
          contextParts.push(`"${feedback}"`);
        });
        contextParts.push('');
      }

      if (rejectedChanges.length > 0) {
        contextParts.push('CHANGES THE USER REJECTED (preserve original wording for these):');
        rejectedChanges.forEach((issue) => {
          contextParts.push(`- ${issue.description}`);
        });
        contextParts.push('');
      }

      contextParts.push('Their current working text (with their accepted/rejected selections applied):');
      contextParts.push(previousAttempt);
      contextParts.push('');
      contextParts.push('Generate an IMPROVED version that honors the user\'s feedback while maintaining quality.');
      contextParts.push('');
    }

    if (critiqueIssues.length > 0) {
      contextParts.push('ADDITIONAL CRITIQUE ISSUES:');
      critiqueIssues.forEach((issue) => {
        contextParts.push(`- ${issue.type}: ${issue.description}`);
      });
      contextParts.push('');
    }
  }

  contextParts.push('---');
  contextParts.push('');

  // Reminder of the primary instruction, with special handling for terse mode
  const isTerseMode = documentAdjustments && documentAdjustments.verbosityAdjust <= -0.5;

  if (instruction && instruction.trim()) {
    contextParts.push(`REMINDER - Your PRIMARY task: ${instruction}`);
  } else {
    contextParts.push('TASK: Improve this paragraph according to my style preferences.');
  }

  if (isTerseMode && !isGenerationRequest) {
    contextParts.push('');
    contextParts.push('⚠️ CRITICAL WORD COUNT REQUIREMENT ⚠️');
    contextParts.push('You MUST cut at least 30% of words. Count them. Original has approximately ' +
      currentCell.split(/\s+/).length + ' words.');
    contextParts.push('Your output MUST have fewer than ' +
      Math.floor(currentCell.split(/\s+/).length * 0.7) + ' words.');
    contextParts.push('If your edit is not significantly shorter, START OVER and cut more aggressively.');
  }

  contextParts.push('');

  if (isAddRequest) {
    contextParts.push('FINAL REMINDER: Generate ONLY the new section content.');
    contextParts.push('Do NOT repeat any existing document content - just write the new section to be added.');
    contextParts.push('Do not include explanations or meta-commentary - just return the new content itself.');
    if (syntaxMode === 'latex') {
      contextParts.push('REMINDER: Output must be valid LaTeX. Include complete environment tags (\\begin{...} and \\end{...}).');
    }
  } else if (isGenerationRequest) {
    contextParts.push('Return the content that fulfills the instruction above. You may generate new paragraphs, expand existing content, or rewrite as needed.');
    contextParts.push('If multiple paragraphs are appropriate, separate them with blank lines.');
    contextParts.push('Do not include explanations or meta-commentary - just return the content itself.');
    if (syntaxMode === 'latex') {
      contextParts.push('REMINDER: Output must be valid LaTeX. Include complete environment tags (\\begin{...} and \\end{...}).');
    }
  } else {
    contextParts.push('Return the COMPLETE edited text (not just the changed portion). Do not include any explanation.');
    contextParts.push('IMPORTANT: Your output must contain the full text with edits applied - never just the edited part.');
    if (syntaxMode === 'latex') {
      contextParts.push('Preserve all LaTeX syntax and formatting.');
    }
  }

  const systemPrompt = contextParts.join('\n');

  // Call LLM
  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  // Build user message with reminder of critical rules
  let userMessage: string;
  if (isAddRequest) {
    userMessage = 'Please generate ONLY the new section content now. Do not include any existing document content - just write the new section that will be appended to the document.';
  } else if (isGenerationRequest) {
    userMessage = 'Please generate the content now based on the instruction.';
  } else {
    userMessage = 'Please edit the paragraph now. Make targeted, minimal changes that address the instruction while preserving the original voice and structure.';
  }

  // Add critical rule reminder in user message for extra emphasis
  if (documentAdjustments?.learnedRules && documentAdjustments.learnedRules.length > 0) {
    const criticalRules = documentAdjustments.learnedRules
      .filter(r => r.confidence >= 0.7)
      .slice(0, 3); // Top 3 critical rules

    if (criticalRules.length > 0) {
      userMessage += '\n\nREMINDER - Critical rules from previous feedback:';
      criticalRules.forEach(r => {
        userMessage += `\n- ${r.rule}`;
      });
    }
  }

  const result = await provider.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: isGenerationRequest ? 0.6 : 0.25, // Lower temp for more consistent edits
    ...(isGenerationRequest ? { maxTokens: 4000 } : {}), // Only limit tokens for generation
  });

  // Debug: Log LLM response
  console.log('[Orchestrator] LLM response length:', result.content?.length);
  console.log('[Orchestrator] Input length:', currentCell.length);
  console.log('[Orchestrator] isAddRequest:', isAddRequest);
  if (isAddRequest) {
    console.log('[Orchestrator] First 500 chars of response:', result.content?.slice(0, 500));
  }

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

  // For ADD mode: prepend the original content + separator, then the new section
  // This way we don't ask the LLM to repeat 64KB of text
  if (isAddRequest && editedText.length > 0) {
    console.log('[Orchestrator] ADD MODE: Appending new content to original');
    console.log('[Orchestrator] New section length:', editedText.length);
    editedText = currentCell + '\n\n' + editedText;
    console.log('[Orchestrator] Final combined length:', editedText.length);
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

  // We no longer auto-learn from critique issues.
  // Word choices are contextual - learning them can steer in wrong direction.
  // Style adjustments (verbosity, formality, hedging) should only change via
  // explicit user action on the sliders or through rejection feedback patterns.
  // The critique is still used for refinement loops, but not for learning word preferences.

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
  const CONFIG = getConfig(); // Load config

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
