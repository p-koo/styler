'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DocumentAdjustments } from '@/types';

interface InlineDocumentPrefsProps {
  documentId: string;
  onPreferencesChange?: (adjustments: DocumentAdjustments) => void;
}

const DEFAULT_ADJUSTMENTS: DocumentAdjustments = {
  verbosityAdjust: 0,
  formalityAdjust: 0,
  hedgingAdjust: 0,
  additionalAvoidWords: [],
  additionalPreferWords: {},
  additionalFramingGuidance: [],
  learnedRules: [],
};

/**
 * Inline document preferences editor shown in the edit panel.
 * Allows users to view and adjust document-specific style preferences.
 */
export default function InlineDocumentPrefs({
  documentId,
  onPreferencesChange,
}: InlineDocumentPrefsProps) {
  const [adjustments, setAdjustments] = useState<DocumentAdjustments>(DEFAULT_ADJUSTMENTS);
  const [editCount, setEditCount] = useState(0);
  const [acceptanceRate, setAcceptanceRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!documentId) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences`);
      const data = await res.json();

      if (res.ok && data.preferences) {
        setAdjustments(data.preferences.adjustments);
        setEditCount(data.stats?.total || 0);
        setAcceptanceRate(data.stats?.acceptanceRate || 0);
      }
    } catch (err) {
      console.error('Failed to load document preferences:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update a single adjustment
  const updateAdjustment = async (
    key: 'verbosityAdjust' | 'formalityAdjust' | 'hedgingAdjust',
    value: number
  ) => {
    const newAdjustments = { ...adjustments, [key]: value };
    setAdjustments(newAdjustments);

    // Notify parent
    onPreferencesChange?.(newAdjustments);

    // Debounced save
    setSaving(true);
    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments: { [key]: value } }),
      });
    } catch (err) {
      console.error('Failed to save adjustment:', err);
    } finally {
      setSaving(false);
    }
  };

  // Reset adjustments
  const handleReset = async () => {
    if (!confirm('Reset all learned adjustments for this document?')) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences?keepHistory=true`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setAdjustments(data.preferences.adjustments);
        onPreferencesChange?.(data.preferences.adjustments);
      }
    } catch (err) {
      console.error('Failed to reset adjustments:', err);
    }
  };

  // Check if there are any adjustments
  const hasAdjustments =
    adjustments.verbosityAdjust !== 0 ||
    adjustments.formalityAdjust !== 0 ||
    adjustments.hedgingAdjust !== 0 ||
    adjustments.additionalAvoidWords.length > 0 ||
    adjustments.learnedRules.length > 0;

  if (loading) {
    return (
      <div className="text-xs text-[var(--muted-foreground)] py-2">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border)] pt-4 mt-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-medium hover:text-[var(--primary)] transition-colors"
      >
        <span className="flex items-center gap-2">
          Document Preferences
          {hasAdjustments && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
              Active
            </span>
          )}
          {saving && (
            <span className="text-xs text-[var(--muted-foreground)]">Saving...</span>
          )}
        </span>
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Stats summary when collapsed */}
      {!expanded && editCount > 0 && (
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
          {editCount} edits • {Math.round(acceptanceRate * 100)}% accepted
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Stats */}
          {editCount > 0 && (
            <div className="flex gap-3 text-xs">
              <div className="px-2 py-1 bg-[var(--muted)] rounded">
                <span className="font-medium">{editCount}</span> edits
              </div>
              <div className="px-2 py-1 bg-[var(--muted)] rounded">
                <span className="font-medium">{Math.round(acceptanceRate * 100)}%</span> accepted
              </div>
            </div>
          )}

          {/* Sliders */}
          <div className="space-y-3">
            {/* Verbosity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Verbosity</span>
                <span className="text-[var(--muted-foreground)]">
                  {adjustments.verbosityAdjust > 0 ? '+' : ''}{adjustments.verbosityAdjust.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted-foreground)] w-10">Terse</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={adjustments.verbosityAdjust}
                  onChange={(e) => updateAdjustment('verbosityAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="text-[10px] text-[var(--muted-foreground)] w-12 text-right">Detailed</span>
              </div>
            </div>

            {/* Formality */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Formality</span>
                <span className="text-[var(--muted-foreground)]">
                  {adjustments.formalityAdjust > 0 ? '+' : ''}{adjustments.formalityAdjust.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted-foreground)] w-10">Casual</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={adjustments.formalityAdjust}
                  onChange={(e) => updateAdjustment('formalityAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="text-[10px] text-[var(--muted-foreground)] w-12 text-right">Formal</span>
              </div>
            </div>

            {/* Hedging */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Hedging</span>
                <span className="text-[var(--muted-foreground)]">
                  {adjustments.hedgingAdjust > 0 ? '+' : ''}{adjustments.hedgingAdjust.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted-foreground)] w-10">Bold</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={adjustments.hedgingAdjust}
                  onChange={(e) => updateAdjustment('hedgingAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="text-[10px] text-[var(--muted-foreground)] w-12 text-right">Cautious</span>
              </div>
            </div>
          </div>

          {/* Avoid words */}
          {adjustments.additionalAvoidWords.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Words to Avoid</div>
              <div className="flex flex-wrap gap-1">
                {adjustments.additionalAvoidWords.slice(0, 8).map((word, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded"
                  >
                    {word}
                  </span>
                ))}
                {adjustments.additionalAvoidWords.length > 8 && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    +{adjustments.additionalAvoidWords.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Learned rules */}
          {adjustments.learnedRules.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Learned Rules</div>
              <ul className="space-y-0.5">
                {adjustments.learnedRules.slice(0, 3).map((rule, i) => (
                  <li key={i} className="text-[10px] text-[var(--muted-foreground)]">
                    • {rule.rule}
                  </li>
                ))}
                {adjustments.learnedRules.length > 3 && (
                  <li className="text-[10px] text-[var(--muted-foreground)]">
                    +{adjustments.learnedRules.length - 3} more rules
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Reset button */}
          {hasAdjustments && (
            <button
              onClick={handleReset}
              className="w-full py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)] transition-colors"
            >
              Reset Learned Preferences
            </button>
          )}

          {/* Empty state */}
          {!hasAdjustments && editCount === 0 && (
            <p className="text-xs text-[var(--muted-foreground)] text-center py-2">
              No preferences learned yet. The system will learn from your accept/reject decisions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
