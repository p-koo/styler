/**
 * Document Version History
 *
 * Stores snapshots of document edits for undo/revert functionality.
 * Uses localStorage for persistence.
 */

export interface DocumentSnapshot {
  id: string;
  timestamp: string;
  documentId: string;
  documentTitle: string;
  paragraphs: Array<{
    id: string;
    index: number;
    content: string;
  }>;
  changeDescription: string; // What changed in this version
}

export interface DocumentHistory {
  documentId: string;
  snapshots: DocumentSnapshot[];
  maxSnapshots: number;
}

const HISTORY_KEY_PREFIX = 'preference-doc-history-';
const MAX_SNAPSHOTS = 15; // Reduced to prevent localStorage quota issues

/**
 * Get history for a document
 */
export function getDocumentHistory(documentId: string): DocumentHistory {
  if (typeof window === 'undefined') {
    return { documentId, snapshots: [], maxSnapshots: MAX_SNAPSHOTS };
  }

  const key = HISTORY_KEY_PREFIX + documentId;
  const stored = localStorage.getItem(key);

  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse document history:', e);
    }
  }

  return { documentId, snapshots: [], maxSnapshots: MAX_SNAPSHOTS };
}

/**
 * Save a new snapshot to history
 */
export function saveSnapshot(
  documentId: string,
  documentTitle: string,
  paragraphs: Array<{ id: string; index: number; content: string }>,
  changeDescription: string
): DocumentSnapshot {
  const history = getDocumentHistory(documentId);

  const snapshot: DocumentSnapshot = {
    id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    documentId,
    documentTitle,
    paragraphs: paragraphs.map((p) => ({
      id: p.id,
      index: p.index,
      content: p.content,
    })),
    changeDescription,
  };

  // Add to beginning (most recent first)
  history.snapshots.unshift(snapshot);

  // Trim to max snapshots
  if (history.snapshots.length > MAX_SNAPSHOTS) {
    history.snapshots = history.snapshots.slice(0, MAX_SNAPSHOTS);
  }

  // Save to localStorage with quota handling
  if (typeof window !== 'undefined') {
    const key = HISTORY_KEY_PREFIX + documentId;
    try {
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
      // Quota exceeded - try to free up space
      console.warn('localStorage quota exceeded, clearing old histories');
      clearAllHistories();
      // Try again with just this snapshot
      history.snapshots = [snapshot];
      try {
        localStorage.setItem(key, JSON.stringify(history));
      } catch (e2) {
        // Still failing - just skip saving
        console.error('Failed to save history even after clearing:', e2);
      }
    }
  }

  return snapshot;
}

/**
 * Clear all document histories to free up space
 */
export function clearAllHistories(): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(HISTORY_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Get a specific snapshot by ID
 */
export function getSnapshot(documentId: string, snapshotId: string): DocumentSnapshot | null {
  const history = getDocumentHistory(documentId);
  return history.snapshots.find((s) => s.id === snapshotId) || null;
}

/**
 * Clear history for a document
 */
export function clearHistory(documentId: string): void {
  if (typeof window !== 'undefined') {
    const key = HISTORY_KEY_PREFIX + documentId;
    localStorage.removeItem(key);
  }
}

/**
 * Get all document histories (for listing)
 */
export function getAllDocumentHistories(): DocumentHistory[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const histories: DocumentHistory[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(HISTORY_KEY_PREFIX)) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          histories.push(JSON.parse(stored));
        } catch (e) {
          // Skip invalid entries
        }
      }
    }
  }

  return histories;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}
