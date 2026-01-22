'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface SelectionEditResult {
  originalText: string;
  editedText: string;
  instruction: string;
}

interface SelectionEditPopoverProps {
  selectedText: string;
  selectionRect: DOMRect | null;
  onSubmit: (instruction: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRefine: (feedback: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  editResult?: SelectionEditResult | null;
}

export default function SelectionEditPopover({
  selectedText,
  selectionRect,
  onSubmit,
  onAccept,
  onReject,
  onRefine,
  onCancel,
  isLoading = false,
  editResult = null,
}: SelectionEditPopoverProps) {
  const [instruction, setInstruction] = useState('');
  const [refineFeedback, setRefineFeedback] = useState('');
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset state when selection changes
  useEffect(() => {
    setInstruction('');
    setRefineFeedback('');
    setShowRefineInput(false);
    setDragOffset({ x: 0, y: 0 });
  }, [selectedText]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
  }, [dragOffset]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragOffset({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
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

  if (!selectionRect) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim() && !isLoading) {
      onSubmit(instruction.trim());
    }
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (refineFeedback.trim() && !isLoading) {
      onRefine(refineFeedback.trim());
      setRefineFeedback('');
      setShowRefineInput(false);
    }
  };

  // Calculate base position
  const popoverWidth = editResult ? 250 : 320;
  let left = selectionRect.left + selectionRect.width / 2 - popoverWidth / 2;
  let top = selectionRect.bottom + 8;

  // Keep within bounds
  if (left < 10) left = 10;
  if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }
  if (top + 100 > window.innerHeight - 10) {
    top = selectionRect.top - 100;
  }
  if (top < 10) top = 10;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: left + dragOffset.x,
    top: top + dragOffset.y,
    zIndex: 1000,
    width: popoverWidth,
  };

  // Drag handle bar
  const DragHandle = () => (
    <div
      onMouseDown={handleDragStart}
      className={`h-5 bg-[var(--muted)] rounded-t-lg cursor-move flex items-center justify-center border-b border-[var(--border)] ${isDragging ? 'bg-[var(--muted)]/80' : ''}`}
    >
      <div className="w-8 h-1 bg-[var(--muted-foreground)]/30 rounded-full" />
    </div>
  );

  // Show action buttons when we have an edit result
  if (editResult) {
    return (
      <div
        ref={popoverRef}
        data-selection-popover
        style={style}
        className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden"
      >
        <DragHandle />
        <div className="p-2">
          {showRefineInput ? (
            <form onSubmit={handleRefineSubmit} className="flex gap-2">
              <input
                type="text"
                value={refineFeedback}
                onChange={(e) => setRefineFeedback(e.target.value)}
                placeholder="How to improve?"
                disabled={isLoading}
                autoFocus
                className="flex-1 px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              <button
                type="submit"
                disabled={!refineFeedback.trim() || isLoading}
                className="px-2 py-1 text-xs bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? '...' : 'Go'}
              </button>
              <button
                type="button"
                onClick={() => setShowRefineInput(false)}
                className="px-2 py-1 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)]"
              >
                ×
              </button>
            </form>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={onAccept}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => setShowRefineInput(true)}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90 disabled:opacity-50"
              >
                Refine
              </button>
              <button
                onClick={onReject}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Reject
              </button>
              {isLoading && (
                <span className="inline-block w-4 h-4 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin ml-1" />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Initial instruction input
  return (
    <div
      ref={popoverRef}
      data-selection-popover
      style={style}
      className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden"
    >
      <DragHandle />
      <div className="p-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Edit instruction..."
            disabled={isLoading}
            className="flex-1 px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={!instruction.trim() || isLoading}
            className="px-3 py-1.5 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Edit'
            )}
          </button>
        </form>
        <div className="mt-1.5 text-xs text-[var(--muted-foreground)] truncate">
          &ldquo;{selectedText.length > 40 ? selectedText.slice(0, 40) + '...' : selectedText}&rdquo;
        </div>
      </div>
    </div>
  );
}
