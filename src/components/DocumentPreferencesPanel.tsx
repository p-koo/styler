'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DocumentPreferences, AudienceProfile, DocumentAdjustments } from '@/types';

interface DocumentPreferencesPanelProps {
  documentId: string;
  profiles: AudienceProfile[];
  onClose?: () => void;
}

interface PreferencesSummary {
  hasAdjustments: boolean;
  adjustmentSummary: string[];
  editCount: number;
  acceptanceRate: number;
}

interface Stats {
  total: number;
  accepted: number;
  rejected: number;
  partial: number;
  acceptanceRate: number;
}

/**
 * Panel showing document-specific preferences and learning adjustments.
 */
export default function DocumentPreferencesPanel({
  documentId,
  profiles,
  onClose,
}: DocumentPreferencesPanelProps) {
  const [preferences, setPreferences] = useState<DocumentPreferences | null>(null);
  const [summary, setSummary] = useState<PreferencesSummary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>('new');
  const [newProfileName, setNewProfileName] = useState('');
  const [merging, setMerging] = useState(false);
  const [clearAfterMerge, setClearAfterMerge] = useState(true);

  // Load preferences
  const loadPreferences = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load preferences');
      }

      setPreferences(data.preferences);
      setSummary(data.summary);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update adjustments
  const updateAdjustment = async (
    key: keyof Pick<DocumentAdjustments, 'verbosityAdjust' | 'formalityAdjust' | 'hedgingAdjust'>,
    value: number
  ) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustments: { [key]: value },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPreferences(data.preferences);
        setSummary(data.summary);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to update adjustment:', err);
    }
  };

  // Clear adjustments
  const handleClearAdjustments = async () => {
    if (!confirm('Reset all learned adjustments for this document?')) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences?keepHistory=true`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setPreferences(data.preferences);
        setSummary(data.summary);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to clear adjustments:', err);
    }
  };

  // Merge to profile
  const handleMerge = async () => {
    if (mergeTarget === 'new' && !newProfileName.trim()) {
      alert('Please enter a name for the new profile');
      return;
    }

    setMerging(true);

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetProfileId: mergeTarget,
          newProfileName: mergeTarget === 'new' ? newProfileName.trim() : undefined,
          clearAfterMerge,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to merge preferences');
      }

      alert(`Successfully merged to profile: ${data.profile.name}`);
      setShowMergeModal(false);

      // Reload preferences
      await loadPreferences();

      // Reload the page to update profiles list
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to merge preferences');
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-[var(--muted-foreground)]">
        Loading preferences...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={loadPreferences}
          className="mt-2 text-sm text-[var(--primary)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-medium">Document Preferences</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ×
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Edit Statistics */}
        {stats && stats.total > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Edit History</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-[var(--muted)]/50 rounded">
                <div className="text-lg font-semibold">{stats.total}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Total Edits</div>
              </div>
              <div className="p-2 bg-[var(--muted)]/50 rounded">
                <div className="text-lg font-semibold">
                  {Math.round(stats.acceptanceRate * 100)}%
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">Acceptance Rate</div>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <div className="text-lg font-semibold text-green-600">{stats.accepted}</div>
                <div className="text-xs text-green-600/70">Accepted</div>
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <div className="text-lg font-semibold text-red-600">{stats.rejected}</div>
                <div className="text-xs text-red-600/70">Rejected</div>
              </div>
            </div>
          </div>
        )}

        {/* Learned Adjustments */}
        {preferences && (
          <div>
            <h4 className="text-sm font-medium mb-3">Learned Adjustments</h4>
            <div className="space-y-4">
              {/* Verbosity */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Verbosity</span>
                  <span>
                    {preferences.adjustments.verbosityAdjust > 0 ? '+' : ''}
                    {preferences.adjustments.verbosityAdjust.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">Terse</span>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={preferences.adjustments.verbosityAdjust}
                    onChange={(e) => updateAdjustment('verbosityAdjust', parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-[var(--muted-foreground)]">Detailed</span>
                </div>
              </div>

              {/* Formality */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Formality</span>
                  <span>
                    {preferences.adjustments.formalityAdjust > 0 ? '+' : ''}
                    {preferences.adjustments.formalityAdjust.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">Casual</span>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={preferences.adjustments.formalityAdjust}
                    onChange={(e) => updateAdjustment('formalityAdjust', parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-[var(--muted-foreground)]">Formal</span>
                </div>
              </div>

              {/* Hedging */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Hedging</span>
                  <span>
                    {preferences.adjustments.hedgingAdjust > 0 ? '+' : ''}
                    {preferences.adjustments.hedgingAdjust.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">Confident</span>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={preferences.adjustments.hedgingAdjust}
                    onChange={(e) => updateAdjustment('hedgingAdjust', parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-[var(--muted)] rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-[var(--muted-foreground)]">Cautious</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Additional Words to Avoid */}
        {preferences && preferences.adjustments.additionalAvoidWords.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Additional Words to Avoid</h4>
            <div className="flex flex-wrap gap-1">
              {preferences.adjustments.additionalAvoidWords.map((word, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 text-xs rounded"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Learned Rules */}
        {preferences && preferences.adjustments.learnedRules.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Learned Rules</h4>
            <ul className="space-y-1">
              {preferences.adjustments.learnedRules.map((rule, i) => (
                <li key={i} className="text-xs text-[var(--foreground)]/80 flex items-start gap-2">
                  <span className="text-[var(--muted-foreground)]">•</span>
                  <span>{rule.rule}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No adjustments message */}
        {summary && !summary.hasAdjustments && stats && stats.total === 0 && (
          <div className="text-center text-[var(--muted-foreground)] text-sm py-4">
            <p>No preferences learned yet.</p>
            <p className="text-xs mt-1">
              Make some edits and the system will learn from your accept/reject decisions.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-[var(--border)] space-y-2">
        {summary?.hasAdjustments && (
          <button
            onClick={() => setShowMergeModal(true)}
            className="w-full py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm font-medium"
          >
            Merge to Profile
          </button>
        )}
        <button
          onClick={handleClearAdjustments}
          disabled={!summary?.hasAdjustments}
          className="w-full py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset Adjustments
        </button>
      </div>

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="font-medium">Merge to Profile</h3>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-[var(--muted-foreground)]">
                Save the learned preferences from this document to a global profile.
              </p>

              {/* What will be merged */}
              {summary && summary.adjustmentSummary.length > 0 && (
                <div className="p-3 bg-[var(--muted)]/50 rounded-lg">
                  <h4 className="text-xs font-medium mb-1">Will be merged:</h4>
                  <ul className="text-xs text-[var(--muted-foreground)] space-y-0.5">
                    {summary.adjustmentSummary.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Target selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Merge to:</label>
                <select
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-sm"
                >
                  <option value="new">Create new profile</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* New profile name */}
              {mergeTarget === 'new' && (
                <div>
                  <label className="block text-sm font-medium mb-2">New profile name:</label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="e.g., Academic Writing (Refined)"
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-sm"
                  />
                </div>
              )}

              {/* Clear after merge */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clearAfterMerge}
                  onChange={(e) => setClearAfterMerge(e.target.checked)}
                  className="rounded"
                />
                <span>Clear document adjustments after merge</span>
              </label>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                onClick={() => setShowMergeModal(false)}
                className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={merging || (mergeTarget === 'new' && !newProfileName.trim())}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm disabled:opacity-50"
              >
                {merging ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
