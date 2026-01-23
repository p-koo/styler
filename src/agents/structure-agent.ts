/**
 * Structure Agent
 *
 * Comprehensive document analysis agent that evaluates:
 * - Logical coherence and argumentation
 * - Scientific/academic presentation quality
 * - Content precision and clarity (vs vagueness)
 * - Structural flow and organization
 * - Opportunities for conciseness
 *
 * Proposes actionable changes: reorder, merge, split, add, remove, transition, condense, clarify.
 */

import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import type {
  DocumentGoals,
  StructureAnalysis,
  StructureIssue,
  StructureProposal,
  StructureIssueType,
  StructureIssueSeverity,
  StructureProposalType,
  StructureProposalPriority,
} from '@/types';

// Cell with metadata for analysis
export interface CellWithMeta {
  index: number;
  content: string;
  type?: 'cell' | 'heading';
}

// Analysis options
export interface AnalysisOptions {
  focusOnConciseness?: boolean; // User wants suggestions for tightening
  documentType?: 'scientific' | 'academic' | 'general' | 'technical';
}

/**
 * Analyze document structure, logic, and content quality
 */
export async function analyzeStructure(params: {
  cells: CellWithMeta[];
  selectedIndices?: number[];
  documentTitle?: string;
  documentGoals?: DocumentGoals;
  model?: string;
  options?: AnalysisOptions;
}): Promise<StructureAnalysis> {
  const {
    cells,
    selectedIndices,
    documentTitle,
    documentGoals,
    model,
    options = {},
  } = params;

  const providerConfig = getDefaultProviderConfig(model);
  const provider = await createProvider(providerConfig);

  // Determine which cells to analyze
  const targetCells = selectedIndices && selectedIndices.length > 0
    ? cells.filter(c => selectedIndices.includes(c.index))
    : cells;

  // Build context about document goals
  let goalsContext = '';
  if (documentGoals) {
    goalsContext = `
DOCUMENT GOALS:
Summary: ${documentGoals.summary}
Objectives:
${documentGoals.objectives.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}
${documentGoals.mainArgument ? `Main Argument: ${documentGoals.mainArgument}` : ''}
`;
  }

  // Format cells for analysis - show more content for better analysis
  const formattedCells = targetCells
    .map(c => `[${c.index}]${c.type === 'heading' ? ' (HEADING)' : ''} ${c.content.slice(0, 600)}${c.content.length > 600 ? '...' : ''}`)
    .join('\n\n');

  // Build focus instructions based on options
  let focusInstructions = '';
  if (options.focusOnConciseness) {
    focusInstructions = `
SPECIAL FOCUS: The user wants to make this document MORE CONCISE.
- Actively look for verbose passages, unnecessary qualifications, and redundant content
- Propose "condense" changes that tighten language while preserving all key ideas
- Propose "remove" for content that doesn't contribute to the core argument
- Identify filler phrases, hedge-stacking, and over-explanation
`;
  }

  const prompt = `You are a comprehensive Document Analysis Agent. Analyze the document for logical coherence, content quality, and structural organization.

${documentTitle ? `DOCUMENT: ${documentTitle}` : ''}
${documentGoals ? `TYPE: ${options.documentType || 'academic/scientific'}` : ''}
${goalsContext}
${focusInstructions}

CONTENT TO ANALYZE:
${formattedCells}

Perform a thorough analysis across THREE dimensions:

## 1. LOGIC ANALYSIS
Evaluate the logical coherence and argumentation:
- Are claims supported with evidence or reasoning?
- Is the argument structure sound (no circular reasoning, non-sequiturs)?
- Are there logical gaps where connections are assumed but not stated?
- For scientific content: Is this the optimal presentation of ideas?

## 2. CLARITY ANALYSIS
Evaluate precision and clarity of content:
- Identify vague language that should be more specific
- Find imprecise claims that overstate or understate
- Spot unclear antecedents (pronouns without clear referents)
- Look for hedging that obscures the actual claim

## 3. FLOW ANALYSIS
Evaluate structural organization:
- Is the argument order optimal?
- Are transitions effective?
- Is there proper setup and conclusion?
- Is content pacing appropriate?

---

ISSUE TYPES:

Flow issues:
- weak_transition: Poor connection between paragraphs
- argument_order: Ideas presented in suboptimal order
- buried_lead: Key point appears too late
- missing_conclusion: No proper conclusion
- missing_introduction: No clear setup
- pacing: Uneven distribution of ideas

Logic issues:
- logical_gap: Missing connecting information or reasoning
- logical_inconsistency: Contradictory statements
- unsupported_claim: Assertion without evidence or justification
- circular_reasoning: Conclusion assumes what it's trying to prove
- non_sequitur: Conclusion doesn't follow from premises

Content quality issues:
- vague_language: Imprecise terms that should be specific (e.g., "some studies show" → which studies?)
- imprecise_claim: Overstated/understated claims (e.g., "always" when "often" is accurate)
- overstatement: Claims beyond what evidence supports
- unclear_antecedent: Pronouns or references without clear targets

Redundancy issues:
- redundancy: Same information repeated across paragraphs
- verbose_passage: Could say the same thing more concisely
- tangent: Content that doesn't serve the main argument
- unnecessary_content: Filler that can be removed without loss

---

PROPOSAL TYPES:

- reorder: Move cells to improve argument flow
- merge: Combine cells that cover same topic
- split: Break apart cell covering multiple distinct points
- add: Insert new content (transitions, missing support, clarifications)
- remove: Delete content that doesn't contribute
- transition: Add connecting text between cells
- condense: Tighten verbose content while preserving ideas (provide condensed version)
- clarify: Make vague content more precise and specific (provide clarified version)

---

Respond with a JSON object:
{
  "overallScore": <0-100, combined quality score>,
  "logicScore": <0-100, logical coherence and argumentation>,
  "clarityScore": <0-100, precision and clarity of language>,
  "flowScore": <0-100, structural flow and organization>,
  "documentSummary": "<2-3 sentence assessment of the document's argument, presentation quality, and main strengths/weaknesses>",
  "issues": [
    {
      "id": "<unique-id>",
      "type": "<issue-type from list above>",
      "severity": "low" | "medium" | "high",
      "description": "<specific description with concrete example from text>",
      "affectedCells": [<cell indices>]
    }
  ],
  "proposals": [
    {
      "id": "<unique-id>",
      "type": "<proposal-type>",
      "priority": "low" | "medium" | "high",
      "description": "<what the change does>",
      "rationale": "<why this improves the document>",
      // Type-specific fields:
      // reorder: "sourceCells": [indices], "targetPosition": index
      // merge: "cellsToMerge": [indices], "mergedContent": "..."
      // split: "cellToSplit": index, "splitContent": ["...", "..."]
      // add: "insertPosition": index, "newContent": "..."
      // remove: "cellToRemove": index
      // transition: "betweenCells": [index1, index2], "transitionText": "..."
      // condense: "cellToCondense": index, "condensedContent": "...", "removedElements": ["what was cut"]
      // clarify: "cellToClarify": index, "clarifiedContent": "...", "clarifications": ["what was made specific"]
    }
  ]
}

GUIDELINES:
- Use actual cell indices from the content (shown in [brackets])
- Be SPECIFIC in issue descriptions - quote problematic text
- For condense/clarify proposals, provide complete rewritten content
- Prioritize high-impact changes that improve logical coherence and clarity
- For scientific/academic content, evaluate if the presentation optimally conveys the ideas
- When proposing removals, ensure no important ideas are lost
- Limit to 5-7 issues and 5-8 proposals maximum

Return ONLY the JSON object.`;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a Structure Analysis Agent. Respond only with valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return createDefaultAnalysis();
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and sanitize the response
    const analysis: StructureAnalysis = {
      overallScore: Math.max(0, Math.min(100, parsed.overallScore || parsed.overallFlowScore || 50)),
      logicScore: Math.max(0, Math.min(100, parsed.logicScore || 50)),
      clarityScore: Math.max(0, Math.min(100, parsed.clarityScore || 50)),
      flowScore: Math.max(0, Math.min(100, parsed.flowScore || parsed.overallFlowScore || 50)),
      documentSummary: parsed.documentSummary || 'Unable to analyze document.',
      issues: validateIssues(parsed.issues || [], cells.length),
      proposals: validateProposals(parsed.proposals || [], cells),
      analyzedAt: new Date().toISOString(),
    };

    return analysis;
  } catch (error) {
    console.error('Structure analysis error:', error);
    return createDefaultAnalysis();
  }
}

/**
 * Validate and sanitize issues from LLM response
 */
function validateIssues(issues: unknown[], maxCellIndex: number): StructureIssue[] {
  if (!Array.isArray(issues)) return [];

  const validTypes: StructureIssueType[] = [
    // Flow issues
    'weak_transition', 'argument_order', 'buried_lead',
    'missing_conclusion', 'missing_introduction', 'pacing',
    // Logic issues
    'logical_gap', 'logical_inconsistency', 'unsupported_claim',
    'circular_reasoning', 'non_sequitur',
    // Content quality issues
    'vague_language', 'imprecise_claim', 'overstatement', 'unclear_antecedent',
    // Redundancy issues
    'redundancy', 'verbose_passage', 'tangent', 'unnecessary_content'
  ];
  const validSeverities: StructureIssueSeverity[] = ['low', 'medium', 'high'];

  return issues
    .filter((issue): issue is Record<string, unknown> => typeof issue === 'object' && issue !== null)
    .map((issue, idx) => ({
      id: String(issue.id || `issue-${idx}`),
      type: validTypes.includes(issue.type as StructureIssueType)
        ? (issue.type as StructureIssueType)
        : 'logical_gap',
      severity: validSeverities.includes(issue.severity as StructureIssueSeverity)
        ? (issue.severity as StructureIssueSeverity)
        : 'medium',
      description: String(issue.description || 'Issue detected'),
      affectedCells: Array.isArray(issue.affectedCells)
        ? issue.affectedCells.filter((i): i is number => typeof i === 'number' && i >= 0 && i < maxCellIndex)
        : [],
    }))
    .slice(0, 7); // Limit to 7 issues
}

/**
 * Validate and sanitize proposals from LLM response
 */
function validateProposals(proposals: unknown[], cells: CellWithMeta[]): StructureProposal[] {
  if (!Array.isArray(proposals)) return [];

  const validTypes: StructureProposalType[] = [
    'reorder', 'merge', 'split', 'add', 'remove', 'transition', 'condense', 'clarify'
  ];
  const validPriorities: StructureProposalPriority[] = ['low', 'medium', 'high'];
  const maxIndex = cells.length;

  return proposals
    .filter((proposal): proposal is Record<string, unknown> => typeof proposal === 'object' && proposal !== null)
    .map((proposal, idx) => {
      const type = validTypes.includes(proposal.type as StructureProposalType)
        ? (proposal.type as StructureProposalType)
        : 'clarify';
      const priority = validPriorities.includes(proposal.priority as StructureProposalPriority)
        ? (proposal.priority as StructureProposalPriority)
        : 'medium';

      const base = {
        id: String(proposal.id || `proposal-${idx}`),
        priority,
        description: String(proposal.description || 'Change proposed'),
        rationale: String(proposal.rationale || 'Improves document quality'),
      };

      switch (type) {
        case 'reorder': {
          const sourceCells = Array.isArray(proposal.sourceCells)
            ? proposal.sourceCells.filter((i): i is number => typeof i === 'number' && i >= 0 && i < maxIndex)
            : [];
          const targetPosition = typeof proposal.targetPosition === 'number'
            ? Math.max(0, Math.min(maxIndex, proposal.targetPosition))
            : 0;
          return { ...base, type: 'reorder' as const, sourceCells, targetPosition };
        }
        case 'merge': {
          const cellsToMerge = Array.isArray(proposal.cellsToMerge)
            ? proposal.cellsToMerge.filter((i): i is number => typeof i === 'number' && i >= 0 && i < maxIndex)
            : [];
          const mergedContent = String(proposal.mergedContent || '');
          return { ...base, type: 'merge' as const, cellsToMerge, mergedContent };
        }
        case 'split': {
          const cellToSplit = typeof proposal.cellToSplit === 'number' && proposal.cellToSplit >= 0 && proposal.cellToSplit < maxIndex
            ? proposal.cellToSplit
            : 0;
          const splitContent = Array.isArray(proposal.splitContent)
            ? proposal.splitContent.filter((s): s is string => typeof s === 'string')
            : [];
          return { ...base, type: 'split' as const, cellToSplit, splitContent };
        }
        case 'add': {
          const insertPosition = typeof proposal.insertPosition === 'number'
            ? Math.max(0, Math.min(maxIndex, proposal.insertPosition))
            : maxIndex;
          const newContent = String(proposal.newContent || '');
          return { ...base, type: 'add' as const, insertPosition, newContent };
        }
        case 'remove': {
          const cellToRemove = typeof proposal.cellToRemove === 'number' && proposal.cellToRemove >= 0 && proposal.cellToRemove < maxIndex
            ? proposal.cellToRemove
            : 0;
          return { ...base, type: 'remove' as const, cellToRemove };
        }
        case 'transition': {
          const betweenCells: [number, number] = Array.isArray(proposal.betweenCells) && proposal.betweenCells.length >= 2
            ? [
                Math.max(0, Math.min(maxIndex - 1, Number(proposal.betweenCells[0]) || 0)),
                Math.max(0, Math.min(maxIndex - 1, Number(proposal.betweenCells[1]) || 0)),
              ]
            : [0, 1];
          const transitionText = String(proposal.transitionText || '');
          return { ...base, type: 'transition' as const, betweenCells, transitionText };
        }
        case 'condense': {
          const cellToCondense = typeof proposal.cellToCondense === 'number' && proposal.cellToCondense >= 0 && proposal.cellToCondense < maxIndex
            ? proposal.cellToCondense
            : 0;
          const condensedContent = String(proposal.condensedContent || '');
          const removedElements = Array.isArray(proposal.removedElements)
            ? proposal.removedElements.filter((s): s is string => typeof s === 'string')
            : [];
          return { ...base, type: 'condense' as const, cellToCondense, condensedContent, removedElements };
        }
        case 'clarify': {
          const cellToClarify = typeof proposal.cellToClarify === 'number' && proposal.cellToClarify >= 0 && proposal.cellToClarify < maxIndex
            ? proposal.cellToClarify
            : 0;
          const clarifiedContent = String(proposal.clarifiedContent || '');
          const clarifications = Array.isArray(proposal.clarifications)
            ? proposal.clarifications.filter((s): s is string => typeof s === 'string')
            : [];
          return { ...base, type: 'clarify' as const, cellToClarify, clarifiedContent, clarifications };
        }
        default:
          return { ...base, type: 'clarify' as const, cellToClarify: 0, clarifiedContent: '', clarifications: [] };
      }
    })
    .slice(0, 8); // Limit to 8 proposals
}

/**
 * Create a default analysis when something fails
 */
function createDefaultAnalysis(): StructureAnalysis {
  return {
    overallScore: 0,
    logicScore: 0,
    clarityScore: 0,
    flowScore: 0,
    documentSummary: 'Unable to analyze document.',
    issues: [],
    proposals: [],
    analyzedAt: new Date().toISOString(),
  };
}
