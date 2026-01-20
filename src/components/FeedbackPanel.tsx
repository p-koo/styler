'use client';

import { useState, useCallback, useEffect } from 'react';

// Exported state type for persistence
export interface FeedbackPanelState {
  guidance: string;
  scope: 'document' | 'section';
  selectedVibes: string[]; // Selected quick vibe labels
  lastAlignmentScore: number | null;
}

export const DEFAULT_FEEDBACK_STATE: FeedbackPanelState = {
  guidance: '',
  scope: 'document',
  selectedVibes: [],
  lastAlignmentScore: null,
};

interface FeedbackPanelProps {
  cells: string[];
  selectedIndices: number[];
  activeProfileName?: string;
  isLoading?: boolean; // Loading state from parent (edit in progress)
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
  // Edit integration - now the primary action
  onRequestEdit?: (cellIndices: number[], instruction: string) => void;
  // Hide header when used inside tabbed container
  hideHeader?: boolean;
  // Stop/cancel current request
  onStop?: () => void;
}

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

// Quick vibe presets
const VIBE_PRESETS = [
  { label: 'Polish', instruction: 'Polish and refine the writing for clarity and flow' },
  { label: 'Concise', instruction: 'Make the writing more concise and direct' },
  { label: 'Formal', instruction: 'Make the tone more formal and professional' },
  { label: 'Engaging', instruction: 'Make the writing more engaging and compelling' },
  { label: 'Clear', instruction: 'Improve clarity and readability' },
  { label: 'Academic', instruction: 'Adjust for academic writing standards' },
];

export default function FeedbackPanel({
  cells,
  selectedIndices,
  activeProfileName,
  isLoading = false,
  documentStructure,
  savedState,
  onStateChange,
  onClose,
  onRequestEdit,
  hideHeader = false,
  onStop,
}: FeedbackPanelProps) {
  // State
  const [guidance, setGuidance] = useState(savedState?.guidance ?? '');
  const [scope, setScope] = useState<'document' | 'section'>(
    savedState?.scope ?? (selectedIndices.length > 0 && selectedIndices.length < cells.length ? 'section' : 'document')
  );
  const [selectedVibes, setSelectedVibes] = useState<string[]>(savedState?.selectedVibes ?? []);
  const [lastAlignmentScore, setLastAlignmentScore] = useState<number | null>(savedState?.lastAlignmentScore ?? null);

  // Notify parent of state changes for persistence
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        guidance,
        scope,
        selectedVibes,
        lastAlignmentScore,
      });
    }
  }, [guidance, scope, selectedVibes, lastAlignmentScore, onStateChange]);

  // Toggle a quick vibe selection
  const toggleVibe = (label: string) => {
    setSelectedVibes(prev =>
      prev.includes(label)
        ? prev.filter(v => v !== label)
        : [...prev, label]
    );
  };

  // Get target indices based on scope
  const getTargetIndices = useCallback(() => {
    if (scope === 'section' && selectedIndices.length > 0) {
      return selectedIndices;
    }
    return cells.map((_, i) => i);
  }, [scope, selectedIndices, cells]);

  // Build combined instruction from selected vibes + custom guidance
  const buildInstruction = useCallback(() => {
    const parts: string[] = [];

    // Add selected vibe instructions
    for (const label of selectedVibes) {
      const preset = VIBE_PRESETS.find(p => p.label === label);
      if (preset) {
        parts.push(preset.instruction);
      }
    }

    // Add custom guidance
    if (guidance.trim()) {
      parts.push(guidance.trim());
    }

    // If nothing selected, use default
    if (parts.length === 0) {
      return 'Improve the writing while maintaining the original meaning and aligning with the style profile';
    }

    return parts.join('. ');
  }, [selectedVibes, guidance]);

  // Apply vibe edit
  const handleApplyVibe = useCallback(() => {
    if (!onRequestEdit || isLoading) return;

    const targetIndices = getTargetIndices();
    if (targetIndices.length === 0) return;

    const instruction = buildInstruction();
    onRequestEdit(targetIndices, instruction);
  }, [onRequestEdit, getTargetIndices, buildInstruction, isLoading]);

  const hasSelection = selectedIndices.length > 0 && selectedIndices.length < cells.length;
  const targetCount = scope === 'section' ? selectedIndices.length : cells.length;
  const hasVibesOrGuidance = selectedVibes.length > 0 || guidance.trim().length > 0;

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header - only show if not embedded in tabbed container */}
      {!hideHeader && (
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">✨</span>
              <h3 className="font-semibold">Vibe Edit</h3>
            </div>
            <button
              onClick={onClose}
              className="text-xl leading-none hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Document-level editing aligned to your style
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Profile Display */}
        {activeProfileName && (
          <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
            <span className="text-purple-600 text-sm">📋</span>
            <span className="text-sm text-purple-700">Profile: <strong>{activeProfileName}</strong></span>
          </div>
        )}

        {/* Scope Selection */}
        {hasSelection && (
          <div>
            <label className="block text-xs font-medium mb-2">Edit Scope</label>
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
                <span className="ml-1 text-xs opacity-70">({cells.length})</span>
              </button>
              <button
                onClick={() => setScope('section')}
                className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                  scope === 'section'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
              >
                Selection
                <span className="ml-1 text-xs opacity-70">({selectedIndices.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Vibes */}
        <div>
          <label className="block text-xs font-medium mb-2">Quick Vibes <span className="font-normal text-[var(--muted-foreground)]">(select multiple)</span></label>
          <div className="flex flex-wrap gap-2">
            {VIBE_PRESETS.map((preset) => {
              const isSelected = selectedVibes.includes(preset.label);
              return (
                <button
                  key={preset.label}
                  onClick={() => toggleVibe(preset.label)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-purple-500 bg-purple-100 text-purple-700'
                      : 'border-[var(--border)] hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'
                  }`}
                >
                  {isSelected && <span className="mr-1">✓</span>}
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Guidance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium">Custom Guidance</label>
            {guidance && (
              <button
                onClick={() => setGuidance('')}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                title="Clear guidance"
              >
                <span>×</span> Clear
              </button>
            )}
          </div>
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="e.g., Make the introduction more compelling, tighten the argument, improve transitions..."
            className="w-full h-24 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none"
          />
        </div>

        {/* Apply Button + Stop Button */}
        <div className="flex gap-2">
          <button
            onClick={handleApplyVibe}
            disabled={isLoading || cells.length === 0 || !hasVibesOrGuidance}
            className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex flex-col items-center justify-center gap-1"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Vibing...
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  ✨ Let's Vibe
                  <span className="text-purple-200 text-sm">({targetCount} cells)</span>
                </div>
                {hasVibesOrGuidance && (
                  <span className="text-purple-200 text-xs">
                    {selectedVibes.length > 0 && selectedVibes.join(' + ')}
                    {selectedVibes.length > 0 && guidance.trim() && ' + '}
                    {guidance.trim() && 'custom'}
                  </span>
                )}
              </>
            )}
          </button>
          {isLoading && onStop && (
            <button
              onClick={onStop}
              className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
              title="Stop"
            >
              ◼
            </button>
          )}
        </div>

        {/* Alignment Score Display */}
        {lastAlignmentScore !== null && (
          <div className={`p-4 rounded-lg border ${getScoreBg(lastAlignmentScore)}`}>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className={`text-2xl font-bold ${getScoreColor(lastAlignmentScore)}`}>
                  {lastAlignmentScore}%
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)]">Alignment</div>
              </div>
              <div className="flex-1 text-sm text-[var(--muted-foreground)]">
                {lastAlignmentScore >= 80
                  ? 'Great alignment with your style profile!'
                  : lastAlignmentScore >= 60
                  ? 'Good alignment. Review the changes in the editor.'
                  : 'Some adjustments may need manual review.'}
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="p-3 bg-[var(--muted)]/50 rounded-lg text-xs text-[var(--muted-foreground)]">
          <p className="font-medium mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Select cells first to edit just a section</li>
            <li>Quick vibes apply common improvements</li>
            <li>Custom guidance overrides quick vibes</li>
            <li>Review changes in the editor before accepting</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
