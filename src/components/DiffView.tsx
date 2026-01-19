'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';

type FeedbackType = 'too_long' | 'too_short' | 'too_formal' | 'too_casual' | 'too_hedged' | 'too_bold';

interface DiffViewProps {
  original: string;
  edited: string;
  onAccept?: (finalText: string) => void;
  onReject?: () => void;
  onFeedback?: (feedback: FeedbackType) => void;
  showFeedback?: boolean;
}

interface DiffSegment {
  id: number;
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

interface ChangeGroup {
  id: number;
  removed: DiffSegment | null;
  added: DiffSegment | null;
}

/**
 * Compute word-level diff between two strings
 */
function computeDiff(original: string, edited: string): DiffSegment[] {
  const originalWords = original.split(/(\s+)/);
  const editedWords = edited.split(/(\s+)/);

  const m = originalWords.length;
  const n = editedWords.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (originalWords[i - 1] === editedWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const result: DiffSegment[] = [];
  let idCounter = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalWords[i - 1] === editedWords[j - 1]) {
      result.unshift({ id: idCounter++, type: 'unchanged', text: originalWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ id: idCounter++, type: 'added', text: editedWords[j - 1] });
      j--;
    } else {
      result.unshift({ id: idCounter++, type: 'removed', text: originalWords[i - 1] });
      i--;
    }
  }

  const merged: DiffSegment[] = [];
  for (const seg of result) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg, id: merged.length });
    }
  }

  return merged;
}

function groupChanges(segments: DiffSegment[]): (DiffSegment | ChangeGroup)[] {
  const result: (DiffSegment | ChangeGroup)[] = [];
  let groupId = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.type === 'unchanged') {
      result.push(seg);
    } else if (seg.type === 'removed') {
      const next = segments[i + 1];
      if (next && next.type === 'added') {
        result.push({
          id: groupId++,
          removed: seg,
          added: next,
        });
        i++;
      } else {
        result.push({
          id: groupId++,
          removed: seg,
          added: null,
        });
      }
    } else if (seg.type === 'added') {
      result.push({
        id: groupId++,
        removed: null,
        added: seg,
      });
    }
  }

  return result;
}

function isChangeGroup(item: DiffSegment | ChangeGroup): item is ChangeGroup {
  return 'removed' in item && 'added' in item;
}

export type { FeedbackType };

export default function DiffView({
  original,
  edited,
  onAccept,
  onReject,
  onFeedback,
  showFeedback = true,
}: DiffViewProps) {
  const diff = useMemo(() => computeDiff(original, edited), [original, edited]);
  const grouped = useMemo(() => groupChanges(diff), [diff]);

  // Word counts
  const originalWords = original.trim().split(/\s+/).filter(Boolean).length;
  const editedWords = edited.trim().split(/\s+/).filter(Boolean).length;
  const wordDiff = editedWords - originalWords;
  const wordDiffPercent = originalWords > 0 ? Math.round((wordDiff / originalWords) * 100) : 0;

  const changeGroups = useMemo(() => grouped.filter(isChangeGroup) as ChangeGroup[], [grouped]);

  // Track which changes are accepted (true = accept new, false = keep original)
  const [acceptedChanges, setAcceptedChanges] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    changeGroups.forEach((item) => {
      initial[item.id] = true;
    });
    return initial;
  });

  // Manual edit mode
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [manualText, setManualText] = useState(edited);

  const changeCount = changeGroups.length;
  const acceptedCount = Object.values(acceptedChanges).filter(Boolean).length;

  const handleToggle = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAcceptedChanges((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const acceptAll = () => {
    const all: Record<number, boolean> = {};
    changeGroups.forEach((item) => {
      all[item.id] = true;
    });
    setAcceptedChanges(all);
  };

  const rejectAllChanges = () => {
    const all: Record<number, boolean> = {};
    changeGroups.forEach((item) => {
      all[item.id] = false;
    });
    setAcceptedChanges(all);
  };

  const buildFinalText = useCallback(() => {
    let result = '';
    for (const item of grouped) {
      if (!isChangeGroup(item)) {
        result += item.text;
      } else {
        const accepted = acceptedChanges[item.id];
        if (accepted) {
          result += item.added?.text || '';
        } else {
          result += item.removed?.text || '';
        }
      }
    }
    return result;
  }, [grouped, acceptedChanges]);

  const handleApply = () => {
    if (onAccept) {
      if (isManualEdit) {
        onAccept(manualText);
      } else {
        onAccept(buildFinalText());
      }
    }
  };

  if (changeCount === 0) {
    return (
      <div className="p-4 bg-[var(--muted)] rounded-lg">
        <p className="text-[var(--muted-foreground)]">No changes suggested.</p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--muted)] border-b border-[var(--border)]">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {isManualEdit ? 'Manual Edit' : `${acceptedCount} of ${changeCount} changes`}
          </span>
          {/* Word count */}
          <span className={`text-xs px-2 py-0.5 rounded ${
            wordDiff > 0
              ? 'bg-orange-100 text-orange-700'
              : wordDiff < 0
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {originalWords} → {editedWords} words
            {wordDiff !== 0 && ` (${wordDiff > 0 ? '+' : ''}${wordDiffPercent}%)`}
          </span>
          {!isManualEdit && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={rejectAllChanges}
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--background)]"
              >
                None
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--background)]"
              >
                All
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isManualEdit) {
              setManualText(buildFinalText());
            }
            setIsManualEdit(!isManualEdit);
          }}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--background)]"
        >
          {isManualEdit ? 'Back to Diff' : 'Edit Manually'}
        </button>
      </div>

      {isManualEdit ? (
        /* Manual edit textarea */
        <div className="p-4">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="w-full h-48 p-3 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-y text-sm leading-relaxed"
            placeholder="Edit the text directly..."
          />
        </div>
      ) : (
        <>
          {/* Instructions */}
          <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300 border-b border-[var(--border)]">
            Click on any change to toggle it. Green = accept change, Gray = keep original.
          </div>

          {/* Diff content */}
          <div className="p-4 leading-relaxed select-none">
            {grouped.map((item, idx) => {
              if (!isChangeGroup(item)) {
                return <span key={`seg-${idx}`}>{item.text}</span>;
              }

              const isAccepted = acceptedChanges[item.id] ?? true;

              return (
                <button
                  key={`change-${item.id}`}
                  type="button"
                  onClick={(e) => handleToggle(item.id, e)}
                  className={`inline rounded transition-all cursor-pointer ${
                    isAccepted
                      ? 'outline outline-2 outline-green-500 outline-offset-1'
                      : 'outline outline-2 outline-gray-400 outline-offset-1'
                  }`}
                  title={isAccepted ? 'Click to keep original' : 'Click to accept change'}
                >
                  {item.removed && (
                    <span
                      className={
                        isAccepted
                          ? 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 line-through'
                          : 'bg-yellow-100 dark:bg-yellow-900/30'
                      }
                    >
                      {item.removed.text}
                    </span>
                  )}
                  {item.added && (
                    <span
                      className={
                        isAccepted
                          ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200'
                          : 'bg-gray-200 dark:bg-gray-700 line-through opacity-50'
                      }
                    >
                      {item.added.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Preview */}
          <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--muted)]/50">
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Preview result
              </summary>
              <p className="mt-2 p-2 bg-[var(--background)] rounded text-sm leading-relaxed whitespace-pre-wrap">
                {buildFinalText()}
              </p>
            </details>
          </div>
        </>
      )}

      {/* Feedback buttons */}
      {showFeedback && onFeedback && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-yellow-50 dark:bg-yellow-900/20">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Quick feedback:</span>
            <button
              type="button"
              onClick={() => onFeedback('too_long')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too long
            </button>
            <button
              type="button"
              onClick={() => onFeedback('too_short')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too short
            </button>
            <button
              type="button"
              onClick={() => onFeedback('too_formal')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too formal
            </button>
            <button
              type="button"
              onClick={() => onFeedback('too_casual')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too casual
            </button>
            <button
              type="button"
              onClick={() => onFeedback('too_hedged')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too hedged
            </button>
            <button
              type="button"
              onClick={() => onFeedback('too_bold')}
              className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              Too bold
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {(onAccept || onReject) && (
        <div className="flex justify-end gap-2 px-4 py-3 bg-[var(--muted)] border-t border-[var(--border)]">
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="px-4 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--background)]"
            >
              Discard
            </button>
          )}
          {onAccept && (
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              {isManualEdit ? 'Apply Edit' : `Apply ${acceptedCount} Changes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Side-by-side diff view with manual edit option and resizable partition
 * Shows highlighted differences in both panels
 */
export function SideBySideDiff({
  original,
  edited,
  onAccept,
  onReject,
  onFeedback,
  showFeedback = true,
}: DiffViewProps) {
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [manualText, setManualText] = useState(edited);
  const [leftWidth, setLeftWidth] = useState(50); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute diff for highlighting
  const diff = useMemo(() => computeDiff(original, edited), [original, edited]);

  // Word counts
  const originalWords = original.trim().split(/\s+/).filter(Boolean).length;
  const editedWords = edited.trim().split(/\s+/).filter(Boolean).length;
  const wordDiff = editedWords - originalWords;
  const wordDiffPercent = originalWords > 0 ? Math.round((wordDiff / originalWords) * 100) : 0;

  // Build highlighted versions for each side
  const { originalHighlighted, editedHighlighted } = useMemo(() => {
    const origParts: React.ReactNode[] = [];
    const editParts: React.ReactNode[] = [];

    diff.forEach((seg, idx) => {
      if (seg.type === 'unchanged') {
        origParts.push(<span key={`o-${idx}`}>{seg.text}</span>);
        editParts.push(<span key={`e-${idx}`}>{seg.text}</span>);
      } else if (seg.type === 'removed') {
        origParts.push(
          <span
            key={`o-${idx}`}
            className="bg-red-200 dark:bg-red-800/50 text-red-900 dark:text-red-100 rounded px-0.5"
          >
            {seg.text}
          </span>
        );
      } else if (seg.type === 'added') {
        editParts.push(
          <span
            key={`e-${idx}`}
            className="bg-green-200 dark:bg-green-800/50 text-green-900 dark:text-green-100 rounded px-0.5"
          >
            {seg.text}
          </span>
        );
      }
    });

    return { originalHighlighted: origParts, editedHighlighted: editParts };
  }, [diff]);

  // Handle drag events with useEffect
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(20, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="border border-[var(--border)] rounded-lg overflow-hidden"
      style={{ userSelect: isDragging ? 'none' : 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]">
        <div className="flex flex-1 items-center">
          <div
            style={{ width: `${leftWidth}%` }}
            className="px-4 py-2 text-sm font-medium border-r border-[var(--border)]"
          >
            Original ({originalWords} words)
            <span className="ml-2 text-xs text-red-600 dark:text-red-400">■ removed</span>
          </div>
          <div className="flex-1 px-4 py-2 text-sm font-medium flex items-center gap-2">
            {isManualEdit ? 'Your Edit' : 'Suggested'} ({editedWords} words)
            <span className="text-xs text-green-600 dark:text-green-400">■ added</span>
            {wordDiff !== 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                wordDiff > 0
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {wordDiff > 0 ? '+' : ''}{wordDiffPercent}%
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsManualEdit(!isManualEdit)}
          className="text-xs px-3 py-1 mr-2 rounded border border-[var(--border)] hover:bg-[var(--background)]"
        >
          {isManualEdit ? 'Back' : 'Edit'}
        </button>
      </div>

      {/* Content with resizable partition */}
      <div className="flex relative min-h-48">
        {/* Left panel - Original with removed text highlighted */}
        <div
          style={{ width: `${leftWidth}%` }}
          className="p-4 bg-red-50/30 dark:bg-red-900/10 overflow-auto"
        >
          <div className="leading-relaxed whitespace-pre-wrap">{originalHighlighted}</div>
        </div>

        {/* Resizable divider */}
        <div
          onMouseDown={() => setIsDragging(true)}
          className={`w-2 bg-[var(--border)] hover:bg-[var(--primary)] cursor-col-resize flex-shrink-0 transition-colors ${
            isDragging ? 'bg-[var(--primary)]' : ''
          }`}
          title="Drag to resize"
        />

        {/* Right panel - Edited with added text highlighted */}
        <div className="flex-1 p-4 bg-green-50/30 dark:bg-green-900/10 overflow-auto">
          {isManualEdit ? (
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className="w-full h-full min-h-32 p-2 border border-[var(--border)] rounded bg-[var(--background)] resize-y text-sm leading-relaxed"
            />
          ) : (
            <div className="leading-relaxed whitespace-pre-wrap">{editedHighlighted}</div>
          )}
        </div>
      </div>

      {/* Feedback buttons */}
      {showFeedback && onFeedback && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-yellow-50 dark:bg-yellow-900/20">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">Quick feedback:</span>
            <button type="button" onClick={() => onFeedback('too_long')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too long</button>
            <button type="button" onClick={() => onFeedback('too_short')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too short</button>
            <button type="button" onClick={() => onFeedback('too_formal')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too formal</button>
            <button type="button" onClick={() => onFeedback('too_casual')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too casual</button>
            <button type="button" onClick={() => onFeedback('too_hedged')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too hedged</button>
            <button type="button" onClick={() => onFeedback('too_bold')} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-100 hover:bg-yellow-200 text-yellow-800">Too bold</button>
          </div>
        </div>
      )}

      {/* Actions */}
      {(onAccept || onReject) && (
        <div className="flex justify-end gap-2 px-4 py-3 bg-[var(--muted)] border-t border-[var(--border)]">
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="px-4 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--background)]"
            >
              Discard
            </button>
          )}
          {onAccept && (
            <button
              type="button"
              onClick={() => onAccept(isManualEdit ? manualText : edited)}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Apply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
