'use client';

import { useState, useCallback, useEffect } from 'react';
import type { ReviewResponse } from '@/app/api/document/review/route';

// Exported state type for persistence
export interface FeedbackPanelState {
  goals: string;
  scope: 'document' | 'section';
  selectedFocusAreas: FocusArea[];
  review: ReviewResponse | null;
  analyzedIndices: number[];
}

export const DEFAULT_FEEDBACK_STATE: FeedbackPanelState = {
  goals: '',
  scope: 'document',
  selectedFocusAreas: [],
  review: null,
  analyzedIndices: [],
};

interface FeedbackPanelProps {
  paragraphs: string[];
  selectedIndices: number[];
  documentStructure?: {
    title?: string;
    documentType?: string;
    mainArgument?: string;
    keyTerms?: string[];
  };
  // Persisted state
  savedState?: FeedbackPanelState;
  onStateChange?: (state: FeedbackPanelState) => void;
  onClose: () => void;
  onScrollToParagraph?: (index: number) => void;
  // Edit integration
  onRequestEdit?: (paragraphIndices: number[], instruction: string) => void;
}

type FocusArea = 'clarity' | 'structure' | 'flow' | 'tone' | 'content';

const FOCUS_AREAS: { value: FocusArea; label: string; icon: string }[] = [
  { value: 'clarity', label: 'Clarity', icon: '💡' },
  { value: 'structure', label: 'Structure', icon: '🏗️' },
  { value: 'flow', label: 'Flow', icon: '🌊' },
  { value: 'tone', label: 'Tone', icon: '🎭' },
  { value: 'content', label: 'Content', icon: '📝' },
];

function getTypeIcon(type: string) {
  switch (type) {
    case 'strength': return '✓';
    case 'improvement': return '↑';
    case 'suggestion': return '💡';
    case 'warning': return '⚠';
    default: return '•';
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'strength': return 'text-green-600 bg-green-50';
    case 'improvement': return 'text-blue-600 bg-blue-50';
    case 'suggestion': return 'text-purple-600 bg-purple-50';
    case 'warning': return 'text-amber-600 bg-amber-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

export default function FeedbackPanel({
  paragraphs,
  selectedIndices,
  documentStructure,
  savedState,
  onStateChange,
  onClose,
  onScrollToParagraph,
  onRequestEdit,
}: FeedbackPanelProps) {
  // Use saved state or defaults
  const [goals, setGoals] = useState(savedState?.goals ?? '');
  const [scope, setScope] = useState<'document' | 'section'>(
    savedState?.scope ?? (selectedIndices.length > 0 && selectedIndices.length < paragraphs.length ? 'section' : 'document')
  );
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<FocusArea[]>(savedState?.selectedFocusAreas ?? []);
  const [review, setReview] = useState<ReviewResponse | null>(savedState?.review ?? null);
  const [analyzedIndices, setAnalyzedIndices] = useState<number[]>(savedState?.analyzedIndices ?? []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Notify parent of state changes for persistence
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        goals,
        scope,
        selectedFocusAreas,
        review,
        analyzedIndices,
      });
    }
  }, [goals, scope, selectedFocusAreas, review, analyzedIndices, onStateChange]);

  // Auto-expand high priority items when review loads
  useEffect(() => {
    if (review) {
      const highPriorityIndices = new Set<number>(
        review.items
          .map((item, i) => item.priority === 'high' ? i : -1)
          .filter(i => i >= 0)
      );
      setExpandedItems(highPriorityIndices);
    }
  }, [review]);

  const requestReview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const indicesToAnalyze = scope === 'section' ? selectedIndices : paragraphs.map((_, i) => i);

      const res = await fetch('/api/document/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraphs,
          selectedIndices: scope === 'section' ? selectedIndices : undefined,
          documentStructure,
          focusAreas: selectedFocusAreas.length > 0 ? selectedFocusAreas : undefined,
          goals: goals.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to get review');
      }

      const data = await res.json();
      setReview(data.review);
      setAnalyzedIndices(indicesToAnalyze);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get review');
    } finally {
      setLoading(false);
    }
  }, [paragraphs, selectedIndices, documentStructure, scope, selectedFocusAreas, goals]);

  const toggleFocusArea = (area: FocusArea) => {
    setSelectedFocusAreas(prev =>
      prev.includes(area)
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const toggleItem = (index: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApplyEdit = (item: ReviewResponse['items'][0]) => {
    if (!onRequestEdit) return;

    // Determine which paragraphs to edit
    const targetIndices = item.location?.paragraphIndices?.length
      ? item.location.paragraphIndices
      : analyzedIndices;

    // Create instruction from the feedback
    const instruction = `${item.title}: ${item.description}`;

    onRequestEdit(targetIndices, instruction);
  };

  const hasSelection = selectedIndices.length > 0 && selectedIndices.length < paragraphs.length;

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h3 className="font-semibold">Document Review</h3>
          </div>
          <button
            onClick={onClose}
            className="text-xl leading-none hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Get high-level feedback and suggestions for improvement
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!review && !loading && (
          <div className="p-4 space-y-4">
            {/* Scope Selection */}
            {hasSelection && (
              <div>
                <label className="block text-xs font-medium mb-2">Review Scope</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScope('document')}
                    className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                      scope === 'document'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-[var(--border)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    Full Document
                  </button>
                  <button
                    onClick={() => setScope('section')}
                    className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                      scope === 'section'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-[var(--border)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    Selected Section
                    <span className="ml-1 text-xs opacity-70">
                      ({selectedIndices.length} ¶)
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Goals Input */}
            <div>
              <label className="block text-xs font-medium mb-2">
                Your Goals <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
              </label>
              <textarea
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="e.g., Make this section more persuasive, ensure the argument is clear, prepare for peer review..."
                className="w-full h-20 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none"
              />
            </div>

            {/* Focus Areas */}
            <div>
              <label className="block text-xs font-medium mb-2">
                Focus Areas <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map(area => (
                  <button
                    key={area.value}
                    onClick={() => toggleFocusArea(area.value)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedFocusAreas.includes(area.value)
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-[var(--border)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    {area.icon} {area.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <p className="font-medium mb-1">What you'll get:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                <li>Overall quality assessment</li>
                <li>Specific strengths and areas for improvement</li>
                <li>Prioritized action items</li>
                {scope === 'section' && <li>Analysis within document context</li>}
              </ul>
            </div>

            {/* Request Button */}
            <button
              onClick={requestReview}
              disabled={loading || paragraphs.length === 0}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
            >
              Get Feedback
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[var(--muted-foreground)]">
              Analyzing {scope === 'section' ? 'section' : 'document'}...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
            <button
              onClick={requestReview}
              className="mt-3 w-full py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Review Results */}
        {review && (
          <div className="p-4 space-y-4">
            {/* Score & Summary */}
            <div className="p-4 bg-[var(--muted)]/30 rounded-lg">
              <div className="flex items-center gap-4 mb-3">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${getScoreColor(review.overallScore)}`}>
                    {review.overallScore}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">Score</div>
                </div>
                <div className="flex-1 text-sm">
                  {review.summary}
                </div>
              </div>
            </div>

            {/* Action Items */}
            {review.actionItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                  <span>🎯</span> Priority Actions
                </h4>
                <ol className="space-y-2">
                  {review.actionItems.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg text-sm"
                    >
                      <span className="flex-shrink-0 w-5 h-5 bg-amber-200 text-amber-700 rounded-full text-xs flex items-center justify-center font-medium">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-amber-800">{item}</span>
                      {onRequestEdit && (
                        <button
                          onClick={() => onRequestEdit(analyzedIndices, item)}
                          className="flex-shrink-0 px-2 py-1 text-[10px] bg-amber-200 text-amber-800 rounded hover:bg-amber-300"
                          title="Apply this suggestion"
                        >
                          Apply
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Feedback Items */}
            <div>
              <h4 className="text-xs font-semibold mb-2">Detailed Feedback</h4>
              <div className="space-y-2">
                {review.items.map((item, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border border-[var(--border)] overflow-hidden ${
                      expandedItems.has(i) ? 'bg-[var(--muted)]/20' : ''
                    }`}
                  >
                    {/* Item Header */}
                    <button
                      onClick={() => toggleItem(i)}
                      className="w-full p-3 flex items-start gap-2 text-left hover:bg-[var(--muted)]/30 transition-colors"
                    >
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${getTypeColor(item.type)}`}>
                        {getTypeIcon(item.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{item.title}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${getPriorityBadge(item.priority)}`}>
                            {item.priority}
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                            {item.category}
                          </span>
                        </div>
                        {!expandedItems.has(i) && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-1 truncate">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${
                          expandedItems.has(i) ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Content */}
                    {expandedItems.has(i) && (
                      <div className="px-3 pb-3 pt-0">
                        <p className="text-sm text-[var(--foreground)] mb-2 pl-8">
                          {item.description}
                        </p>
                        {item.location && (
                          <div className="pl-8 space-y-2">
                            {item.location.excerpt && (
                              <div className="text-xs italic text-[var(--muted-foreground)] bg-[var(--muted)]/50 p-2 rounded border-l-2 border-[var(--border)]">
                                &ldquo;{item.location.excerpt}&rdquo;
                              </div>
                            )}
                            {item.location.paragraphIndices && item.location.paragraphIndices.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                {onScrollToParagraph && (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-[10px] text-[var(--muted-foreground)]">Jump to:</span>
                                    {item.location.paragraphIndices.map(pIndex => (
                                      <button
                                        key={pIndex}
                                        onClick={() => onScrollToParagraph(pIndex)}
                                        className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                      >
                                        ¶{pIndex + 1}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Apply Edit Button - only show for non-strength items */}
                        {item.type !== 'strength' && onRequestEdit && (
                          <div className="pl-8 mt-3">
                            <button
                              onClick={() => handleApplyEdit(item)}
                              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                            >
                              <span>✏️</span> Apply This Suggestion
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* New Review Button */}
            <button
              onClick={() => setReview(null)}
              className="w-full py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
            >
              Request New Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
