/**
 * Intent Agent
 *
 * Analyzes paragraph intent within the context of document goals.
 * Also synthesizes and evolves document goals as the document changes.
 *
 * Two main functions:
 * 1. analyzeIntent - Analyzes a paragraph's purpose within document goals
 * 2. synthesizeGoals - Creates/updates document goals from content
 */

import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import type { DocumentGoals, ParagraphIntent, DocumentConstraints } from '@/types';

/**
 * Analyze a paragraph's intent within the context of document goals
 */
export async function analyzeIntent(params: {
  paragraph: string;
  previousParagraph?: string;
  nextParagraph?: string;
  sectionName?: string;
  sectionPurpose?: string;
  documentGoals?: DocumentGoals;
  documentConstraints?: DocumentConstraints;
  documentTitle?: string;
  model?: string;
}): Promise<ParagraphIntent> {
  const {
    paragraph,
    previousParagraph,
    nextParagraph,
    sectionName,
    sectionPurpose,
    documentGoals,
    documentConstraints,
    documentTitle,
    model,
  } = params;

  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  // Build context about document goals
  let goalsContext = '';
  if (documentGoals) {
    goalsContext = `
DOCUMENT GOALS:
Summary: ${documentGoals.summary}
Objectives:
${documentGoals.objectives.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}
${documentGoals.mainArgument ? `Main Argument: ${documentGoals.mainArgument}` : ''}
${documentGoals.audienceNeeds ? `Audience Needs: ${documentGoals.audienceNeeds}` : ''}
`;
  }

  // Build context about external constraints
  let constraintsContext = '';
  if (documentConstraints?.constraints && documentConstraints.constraints.length > 0) {
    constraintsContext = `
EXTERNAL CONSTRAINTS:${documentConstraints.sourceDescription ? `\nSource: ${documentConstraints.sourceDescription}` : ''}
Requirements:
${documentConstraints.constraints.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
`;
  }

  const prompt = `You are an Intent Analysis Agent. Analyze the purpose of a paragraph within its document context.

${documentTitle ? `DOCUMENT: ${documentTitle}` : ''}
${sectionName ? `SECTION: ${sectionName}` : ''}
${sectionPurpose ? `SECTION PURPOSE: ${sectionPurpose}` : ''}
${goalsContext}
${constraintsContext}

${previousParagraph ? `PREVIOUS PARAGRAPH:\n${previousParagraph.slice(0, 300)}${previousParagraph.length > 300 ? '...' : ''}\n` : ''}

PARAGRAPH TO ANALYZE:
${paragraph}

${nextParagraph ? `\nNEXT PARAGRAPH:\n${nextParagraph.slice(0, 300)}${nextParagraph.length > 300 ? '...' : ''}` : ''}

Analyze this paragraph's INTENT - what it's trying to accomplish, not just what it says.

Respond with a JSON object:
{
  "purpose": "<1-2 sentence description of what this paragraph aims to accomplish>",
  "connectionToPrevious": "<how it builds on or relates to the previous paragraph, or null if first>",
  "connectionToNext": "<how it sets up or leads to the next paragraph, or null if last>",
  "roleInGoals": "<how this paragraph contributes to the document's overall goals>"
}

Focus on INTENT and FUNCTION, not content summary.
Return ONLY the JSON object.`;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are an Intent Analysis Agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        purpose: 'Unable to analyze intent',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      purpose: parsed.purpose || 'Unknown purpose',
      connectionToPrevious: parsed.connectionToPrevious || undefined,
      connectionToNext: parsed.connectionToNext || undefined,
      roleInGoals: parsed.roleInGoals || undefined,
    };
  } catch (error) {
    console.error('Intent analysis error:', error);
    return {
      purpose: 'Unable to analyze intent',
    };
  }
}

/**
 * Synthesize document goals from the document content.
 * Creates a coherent synthesis, not a laundry list.
 *
 * If existing goals are provided and userEdited is true, will preserve
 * the user's goals while potentially suggesting refinements.
 *
 * If goals are locked, returns existing goals unchanged.
 */
export async function synthesizeGoals(params: {
  documentTitle: string;
  documentContent: string; // Full document or representative sample
  documentType?: string;
  existingGoals?: DocumentGoals;
  model?: string;
}): Promise<DocumentGoals> {
  const {
    documentTitle,
    documentContent,
    documentType,
    existingGoals,
    model,
  } = params;

  // If goals are locked, return them unchanged
  if (existingGoals?.locked) {
    return existingGoals;
  }

  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  // If user has edited goals, be more conservative about changes
  const preserveUserGoals = existingGoals?.userEdited;

  let existingContext = '';
  if (existingGoals) {
    existingContext = `
CURRENT GOALS (${preserveUserGoals ? 'user-edited, preserve intent' : 'auto-generated'}):
Summary: ${existingGoals.summary}
Objectives:
${existingGoals.objectives.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}
${existingGoals.mainArgument ? `Main Argument: ${existingGoals.mainArgument}` : ''}
`;
  }

  const prompt = `You are a Document Goals Synthesis Agent. Analyze a document and synthesize its core goals.

DOCUMENT TITLE: ${documentTitle}
${documentType ? `DOCUMENT TYPE: ${documentType}` : ''}
${existingContext}

DOCUMENT CONTENT (sample):
${documentContent.slice(0, 4000)}${documentContent.length > 4000 ? '\n[... truncated ...]' : ''}

Synthesize the document's goals. This should be a COHERENT SYNTHESIS, not a laundry list.

Guidelines:
- Summary should be 2-3 sentences capturing the document's primary aim
- Objectives should be 2-4 CORE aims (not every minor point)
- Main argument should be the central thesis or claim
- Audience needs should describe what the reader seeks from this document
- Success criteria should describe what achieving the goals looks like
${preserveUserGoals ? '\nIMPORTANT: The user has edited the existing goals. Preserve their core intent while potentially refining the language or adding clarity.' : ''}

Respond with a JSON object:
{
  "summary": "<2-3 sentence synthesis of document aims>",
  "objectives": ["<core objective 1>", "<core objective 2>", ...],
  "mainArgument": "<central thesis or claim>",
  "audienceNeeds": "<what the reader seeks>",
  "successCriteria": "<what success looks like>"
}

Return ONLY the JSON object.`;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a Document Goals Synthesis Agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return existingGoals || createDefaultGoals();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary || 'Document goals not yet analyzed',
      objectives: Array.isArray(parsed.objectives) ? parsed.objectives.slice(0, 4) : [],
      mainArgument: parsed.mainArgument || undefined,
      audienceNeeds: parsed.audienceNeeds || undefined,
      successCriteria: parsed.successCriteria || undefined,
      updatedAt: new Date().toISOString(),
      userEdited: preserveUserGoals, // Preserve user-edited flag if it was set
      locked: existingGoals?.locked, // Preserve locked flag
    };
  } catch (error) {
    console.error('Goals synthesis error:', error);
    return existingGoals || createDefaultGoals();
  }
}

/**
 * Check if goals need updating based on document changes.
 * Returns true if the document has changed significantly since last goal update.
 */
export function shouldUpdateGoals(params: {
  existingGoals?: DocumentGoals;
  lastDocumentUpdate: string;
}): boolean {
  const { existingGoals, lastDocumentUpdate } = params;

  // No goals yet - should create them
  if (!existingGoals) {
    return true;
  }

  // Goals are locked - don't auto-update
  if (existingGoals.locked) {
    return false;
  }

  // User edited goals - don't auto-update
  if (existingGoals.userEdited) {
    return false;
  }

  // Check if document was updated after goals
  const goalsTime = new Date(existingGoals.updatedAt).getTime();
  const docTime = new Date(lastDocumentUpdate).getTime();

  // Update if document changed more than 5 minutes after goals
  return docTime - goalsTime > 5 * 60 * 1000;
}

/**
 * Create default empty goals
 */
function createDefaultGoals(): DocumentGoals {
  return {
    summary: 'Document goals not yet analyzed. Click "Analyze Goals" to generate.',
    objectives: [],
    updatedAt: new Date().toISOString(),
    userEdited: false,
  };
}

/**
 * Merge user edits with auto-generated goals.
 * Used when user partially edits goals.
 */
export function mergeGoals(
  userEdits: Partial<DocumentGoals>,
  autoGenerated: DocumentGoals
): DocumentGoals {
  return {
    summary: userEdits.summary ?? autoGenerated.summary,
    objectives: userEdits.objectives ?? autoGenerated.objectives,
    mainArgument: userEdits.mainArgument ?? autoGenerated.mainArgument,
    audienceNeeds: userEdits.audienceNeeds ?? autoGenerated.audienceNeeds,
    successCriteria: userEdits.successCriteria ?? autoGenerated.successCriteria,
    updatedAt: new Date().toISOString(),
    userEdited: true, // Mark as user-edited since they've made changes
  };
}
