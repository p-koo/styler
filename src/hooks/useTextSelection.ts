'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  cellIndex: number;
  rect: DOMRect;
}

interface UseTextSelectionOptions {
  containerSelector?: string; // CSS selector for the container to watch
  cellDataAttribute?: string; // Data attribute to identify cells (e.g., 'data-cell-index')
}

export function useTextSelection(options: UseTextSelectionOptions = {}) {
  const {
    containerSelector = '[data-cell-container]',
    cellDataAttribute = 'data-cell-index',
  } = options;

  const [selection, setSelection] = useState<TextSelection | null>(null);
  const isSelectingRef = useRef(false);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const checkSelection = () => {
      const sel = window.getSelection();

      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        // No selection or collapsed (just a cursor)
        return null;
      }

      const selectedText = sel.toString();

      // Check if selection is within a cell
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;

      if (!anchorNode || !focusNode) {
        return null;
      }

      // Find the cell element containing the selection
      const findCellElement = (node: Node): HTMLElement | null => {
        let current: Node | null = node;
        while (current) {
          if (current instanceof HTMLElement && current.hasAttribute(cellDataAttribute)) {
            return current;
          }
          current = current.parentNode;
        }
        return null;
      };

      const anchorCell = findCellElement(anchorNode);
      const focusCell = findCellElement(focusNode);

      // Selection must be within a single cell
      if (!anchorCell || !focusCell || anchorCell !== focusCell) {
        return null;
      }

      // Check if the cell is within our container
      const container = document.querySelector(containerSelector);
      if (!container || !container.contains(anchorCell)) {
        return null;
      }

      const cellIndex = parseInt(anchorCell.getAttribute(cellDataAttribute) || '-1', 10);
      if (cellIndex < 0) {
        return null;
      }

      // Get the full text content of the cell to calculate offsets
      const cellText = anchorCell.textContent || '';

      // Calculate the start and end offsets within the cell's text
      const range = sel.getRangeAt(0);

      // Create a range from the start of the cell to the start of selection
      const preRange = document.createRange();
      preRange.setStart(anchorCell, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;

      const endOffset = startOffset + selectedText.length;

      // Verify the offsets match the cell content
      const extractedText = cellText.slice(startOffset, endOffset);
      if (extractedText !== selectedText) {
        // Offsets don't match, might be due to HTML entities or formatting
        // Try to find the text in the cell content
        const foundIndex = cellText.indexOf(selectedText);
        if (foundIndex >= 0) {
          return {
            text: selectedText,
            startOffset: foundIndex,
            endOffset: foundIndex + selectedText.length,
            cellIndex,
            rect: range.getBoundingClientRect(),
          };
        }
        // Can't reliably determine position
        return null;
      }

      return {
        text: selectedText,
        startOffset,
        endOffset,
        cellIndex,
        rect: range.getBoundingClientRect(),
      };
    };

    const handleMouseDown = () => {
      // User started selecting - don't show popup yet
      isSelectingRef.current = true;
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Small delay to let the selection finalize
      setTimeout(() => {
        isSelectingRef.current = false;

        // Check if click was inside the popover (don't clear if so)
        const popover = document.querySelector('[data-selection-popover]');
        if (popover && popover.contains(e.target as Node)) {
          return;
        }

        const newSelection = checkSelection();
        setSelection(newSelection);
      }, 10);
    };

    // Clear selection when clicking outside (but not during selection)
    const handleClick = (e: MouseEvent) => {
      if (isSelectingRef.current) return;

      const popover = document.querySelector('[data-selection-popover]');
      if (popover && popover.contains(e.target as Node)) {
        return;
      }

      // If clicking and no text is selected, clear the popup
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
    };
  }, [containerSelector, cellDataAttribute]);

  return { selection, clearSelection };
}
