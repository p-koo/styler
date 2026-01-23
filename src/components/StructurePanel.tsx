'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  StructureAnalysis,
  StructureProposal,
  StructureIssue,
  StructurePanelState,
  DocumentGoals,
} from '@/types';

// Default state for the panel
export const DEFAULT_STRUCTURE_STATE: StructurePanelState = {
  scope: 'document',
  lastAnalysis: null,
  selectedProposals: [],
  expandedProposals: [],
};

interface StructurePanelProps {
  cells: Array<{ index: number; content: string; type?: 'cell' | 'heading' }>;
  selectedIndices: number[];
  documentTitle?: string;
  documentGoals?: DocumentGoals;
  model?: string;
  isLoading?: boolean;
  savedState?: StructurePanelState;
  onStateChange?: (state: StructurePanelState) => void;
  onClose: () => void;
  onApplyProposals?: (proposals: StructureProposal[]) => void;
  hideHeader?: boolean;
  onStop?: () => void;
  focusOnConciseness?: boolean; // User wants conciseness suggestions
}

// Get color for flow score
function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-green-50 border-green-200';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

// Get icon for proposal type
function getProposalIcon(type: StructureProposal['type']) {
  switch (type) {
    case 'reorder': return '↕️';
    case 'merge': return '🔗';
    case 'split': return '✂️';
    case 'add': return '➕';
    case 'remove': return '🗑️';
    case 'transition': return '🔀';
    case 'condense': return '📐';
    case 'clarify': return '🔍';
    default: return '📝';
  }
}

// Get category for issue type (for grouping)
function getIssueCategory(type: StructureIssue['type']): 'logic' | 'clarity' | 'flow' | 'redundancy' {
  const logicTypes = ['logical_gap', 'logical_inconsistency', 'unsupported_claim', 'circular_reasoning', 'non_sequitur'];
  const clarityTypes = ['vague_language', 'imprecise_claim', 'overstatement', 'unclear_antecedent'];
  const redundancyTypes = ['redundancy', 'verbose_passage', 'tangent', 'unnecessary_content'];

  if (logicTypes.includes(type)) return 'logic';
  if (clarityTypes.includes(type)) return 'clarity';
  if (redundancyTypes.includes(type)) return 'redundancy';
  return 'flow';
}

// Get category label
function getCategoryLabel(category: 'logic' | 'clarity' | 'flow' | 'redundancy'): string {
  switch (category) {
    case 'logic': return 'Logic';
    case 'clarity': return 'Clarity';
    case 'flow': return 'Flow';
    case 'redundancy': return 'Conciseness';
  }
}

// Get category color
function getCategoryColor(category: 'logic' | 'clarity' | 'flow' | 'redundancy'): string {
  switch (category) {
    case 'logic': return 'bg-orange-100 text-orange-700';
    case 'clarity': return 'bg-blue-100 text-blue-700';
    case 'flow': return 'bg-purple-100 text-purple-700';
    case 'redundancy': return 'bg-amber-100 text-amber-700';
  }
}

// Get color for priority badge
function getPriorityColor(priority: StructureProposal['priority']) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-gray-100 text-gray-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// Get icon for issue severity
function getSeverityIcon(severity: StructureIssue['severity']) {
  switch (severity) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

export default function StructurePanel({
  cells,
  selectedIndices,
  documentTitle,
  documentGoals,
  model,
  isLoading: parentLoading = false,
  savedState,
  onStateChange,
  onClose,
  onApplyProposals,
  hideHeader = false,
  onStop,
  focusOnConciseness = false,
}: StructurePanelProps) {
  // State
  const [scope, setScope] = useState<'document' | 'selection'>(
    savedState?.scope ?? (selectedIndices.length > 0 && selectedIndices.length < cells.length ? 'selection' : 'document')
  );
  const [analysis, setAnalysis] = useState<StructureAnalysis | null>(savedState?.lastAnalysis ?? null);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set(savedState?.selectedProposals ?? []));
  const [expandedProposals, setExpandedProposals] = useState<Set<string>>(new Set(savedState?.expandedProposals ?? []));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantsConcise, setWantsConcise] = useState(focusOnConciseness);

  const isLoading = parentLoading || isAnalyzing;

  // Notify parent of state changes for persistence
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        scope,
        lastAnalysis: analysis,
        selectedProposals: Array.from(selectedProposals),
        expandedProposals: Array.from(expandedProposals),
      });
    }
  }, [scope, analysis, selectedProposals, expandedProposals, onStateChange]);

  // Analyze structure
  const handleAnalyze = useCallback(async () => {
    if (isLoading || cells.length === 0) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const targetIndices = scope === 'selection' && selectedIndices.length > 0
        ? selectedIndices
        : undefined;

      const response = await fetch('/api/document/analyze-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells,
          selectedIndices: targetIndices,
          documentTitle,
          documentGoals,
          model,
          options: {
            focusOnConciseness: wantsConcise,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setSelectedProposals(new Set()); // Clear selections for new analysis
      setExpandedProposals(new Set());
    } catch (err) {
      console.error('Structure analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [cells, scope, selectedIndices, documentTitle, documentGoals, model, isLoading, wantsConcise]);

  // Toggle proposal selection
  const toggleProposal = (id: string) => {
    setSelectedProposals(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle proposal expansion
  const toggleExpanded = (id: string) => {
    setExpandedProposals(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Apply selected proposals
  const handleApplySelected = useCallback(() => {
    if (!analysis || !onApplyProposals) return;
    const selected = analysis.proposals.filter(p => selectedProposals.has(p.id));
    if (selected.length > 0) {
      onApplyProposals(selected);
    }
  }, [analysis, selectedProposals, onApplyProposals]);

  // Apply all proposals
  const handleApplyAll = useCallback(() => {
    if (!analysis || !onApplyProposals) return;
    onApplyProposals(analysis.proposals);
  }, [analysis, onApplyProposals]);

  // Get preview content for a proposal
  const getProposalPreview = (proposal: StructureProposal): string => {
    switch (proposal.type) {
      case 'merge':
        return proposal.mergedContent || '(merged content)';
      case 'split':
        return proposal.splitContent.map((s, i) => `[${i + 1}] ${s}`).join('\n\n');
      case 'add':
        return proposal.newContent || '(new content)';
      case 'transition':
        return proposal.transitionText || '(transition text)';
      case 'reorder':
        return `Move cells ${proposal.sourceCells.map(i => i + 1).join(', ')} to position ${proposal.targetPosition + 1}`;
      case 'remove':
        return `Remove cell ${proposal.cellToRemove + 1}`;
      case 'condense':
        return `${proposal.condensedContent}\n\n---\nRemoved: ${proposal.removedElements.join('; ') || '(redundant phrases)'}`;
      case 'clarify':
        return `${proposal.clarifiedContent}\n\n---\nClarified: ${proposal.clarifications.join('; ') || '(vague language)'}`;
      default:
        return '';
    }
  };

  const hasSelection = selectedIndices.length > 0 && selectedIndices.length < cells.length;
  const selectedCount = selectedProposals.size;

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header - only show if not embedded in tabbed container */}
      {!hideHeader && (
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏗️</span>
              <h3 className="font-semibold">Structure</h3>
            </div>
            <button
              onClick={onClose}
              className="text-xl leading-none hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Analyze and reorganize document structure
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Scope Selection */}
        {hasSelection && (
          <div>
            <label className="block text-xs font-medium mb-2">Analysis Scope</label>
            <div className="flex gap-2">
              <button
                onClick={() => setScope('document')}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                  scope === 'document'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
              >
                Full Document
                <span className="ml-1 text-xs opacity-70">({cells.length})</span>
              </button>
              <button
                onClick={() => setScope('selection')}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                  scope === 'selection'
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
              >
                Selection
                <span className="ml-1 text-xs opacity-70">({selectedIndices.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Focus Options */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsConcise}
              onChange={(e) => setWantsConcise(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm">Focus on conciseness</span>
          </label>
          <span className="text-xs text-[var(--muted-foreground)]">
            (suggest content to remove)
          </span>
        </div>

        {/* Analyze Button */}
        <div className="flex gap-2">
          <button
            onClick={handleAnalyze}
            disabled={isLoading || cells.length === 0}
            className="flex-1 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                🏗️ Analyze Document
              </>
            )}
          </button>
          {isAnalyzing && onStop && (
            <button
              onClick={onStop}
              className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
              title="Stop"
            >
              ◼
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <>
            {/* Scores */}
            <div className={`p-4 rounded-lg border ${getScoreBg(analysis.overallScore)}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${getScoreColor(analysis.overallScore)}`}>
                    {analysis.overallScore}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Overall</div>
                </div>
                <div className="flex-1 text-sm text-[var(--muted-foreground)]">
                  {analysis.documentSummary}
                </div>
              </div>
              {/* Individual Scores */}
              <div className="flex gap-4 pt-2 border-t border-[var(--border)]">
                <div className="flex-1 text-center">
                  <div className={`text-lg font-semibold ${getScoreColor(analysis.logicScore)}`}>
                    {analysis.logicScore}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Logic</div>
                </div>
                <div className="flex-1 text-center">
                  <div className={`text-lg font-semibold ${getScoreColor(analysis.clarityScore)}`}>
                    {analysis.clarityScore}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Clarity</div>
                </div>
                <div className="flex-1 text-center">
                  <div className={`text-lg font-semibold ${getScoreColor(analysis.flowScore)}`}>
                    {analysis.flowScore}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Flow</div>
                </div>
              </div>
            </div>

            {/* Issues */}
            {analysis.issues.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Issues ({analysis.issues.length})
                </h4>
                <div className="space-y-2">
                  {analysis.issues.map((issue) => {
                    const category = getIssueCategory(issue.type);
                    return (
                      <div
                        key={issue.id}
                        className="p-2 bg-[var(--muted)] rounded-lg text-sm"
                      >
                        <div className="flex items-start gap-2">
                          <span>{getSeverityIcon(issue.severity)}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryColor(category)}`}>
                                {getCategoryLabel(category)}
                              </span>
                            </div>
                            <div className="font-medium">{issue.description}</div>
                            {issue.affectedCells.length > 0 && (
                              <div className="text-xs text-[var(--muted-foreground)] mt-1">
                                Cells: {issue.affectedCells.map(i => i + 1).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proposals */}
            {analysis.proposals.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Proposals ({analysis.proposals.length})
                </h4>
                <div className="space-y-2">
                  {analysis.proposals.map((proposal) => {
                    const isSelected = selectedProposals.has(proposal.id);
                    const isExpanded = expandedProposals.has(proposal.id);
                    const preview = getProposalPreview(proposal);

                    return (
                      <div
                        key={proposal.id}
                        className={`border rounded-lg transition-colors ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-[var(--border)]'
                        }`}
                      >
                        <div className="p-2">
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleProposal(proposal.id)}
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${
                                isSelected
                                  ? 'bg-teal-500 border-teal-500 text-white'
                                  : 'border-[var(--border)]'
                              }`}
                            >
                              {isSelected && <span className="text-xs">✓</span>}
                            </button>

                            {/* Icon */}
                            <span>{getProposalIcon(proposal.type)}</span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  {proposal.description}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getPriorityColor(proposal.priority)}`}>
                                  {proposal.priority}
                                </span>
                              </div>
                              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                {proposal.rationale}
                              </div>
                            </div>
                          </div>

                          {/* Preview Toggle */}
                          {preview && (
                            <button
                              onClick={() => toggleExpanded(proposal.id)}
                              className="mt-2 text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                            >
                              <span>{isExpanded ? '▼' : '▶'}</span>
                              {isExpanded ? 'Hide preview' : 'Show preview'}
                            </button>
                          )}
                        </div>

                        {/* Preview Content */}
                        {isExpanded && preview && (
                          <div className="px-2 pb-2">
                            <div className="p-2 bg-white dark:bg-gray-800 rounded border border-[var(--border)] text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {preview}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Apply Buttons */}
            {analysis.proposals.length > 0 && onApplyProposals && (
              <div className="flex gap-2">
                <button
                  onClick={handleApplySelected}
                  disabled={selectedCount === 0 || isLoading}
                  className="flex-1 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Apply Selected ({selectedCount})
                </button>
                <button
                  onClick={handleApplyAll}
                  disabled={isLoading}
                  className="py-2 px-4 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Apply All
                </button>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!analysis && !isAnalyzing && !error && (
          <div className="p-3 bg-[var(--muted)]/50 rounded-lg text-xs text-[var(--muted-foreground)]">
            <p className="font-medium mb-1">Comprehensive Document Analysis</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>Logic:</strong> Identifies unsupported claims, logical gaps, inconsistencies</li>
              <li><strong>Clarity:</strong> Finds vague language, imprecise claims, unclear references</li>
              <li><strong>Flow:</strong> Detects weak transitions, buried leads, poor argument order</li>
              <li><strong>Conciseness:</strong> Suggests content to remove or tighten (enable checkbox)</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
