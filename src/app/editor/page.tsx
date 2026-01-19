'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import DiffView, { SideBySideDiff, type FeedbackType } from '@/components/DiffView';
import CritiqueBadge from '@/components/CritiqueBadge';
import DocumentProfilePanel from '@/components/DocumentProfilePanel';
import AgentVisualization from '@/components/AgentVisualization';
import type { AudienceProfile, CritiqueAnalysis } from '@/types';
import {
  getDocumentHistory,
  saveSnapshot,
  formatTimestamp,
  type DocumentSnapshot,
  type DocumentHistory,
} from '@/memory/document-history';

interface DocumentSection {
  id: string;
  name: string;
  type: string;
  startParagraph: number;
  endParagraph: number;
  purpose: string;
}

interface DocumentStructure {
  title: string;
  documentType: string;
  sections: DocumentSection[];
  keyTerms: string[];
  mainArgument: string;
}

interface Paragraph {
  id: string;
  index: number;
  content: string;
  type?: 'paragraph' | 'heading'; // Default is 'paragraph'
  edited?: string;
  editAccepted?: boolean;
  originalBatchContent?: string; // For batch edits: combined original paragraphs
  critique?: CritiqueAnalysis; // Critique analysis for the suggested edit
  iterations?: number; // Number of orchestrator attempts
  convergenceHistory?: Array<{
    attempt: number;
    alignmentScore: number;
    adjustmentsMade: string[];
  }>;
  documentProfileApplied?: boolean; // Whether document-specific profile was used
}

interface Document {
  id: string;
  title: string;
  paragraphs: Paragraph[];
  structure?: DocumentStructure;
}

const MODEL_STORAGE_KEY = 'preference-editor-model';

interface SavedDocumentInfo {
  id: string;
  title: string;
  paragraphCount: number;
  updatedAt: string;
}

export default function EditorPage() {
  const [document, setDocument] = useState<Document | null>(null);
  const [selectedParagraphs, setSelectedParagraphs] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [profiles, setProfiles] = useState<AudienceProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [diffMode, setDiffMode] = useState<'inline' | 'side-by-side'>('inline');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DocumentHistory | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [savedDocuments, setSavedDocuments] = useState<SavedDocumentInfo[]>([]);
  const [showDocumentList, setShowDocumentList] = useState(true);
  const [editingParagraphIndex, setEditingParagraphIndex] = useState<number | null>(null);
  const [editingParagraphContent, setEditingParagraphContent] = useState('');
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null); // null = at end, number = after that index
  const [isExporting, setIsExporting] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null); // null = current state, 0 = most recent snapshot, etc.
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [futureStates, setFutureStates] = useState<Array<{ paragraphs: Paragraph[]; description: string }>>([]); // For redo
  const [showDocProfile, setShowDocProfile] = useState(true); // Document profile panel - visible by default
  const [showAgentViz, setShowAgentViz] = useState(false); // Agent visualization toggle
  const [darkMode, setDarkMode] = useState<'system' | 'light' | 'dark'>('system'); // Theme preference
  const [searchQuery, setSearchQuery] = useState(''); // Document search
  const [searchResults, setSearchResults] = useState<number[]>([]); // Paragraph indices with matches
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0); // Current match navigation
  const [compareVersions, setCompareVersions] = useState<[string | null, string | null]>([null, null]); // Version IDs to compare

  // Load history when document changes
  useEffect(() => {
    if (document?.id) {
      const docHistory = getDocumentHistory(document.id);
      setHistory(docHistory);
      setHistoryIndex(null); // Reset to current state
      setFutureStates([]); // Clear redo stack
    } else {
      setHistory(null);
      setHistoryIndex(null);
      setFutureStates([]);
    }
  }, [document?.id]);

  // Load saved documents list from API on mount
  const loadDocumentsList = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setSavedDocuments(data.documents || []);
      }
    } catch (e) {
      console.error('Failed to load documents list:', e);
    }
  }, []);

  useEffect(() => {
    loadDocumentsList();
  }, [loadDocumentsList]);

  // Load profiles on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        setProfiles(data.audienceProfiles || []);
        setActiveProfile(data.activeProfileId);
      })
      .catch(console.error);
  }, []);

  // Load available models and saved selection
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setAvailableModels(data.availableModels || []);
        // Load saved model or use current default
        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
        setSelectedModel(savedModel || data.currentModel || '');
      })
      .catch(console.error);
  }, []);

  // Save model selection to localStorage
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    localStorage.setItem(MODEL_STORAGE_KEY, model);
  };

  // Load and apply dark mode preference
  useEffect(() => {
    const saved = localStorage.getItem('theme-preference') as 'system' | 'light' | 'dark' | null;
    if (saved) {
      setDarkMode(saved);
    }
  }, []);

  // Apply dark mode class to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark', 'light');
    if (darkMode === 'dark') {
      root.classList.add('dark');
    } else if (darkMode === 'light') {
      root.classList.add('light');
    }
    localStorage.setItem('theme-preference', darkMode);
  }, [darkMode]);

  // Cycle through theme modes
  const cycleTheme = () => {
    setDarkMode((prev) => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  // Search within document
  useEffect(() => {
    if (!searchQuery.trim() || !document) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }
    const query = searchQuery.toLowerCase();
    const matches = document.paragraphs
      .map((p, idx) => (p.content.toLowerCase().includes(query) ? idx : -1))
      .filter((idx) => idx !== -1);
    setSearchResults(matches);
    setCurrentSearchIndex(0);
  }, [searchQuery, document]);

  // Navigate to next/prev search result
  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    let newIndex = currentSearchIndex;
    if (direction === 'next') {
      newIndex = (currentSearchIndex + 1) % searchResults.length;
    } else {
      newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    }
    setCurrentSearchIndex(newIndex);
    // Scroll to the paragraph
    const paraEl = window.document.getElementById(`para-${searchResults[newIndex]}`);
    paraEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Toggle version selection for comparison
  const toggleVersionCompare = (snapshotId: string) => {
    setCompareVersions(([v1, v2]) => {
      if (v1 === snapshotId) return [null, v2];
      if (v2 === snapshotId) return [v1, null];
      if (!v1) return [snapshotId, v2];
      if (!v2) return [v1, snapshotId];
      return [snapshotId, null]; // Replace first if both selected
    });
  };

  // Update document title
  const handleTitleSave = useCallback(() => {
    if (!document || !editingTitleValue.trim()) return;
    setDocument((prev) => prev ? { ...prev, title: editingTitleValue.trim() } : null);
    setIsEditingTitle(false);
  }, [document, editingTitleValue]);

  // Auto-save document (debounced)
  useEffect(() => {
    if (!document) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save (1 second debounce)
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: document.id,
            title: document.title,
            paragraphs: document.paragraphs,
            structure: document.structure,
            selectedProfileId: activeProfile,
          }),
        });
        // Silently refresh documents list
        loadDocumentsList();
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [document, loadDocumentsList, activeProfile]);

  // Export document as .txt file
  const handleExportDocument = useCallback(() => {
    if (!document || isExporting) return;

    setIsExporting(true);
    try {
      // Build text content
      const textContent = document.paragraphs
        .map((p) => p.content)
        .join('\n\n');

      // Create filename with timestamp to avoid overwriting
      const sanitizedTitle = document.title
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${sanitizedTitle}_${timestamp}.txt`;

      // Create and trigger download
      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export document:', e);
      alert('Failed to export document');
    } finally {
      setIsExporting(false);
    }
  }, [document, isExporting]);

  // Load a saved document
  const handleLoadDocument = useCallback(async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      const loadedDoc = data.document;
      setDocument(loadedDoc as Document);
      setSelectedParagraphs(new Set());
      setLastSelectedIndex(null);

      // Restore the profile that was selected for this document
      if (loadedDoc.selectedProfileId !== undefined) {
        setActiveProfile(loadedDoc.selectedProfileId);
      }
    } catch (e) {
      console.error('Failed to load document:', e);
      alert('Failed to load document');
    }
  }, []);

  // Delete a saved document
  const handleDeleteSavedDocument = useCallback(async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this saved document?')) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      // If we deleted the current document, clear it
      if (document?.id === docId) {
        setDocument(null);
      }

      // Refresh the documents list
      await loadDocumentsList();
    } catch (e) {
      console.error('Failed to delete document:', e);
      alert('Failed to delete document');
    }
  }, [document?.id, loadDocumentsList]);

  // Analyze document structure
  const analyzeDocument = useCallback(async (paragraphs: string[]) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/document/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.structure as DocumentStructure;
      }
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
    return undefined;
  }, []);

  // Handle text paste/upload
  const handleTextUpload = useCallback(async (text: string, title?: string) => {
    // Parse into paragraphs
    const paragraphTexts = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const paragraphs: Paragraph[] = paragraphTexts.map((content, index) => ({
      id: `para-${index}`,
      index,
      content,
    }));

    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: title || 'Untitled Document',
      paragraphs,
    };

    setDocument(newDoc);
    clearSelection();

    // Analyze structure in background
    const structure = await analyzeDocument(paragraphTexts);
    if (structure) {
      setDocument((prev) => prev ? { ...prev, structure, title: structure.title || prev.title } : null);
    }
  }, [analyzeDocument]);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsLoading(true);

      try {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // Upload PDF to API for parsing
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/document/parse', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Failed to parse PDF');
          }

          await handleTextUpload(data.text, file.name);
        } else {
          // Plain text file
          const text = await file.text();
          await handleTextUpload(text, file.name);
        }
      } catch (err) {
        console.error('Upload error:', err);
        alert(err instanceof Error ? err.message : 'Failed to upload file');
      } finally {
        setIsLoading(false);
      }
    },
    [handleTextUpload]
  );

  // Handle paragraph click with multi-select support
  const handleParagraphClick = useCallback((index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Shift+click: select range
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedParagraphs(newSelection);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedParagraphs((prev) => {
        const newSelection = new Set(prev);
        if (newSelection.has(index)) {
          newSelection.delete(index);
        } else {
          newSelection.add(index);
        }
        return newSelection;
      });
      setLastSelectedIndex(index);
    } else {
      // Normal click: select single
      setSelectedParagraphs(new Set([index]));
      setLastSelectedIndex(index);
    }
  }, [lastSelectedIndex]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Request edit for selected paragraphs
  const handleRequestEdit = useCallback(async () => {
    if (!document || selectedParagraphs.size === 0) return;

    const selectedIndices = Array.from(selectedParagraphs).sort((a, b) => a - b);
    const isMultiple = selectedIndices.length > 1;

    setIsLoading(true);

    try {
      if (isMultiple) {
        // Multiple paragraphs: use batch edit endpoint
        const res = await fetch('/api/document/edit-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paragraphs: document.paragraphs.map((p) => p.content),
            selectedIndices,
            instruction: editInstruction || 'Improve flow and coherence across these paragraphs',
            profileId: activeProfile,
            documentStructure: document.structure,
            model: selectedModel || undefined,
          }),
        });

        if (!res.ok) throw new Error('Failed to get edit');

        const data = await res.json();

        // Store the batch edit result with combined original content
        setDocument((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          updated.paragraphs = [...prev.paragraphs];

          // Combine original paragraphs for comparison
          const originalCombined = selectedIndices
            .map((i) => prev.paragraphs[i]?.content || '')
            .join('\n\n');

          // Mark the first selected paragraph with the combined edit
          const firstIndex = selectedIndices[0];
          updated.paragraphs[firstIndex] = {
            ...updated.paragraphs[firstIndex],
            edited: data.editedText, // Combined/restructured text
            originalBatchContent: originalCombined, // Store original for diff
          };
          return updated;
        });
      } else {
        // Single paragraph: use existing endpoint
        const paragraphIndex = selectedIndices[0];
        const res = await fetch('/api/document/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paragraphs: document.paragraphs.map((p) => p.content),
            paragraphIndex,
            instruction: editInstruction || 'Improve this paragraph',
            profileId: activeProfile,
            documentStructure: document.structure,
            model: selectedModel || undefined,
            documentId: document.id,
            includeCritique: true,
          }),
        });

        if (!res.ok) throw new Error('Failed to get edit');

        const data = await res.json();

        // Update paragraph with suggested edit, critique, and orchestration info
        setDocument((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          updated.paragraphs = [...prev.paragraphs];
          updated.paragraphs[paragraphIndex] = {
            ...updated.paragraphs[paragraphIndex],
            edited: data.editedText,
            critique: data.critique,
            iterations: data.iterations,
            convergenceHistory: data.convergenceHistory,
            documentProfileApplied: data.documentPreferences?.applied,
          };
          return updated;
        });
      }
    } catch (err) {
      console.error('Edit error:', err);
      alert('Failed to get edit suggestion');
    } finally {
      setIsLoading(false);
    }
  }, [document, selectedParagraphs, editInstruction, activeProfile, selectedModel]);

  // Accept edit with final text (may be partially accepted or batch edit)
  const handleAcceptEdit = useCallback((index: number, finalText: string) => {
    console.log('handleAcceptEdit called:', { index, finalTextLength: finalText?.length });
    const selectedIndices = Array.from(selectedParagraphs).sort((a, b) => a - b);
    const isBatchEdit = selectedIndices.length > 1 && selectedIndices[0] === index;

    // Get original and suggested text before updating document
    const originalText = document?.paragraphs[index]?.originalBatchContent || document?.paragraphs[index]?.content || '';
    const suggestedEdit = document?.paragraphs[index]?.edited || '';
    const critique = document?.paragraphs[index]?.critique;
    const docId = document?.id;

    // Determine if this is a partial acceptance
    const isPartial = suggestedEdit !== finalText && finalText !== originalText;
    const decision = isPartial ? 'partial' : 'accepted';

    setDocument((prev) => {
      if (!prev) return null;

      // Save snapshot before making the change
      const snapshot = saveSnapshot(
        prev.id,
        prev.title,
        prev.paragraphs.map((p) => ({ id: p.id, index: p.index, content: p.content })),
        isBatchEdit
          ? `Edited paragraphs ${selectedIndices.map(i => i + 1).join(', ')}`
          : `Edited paragraph ${index + 1}`
      );

      // Update history state
      setHistory((h) => {
        if (!h) return { documentId: prev.id, snapshots: [snapshot], maxSnapshots: 50 };
        return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
      });

      if (isBatchEdit) {
        // Batch edit: replace selected paragraphs with new content
        // Split the final text into paragraphs
        const newParagraphTexts = finalText
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        // Build new paragraphs array
        const newParagraphs: Paragraph[] = [];
        let newIndex = 0;

        for (let i = 0; i < prev.paragraphs.length; i++) {
          if (i === selectedIndices[0]) {
            // Insert new paragraphs at the first selected index
            for (const text of newParagraphTexts) {
              newParagraphs.push({
                id: `para-${Date.now()}-${newIndex}`,
                index: newIndex,
                content: text,
                editAccepted: true,
              });
              newIndex++;
            }
          } else if (!selectedIndices.includes(i)) {
            // Keep non-selected paragraphs
            newParagraphs.push({
              ...prev.paragraphs[i],
              index: newIndex,
            });
            newIndex++;
          }
          // Skip other selected paragraphs (they're being replaced)
        }

        return { ...prev, paragraphs: newParagraphs };
      } else {
        // Single paragraph edit
        const updated = { ...prev };
        updated.paragraphs = [...prev.paragraphs];
        updated.paragraphs[index] = {
          ...updated.paragraphs[index],
          content: finalText,
          edited: undefined,
          critique: undefined,
          iterations: undefined,
          convergenceHistory: undefined,
          editAccepted: true,
        };
        return updated;
      }
    });

    // Record the edit decision for learning (async, don't wait)
    if (docId && suggestedEdit) {
      console.log('Recording edit decision:', { docId, decision, hasOriginal: !!originalText, hasSuggested: !!suggestedEdit });
      fetch('/api/document/edit-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          paragraphIndex: index,
          originalText,
          suggestedEdit,
          finalText,
          decision,
          instruction: editInstruction || undefined,
          critiqueAnalysis: critique,
          profileId: activeProfile,
          model: selectedModel || undefined,
        }),
      })
        .then(res => res.json())
        .then(data => console.log('Edit decision recorded:', data))
        .catch((err) => console.error('Failed to record edit decision:', err));
    } else {
      console.log('Skipping edit decision - missing data:', { docId, hasSuggested: !!suggestedEdit });
    }

    // Clear selection after accepting
    if (isBatchEdit) {
      clearSelection();
    }
  }, [document, selectedParagraphs, clearSelection, editInstruction, activeProfile, selectedModel]);

  // Reject edit
  const handleRejectEdit = useCallback((index: number) => {
    console.log('handleRejectEdit called:', { index });
    // Get original and suggested text before updating document
    const originalText = document?.paragraphs[index]?.originalBatchContent || document?.paragraphs[index]?.content || '';
    const suggestedEdit = document?.paragraphs[index]?.edited || '';
    const critique = document?.paragraphs[index]?.critique;
    const docId = document?.id;

    setDocument((prev) => {
      if (!prev) return null;
      const updated = { ...prev };
      updated.paragraphs = [...prev.paragraphs];
      updated.paragraphs[index] = {
        ...updated.paragraphs[index],
        edited: undefined,
        critique: undefined,
        iterations: undefined,
        convergenceHistory: undefined,
        originalBatchContent: undefined, // Clear batch content too
      };
      return updated;
    });

    // Record the rejection for learning (async, don't wait)
    if (docId && suggestedEdit) {
      console.log('Recording rejection:', { docId, hasOriginal: !!originalText, hasSuggested: !!suggestedEdit });
      fetch('/api/document/edit-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          paragraphIndex: index,
          originalText,
          suggestedEdit,
          finalText: originalText, // User kept original
          decision: 'rejected',
          instruction: editInstruction || undefined,
          critiqueAnalysis: critique,
          profileId: activeProfile,
          model: selectedModel || undefined,
        }),
      })
        .then(res => res.json())
        .then(data => console.log('Rejection recorded:', data))
        .catch((err) => console.error('Failed to record rejection:', err));
    } else {
      console.log('Skipping rejection - missing data:', { docId, hasSuggested: !!suggestedEdit });
    }

    clearSelection();
  }, [document, clearSelection, editInstruction, activeProfile, selectedModel]);

  // Handle quick feedback on edit quality
  const handleFeedback = useCallback(async (feedback: FeedbackType) => {
    if (!document?.id) return;

    try {
      const res = await fetch(`/api/documents/${document.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (res.ok) {
        // Show brief feedback message
        alert(data.message);
      } else {
        console.error('Feedback error:', data.error);
      }
    } catch (err) {
      console.error('Failed to send feedback:', err);
    }
  }, [document?.id]);

  // Save direct paragraph edit
  const handleSaveDirectEdit = useCallback(() => {
    if (editingParagraphIndex === null || !document) return;

    const originalContent = document.paragraphs[editingParagraphIndex]?.content;
    if (editingParagraphContent === originalContent) {
      // No changes, just exit edit mode
      setEditingParagraphIndex(null);
      setEditingParagraphContent('');
      return;
    }

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.paragraphs.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Directly edited paragraph ${editingParagraphIndex + 1}`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });

    // Update the paragraph
    setDocument((prev) => {
      if (!prev) return null;
      const updated = { ...prev };
      updated.paragraphs = [...prev.paragraphs];
      updated.paragraphs[editingParagraphIndex] = {
        ...updated.paragraphs[editingParagraphIndex],
        content: editingParagraphContent,
      };
      return updated;
    });

    setEditingParagraphIndex(null);
    setEditingParagraphContent('');
  }, [document, editingParagraphIndex, editingParagraphContent]);

  // Cancel direct paragraph edit
  const handleCancelDirectEdit = useCallback(() => {
    setEditingParagraphIndex(null);
    setEditingParagraphContent('');
  }, []);

  // Revert to a snapshot
  const handleRevert = useCallback((snapshot: DocumentSnapshot) => {
    setDocument((prev) => {
      if (!prev) return null;

      // Create a snapshot of current state before reverting
      const currentSnapshot = saveSnapshot(
        prev.id,
        prev.title,
        prev.paragraphs.map((p) => ({ id: p.id, index: p.index, content: p.content })),
        'Before revert'
      );

      // Update history with the new snapshot
      setHistory((h) => {
        if (!h) return { documentId: prev.id, snapshots: [currentSnapshot], maxSnapshots: 50 };
        return { ...h, snapshots: [currentSnapshot, ...h.snapshots].slice(0, 50) };
      });

      // Restore paragraphs from snapshot
      const restoredParagraphs: Paragraph[] = snapshot.paragraphs.map((p) => ({
        id: p.id,
        index: p.index,
        content: p.content,
      }));

      return {
        ...prev,
        paragraphs: restoredParagraphs,
      };
    });

    setShowHistory(false);
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Clear document (close without saving)
  const handleClearDocument = useCallback(() => {
    setDocument(null);
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Create new blank document
  const handleNewDocument = useCallback(() => {
    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: 'Untitled Document',
      paragraphs: [],
    };
    setDocument(newDoc);
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
    setShowAIGenerate(true); // Show AI panel to help start
  }, []);

  // Insert a new paragraph or heading at a specific position
  const handleInsertContent = useCallback((afterIndex: number | null, type: 'paragraph' | 'heading' = 'paragraph', content: string = '') => {
    const defaultContent = type === 'heading' ? 'New Section' : 'New paragraph...';

    setDocument((prev) => {
      if (!prev) return null;

      const newItem: Paragraph = {
        id: `${type}-${Date.now()}`,
        index: 0, // Will be recalculated
        content: content || defaultContent,
        type,
      };

      const newParagraphs = [...prev.paragraphs];

      if (afterIndex === null || afterIndex < 0) {
        // Insert at beginning
        newParagraphs.unshift(newItem);
      } else if (afterIndex >= prev.paragraphs.length - 1) {
        // Insert at end
        newParagraphs.push(newItem);
      } else {
        // Insert after the specified index
        newParagraphs.splice(afterIndex + 1, 0, newItem);
      }

      // Recalculate indices
      newParagraphs.forEach((p, i) => {
        p.index = i;
      });

      return { ...prev, paragraphs: newParagraphs };
    });

    // Start editing the new content
    const newIndex = afterIndex === null ? 0 : afterIndex + 1;
    setEditingParagraphIndex(newIndex);
    setEditingParagraphContent(content || defaultContent);
  }, []);

  // Convenience wrappers
  const handleInsertParagraph = useCallback((afterIndex: number | null, content: string = '') => {
    handleInsertContent(afterIndex, 'paragraph', content);
  }, [handleInsertContent]);

  const handleInsertHeading = useCallback((afterIndex: number | null, content: string = '') => {
    handleInsertContent(afterIndex, 'heading', content);
  }, [handleInsertContent]);

  // Delete a single block
  const handleDeleteBlock = useCallback((index: number) => {
    setDocument((prev) => {
      if (!prev) return null;
      const newParagraphs = prev.paragraphs.filter((_, i) => i !== index);
      newParagraphs.forEach((p, i) => { p.index = i; });
      return { ...prev, paragraphs: newParagraphs };
    });
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Delete selected blocks
  const handleDeleteSelected = useCallback(() => {
    if (selectedParagraphs.size === 0) return;
    setDocument((prev) => {
      if (!prev) return null;
      const newParagraphs = prev.paragraphs.filter((_, i) => !selectedParagraphs.has(i));
      newParagraphs.forEach((p, i) => { p.index = i; });
      return { ...prev, paragraphs: newParagraphs };
    });
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);
  }, [selectedParagraphs]);

  // Copy selected blocks to clipboard
  const handleCopySelected = useCallback(() => {
    if (!document || selectedParagraphs.size === 0) return;
    const selectedIndices = Array.from(selectedParagraphs).sort((a, b) => a - b);
    const text = selectedIndices
      .map((i) => document.paragraphs[i]?.content || '')
      .join('\n\n');
    navigator.clipboard.writeText(text);
  }, [document, selectedParagraphs]);

  // Find first different paragraph between two arrays
  const findFirstDifference = useCallback((oldParas: Paragraph[], newParas: Paragraph[]): number => {
    const maxLen = Math.max(oldParas.length, newParas.length);
    for (let i = 0; i < maxLen; i++) {
      if (!oldParas[i] || !newParas[i] || oldParas[i].content !== newParas[i].content) {
        return i;
      }
    }
    return -1;
  }, []);

  // Scroll to a paragraph by index
  const scrollToParagraph = useCallback((index: number) => {
    setTimeout(() => {
      const element = window.document.querySelector(`[data-para-index="${index}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Briefly highlight
        element.classList.add('ring-2', 'ring-yellow-400');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-yellow-400');
        }, 1500);
      }
    }, 50);
  }, []);

  // Undo - go back in history
  const handleUndo = useCallback(() => {
    if (!document || !history || history.snapshots.length === 0) return;

    const currentParagraphs = [...document.paragraphs];

    // Save current state to future states for redo
    setFutureStates((prev) => [
      { paragraphs: currentParagraphs, description: 'Current state' },
      ...prev,
    ]);

    // Get the snapshot to restore
    const snapshotIndex = historyIndex === null ? 0 : historyIndex + 1;
    if (snapshotIndex >= history.snapshots.length) return; // No more history

    const snapshot = history.snapshots[snapshotIndex];

    // Restore paragraphs from snapshot
    const restoredParagraphs: Paragraph[] = snapshot.paragraphs.map((p) => ({
      id: p.id,
      index: p.index,
      content: p.content,
    }));

    // Find first difference and scroll to it
    const diffIndex = findFirstDifference(currentParagraphs, restoredParagraphs);

    setDocument((prev) => prev ? { ...prev, paragraphs: restoredParagraphs } : null);
    setHistoryIndex(snapshotIndex);
    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);

    if (diffIndex >= 0 && diffIndex < restoredParagraphs.length) {
      scrollToParagraph(diffIndex);
    }
  }, [document, history, historyIndex, findFirstDifference, scrollToParagraph]);

  // Redo - go forward in history
  const handleRedo = useCallback(() => {
    if (!document || futureStates.length === 0) return;

    const currentParagraphs = [...document.paragraphs];

    // Get the next future state
    const [nextState, ...remainingFutures] = futureStates;

    // Find first difference and scroll to it
    const diffIndex = findFirstDifference(currentParagraphs, nextState.paragraphs);

    // Restore paragraphs
    setDocument((prev) => prev ? { ...prev, paragraphs: nextState.paragraphs } : null);
    setFutureStates(remainingFutures);

    // Update history index
    if (remainingFutures.length === 0) {
      setHistoryIndex(null); // Back to current state
    } else if (historyIndex !== null && historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }

    setSelectedParagraphs(new Set());
    setLastSelectedIndex(null);

    if (diffIndex >= 0 && diffIndex < nextState.paragraphs.length) {
      scrollToParagraph(diffIndex);
    }
  }, [document, futureStates, historyIndex, findFirstDifference, scrollToParagraph]);

  // Check if undo/redo are available
  const canUndo = history && history.snapshots.length > 0 && (historyIndex === null || historyIndex < history.snapshots.length - 1);
  const canRedo = futureStates.length > 0;

  // Generate content using AI
  const handleGenerateContent = useCallback(async () => {
    if (!generatePrompt.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      const res = await fetch('/api/document/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: generatePrompt,
          profileId: activeProfile,
          documentContext: document ? {
            title: document.title,
            existingParagraphs: document.paragraphs.map(p => p.content),
            structure: document.structure,
          } : null,
          insertAfterIndex: insertAtIndex,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate content');

      const data = await res.json();

      // Parse generated content into paragraphs
      const generatedParagraphs = data.content
        .split(/\n\s*\n/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      if (!document) {
        // Create new document with generated content
        const newDoc: Document = {
          id: `doc-${Date.now()}`,
          title: data.suggestedTitle || 'Generated Document',
          paragraphs: generatedParagraphs.map((content: string, index: number) => ({
            id: `para-${Date.now()}-${index}`,
            index,
            content,
          })),
        };
        setDocument(newDoc);

        // Analyze structure in background
        const structure = await analyzeDocument(generatedParagraphs);
        if (structure) {
          setDocument((prev) => prev ? { ...prev, structure, title: structure.title || prev.title } : null);
        }
      } else {
        // Insert into existing document
        setDocument((prev) => {
          if (!prev) return null;

          const newParagraphs = [...prev.paragraphs];
          const insertPosition = insertAtIndex === null
            ? newParagraphs.length
            : insertAtIndex + 1;

          // Insert generated paragraphs
          const paragraphsToInsert = generatedParagraphs.map((content: string, i: number) => ({
            id: `para-${Date.now()}-${i}`,
            index: 0,
            content,
          }));

          newParagraphs.splice(insertPosition, 0, ...paragraphsToInsert);

          // Recalculate indices
          newParagraphs.forEach((p, i) => {
            p.index = i;
          });

          return { ...prev, paragraphs: newParagraphs };
        });
      }

      setGeneratePrompt('');
      setShowAIGenerate(false);
      setInsertAtIndex(null);
    } catch (err) {
      console.error('Generation error:', err);
      alert('Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  }, [generatePrompt, isGenerating, activeProfile, document, insertAtIndex, selectedModel, analyzeDocument]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Styler" className="h-8 w-8" />
              <h1 className="text-xl font-semibold">Styler</h1>
            </div>
            {isAnalyzing && (
              <span className="text-sm text-[var(--muted-foreground)]">
                Analyzing structure...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Model selector */}
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Profile selector */}
            <select
              value={activeProfile || ''}
              onChange={(e) => setActiveProfile(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              <option value="">Base Style Only</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Diff mode toggle */}
            <select
              value={diffMode}
              onChange={(e) => setDiffMode(e.target.value as 'inline' | 'side-by-side')}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm"
            >
              <option value="inline">Inline Diff</option>
              <option value="side-by-side">Side by Side</option>
            </select>

            {document && (
              <>
                {/* Undo/Redo buttons */}
                <div className="flex border border-[var(--border)] rounded-lg overflow-hidden">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed border-r border-[var(--border)]"
                    title="Undo (go back in history)"
                  >
                    ↩
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo (go forward)"
                  >
                    ↪
                  </button>
                </div>
                <button
                  onClick={handleExportDocument}
                  disabled={isExporting}
                  className="px-4 py-1.5 rounded-lg border border-blue-500 text-blue-600 text-sm hover:bg-blue-50 font-medium disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`px-4 py-1.5 rounded-lg border text-sm ${
                    showHistory
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  History {history && history.snapshots.length > 0 && `(${history.snapshots.length})`}
                </button>
                <button
                  onClick={() => setShowDocProfile(!showDocProfile)}
                  className={`px-4 py-1.5 rounded-lg border text-sm ${
                    showDocProfile
                      ? 'border-purple-500 bg-purple-50 text-purple-600'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  Doc Profile
                </button>
                <button
                  onClick={handleClearDocument}
                  className="px-4 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50"
                >
                  Close
                </button>
              </>
            )}
            {/* Search */}
            {document && (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-32 px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)]"
                />
                {searchResults.length > 0 && (
                  <>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {currentSearchIndex + 1}/{searchResults.length}
                    </span>
                    <button
                      onClick={() => navigateSearch('prev')}
                      className="p-1 text-xs hover:bg-[var(--muted)] rounded"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => navigateSearch('next')}
                      className="p-1 text-xs hover:bg-[var(--muted)] rounded"
                    >
                      ▼
                    </button>
                  </>
                )}
                {searchQuery && searchResults.length === 0 && (
                  <span className="text-xs text-red-500">No matches</span>
                )}
              </div>
            )}
            <button
              onClick={cycleTheme}
              className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title={`Theme: ${darkMode}`}
            >
              {darkMode === 'light' && '☀️'}
              {darkMode === 'dark' && '🌙'}
              {darkMode === 'system' && '💻'}
            </button>
            <a
              href="/settings"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Settings
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Documents Sidebar */}
        {showDocumentList && (
          <aside className="w-64 border-r border-[var(--border)] bg-[var(--muted)]/30 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm">Documents</h3>
                <button
                  onClick={() => setShowDocumentList(false)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <button
                onClick={handleNewDocument}
                className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] bg-[var(--background)]"
              >
                + New Document
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {savedDocuments.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">
                  No saved documents yet
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {savedDocuments.filter(doc => doc.id).map((doc, idx) => (
                    <div key={doc.id || `doc-${idx}`} onClick={() => handleLoadDocument(doc.id)} className={`p-3 cursor-pointer hover:bg-[var(--muted)] transition-colors group ${document?.id === doc.id ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {doc.paragraphCount} paragraphs
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatTimestamp(doc.updatedAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSavedDocument(doc.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-xs text-red-600 hover:bg-red-50 rounded transition-opacity"
                          title="Delete document"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Toggle sidebar button when hidden */}
        {!showDocumentList && (
          <button
            onClick={() => setShowDocumentList(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-[var(--muted)] border border-[var(--border)] border-l-0 rounded-r-lg hover:bg-[var(--background)]"
            title="Show documents"
          >
            ▶
          </button>
        )}

        {/* Document upload / display */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {!document ? (
            <div className="max-w-2xl mx-auto">
              <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-12 text-center">
                <h2 className="text-lg font-medium mb-4">Upload a Document</h2>
                <p className="text-[var(--muted-foreground)] mb-6">
                  Upload a text file or PDF, or paste your document below
                </p>

                <input
                  type="file"
                  accept=".txt,.pdf,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-block px-6 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg cursor-pointer hover:opacity-90"
                >
                  {isLoading ? 'Processing...' : 'Choose File'}
                </label>

                <div className="my-6 flex items-center gap-4">
                  <hr className="flex-1 border-[var(--border)]" />
                  <span className="text-[var(--muted-foreground)] text-sm">or paste text</span>
                  <hr className="flex-1 border-[var(--border)]" />
                </div>

                <textarea
                  placeholder="Paste your document here..."
                  className="w-full h-48 p-4 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none"
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      handleTextUpload(e.target.value);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleTitleSave();
                          if (e.key === 'Escape') setIsEditingTitle(false);
                        }}
                        className="text-lg font-medium px-2 py-1 border border-[var(--border)] rounded bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        autoFocus
                      />
                      <button
                        onClick={handleTitleSave}
                        className="px-2 py-1 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingTitle(false)}
                        className="px-2 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h2
                      onClick={() => {
                        setEditingTitleValue(document.title);
                        setIsEditingTitle(true);
                      }}
                      className="text-lg font-medium cursor-pointer hover:text-[var(--primary)] transition-colors"
                      title="Click to edit title"
                    >
                      {document.title}
                    </h2>
                  )}
                  {document.structure && (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {document.structure.documentType} • {document.paragraphs.length} paragraphs • {document.structure.sections.length} sections
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClearDocument}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  Load Different Document
                </button>
              </div>

              {/* Insert button at the start */}
              {document.paragraphs.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="text-[var(--muted-foreground)]">No content yet.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInsertHeading(null)}
                      className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
                    >
                      + Add Section Title
                    </button>
                    <button
                      onClick={() => handleInsertParagraph(null)}
                      className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
                    >
                      + Add Paragraph
                    </button>
                    <button
                      onClick={() => {
                        setInsertAtIndex(null);
                        setShowAIGenerate(true);
                      }}
                      className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm"
                    >
                      Generate with AI
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center gap-2 py-2 group">
                  <button
                    onClick={() => handleInsertHeading(null)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title="Insert section title at the beginning"
                  >
                    + Section
                  </button>
                  <button
                    onClick={() => handleInsertParagraph(null)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title="Insert paragraph at the beginning"
                  >
                    + Paragraph
                  </button>
                </div>
              )}

              {document.paragraphs.map((para, index) => {
                const isSearchMatch = searchResults.includes(index);
                const isCurrentSearchMatch = searchResults[currentSearchIndex] === index;
                return (
                  <div key={para.id} id={`para-${index}`}>
                    <div
                      data-para-index={index}
                      className={`relative group ${
                        selectedParagraphs.has(index)
                          ? 'ring-2 ring-[var(--primary)] rounded-lg'
                          : ''
                      } ${
                        isCurrentSearchMatch
                          ? 'bg-yellow-200 dark:bg-yellow-900/50 rounded-lg'
                          : isSearchMatch
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 rounded-lg'
                          : ''
                      }`}
                    >
                      {/* Paragraph number and delete button */}
                      <div className="absolute -left-10 top-2 flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBlock(index);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-red-500 hover:bg-red-50 rounded transition-opacity"
                          title="Delete block"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <span className="text-xs text-[var(--muted-foreground)] w-4 text-right">
                          {index + 1}
                        </span>
                      </div>

                      {/* Show diff if edited, direct edit mode, or normal content */}
                      {para.edited ? (
                        <div className="space-y-2">
                          {/* Show critique badge, iterations, and batch edit indicator */}
                          <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
                            {para.critique && (
                              <CritiqueBadge critique={para.critique} />
                            )}
                            {para.iterations && para.iterations > 1 && (
                              <span
                                className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs rounded"
                                title={para.convergenceHistory?.map(h =>
                                  `Attempt ${h.attempt}: ${Math.round(h.alignmentScore * 100)}%`
                                ).join('\n')}
                              >
                                {para.iterations} iterations
                              </span>
                            )}
                            {para.documentProfileApplied && (
                              <span
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded"
                                title="Document-specific preferences were applied to this edit"
                              >
                                Doc Profile
                              </span>
                            )}
                            {para.originalBatchContent && (
                              <span className="text-blue-700 dark:text-blue-300 text-xs">
                                Multi-paragraph edit
                              </span>
                            )}
                          </div>
                          {diffMode === 'inline' ? (
                            <DiffView
                              original={para.originalBatchContent || para.content}
                              edited={para.edited}
                              onAccept={(finalText) => handleAcceptEdit(index, finalText)}
                              onReject={() => handleRejectEdit(index)}
                              onFeedback={handleFeedback}
                            />
                          ) : (
                            <SideBySideDiff
                              original={para.originalBatchContent || para.content}
                              edited={para.edited}
                              onAccept={(finalText) => handleAcceptEdit(index, finalText)}
                              onReject={() => handleRejectEdit(index)}
                              onFeedback={handleFeedback}
                            />
                          )}
                        </div>
                      ) : editingParagraphIndex === index ? (
                        <div className="p-2">
                          <textarea
                            value={editingParagraphContent}
                            onChange={(e) => {
                              setEditingParagraphContent(e.target.value);
                              // Auto-resize
                              e.target.style.height = 'auto';
                              e.target.style.height = e.target.scrollHeight + 'px';
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') handleCancelDirectEdit();
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDirectEdit();
                            }}
                            ref={(el) => {
                              if (el) {
                                // Set initial height based on content
                                el.style.height = 'auto';
                                el.style.height = Math.max(el.scrollHeight, 150) + 'px';
                                el.focus();
                                // Select all if it's default placeholder text
                                if (editingParagraphContent === 'New paragraph...' || editingParagraphContent === 'New Section') {
                                  el.select();
                                }
                              }
                            }}
                            className="w-full p-4 border-2 border-[var(--primary)] rounded-lg bg-[var(--background)] resize-none text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                          />
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-[var(--muted-foreground)]">
                              Cmd/Ctrl+Enter to save, Escape to cancel
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={handleCancelDirectEdit}
                                className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveDirectEdit}
                                className="px-3 py-1 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => handleParagraphClick(index, e)}
                          onDoubleClick={() => {
                            setEditingParagraphIndex(index);
                            setEditingParagraphContent(para.content);
                            clearSelection();
                          }}
                          className={`rounded-lg cursor-pointer transition-colors ${
                            para.type === 'heading' ? 'py-2 px-4' : 'p-4'
                          } ${
                            selectedParagraphs.has(index)
                              ? 'bg-[var(--primary)]/5'
                              : 'hover:bg-[var(--muted)]'
                          }`}
                          title="Click to select, Shift+click for range, Cmd/Ctrl+click to add. Double-click to edit directly."
                        >
                          {para.type === 'heading' ? (
                            <h3 className="text-lg font-semibold text-[var(--foreground)]">
                              {para.content}
                            </h3>
                          ) : (
                            <p className="leading-relaxed whitespace-pre-wrap">
                              {para.content}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Insert button after each paragraph */}
                    <div className="flex justify-center gap-2 py-1 group">
                      <button
                        onClick={() => handleInsertHeading(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        title={`Insert section title after item ${index + 1}`}
                      >
                        + Section
                      </button>
                      <button
                        onClick={() => handleInsertParagraph(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        title={`Insert paragraph after item ${index + 1}`}
                      >
                        + Paragraph
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* AI Generate button at bottom */}
              {document.paragraphs.length > 0 && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={() => {
                      setInsertAtIndex(document.paragraphs.length - 1);
                      setShowAIGenerate(true);
                    }}
                    className="px-4 py-2 border border-[var(--primary)] text-[var(--primary)] rounded-lg hover:bg-[var(--primary)]/10 text-sm"
                  >
                    + Generate more content with AI
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Edit panel */}
        {document && selectedParagraphs.size > 0 && (
          <aside className="w-96 border-l border-[var(--border)] bg-[var(--muted)]/30 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const selectedIndices = Array.from(selectedParagraphs).sort((a, b) => a - b);
                const isMultiple = selectedIndices.length > 1;
                return (
                  <>
                    <h3 className="font-medium mb-4">
                      {isMultiple
                        ? `Edit ${selectedIndices.length} Paragraphs`
                        : `Edit Paragraph ${selectedIndices[0] + 1}`}
                    </h3>

                    {/* Show selected paragraphs info */}
                    {isMultiple && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                        <p className="font-medium text-blue-700 dark:text-blue-300">
                          Multi-paragraph edit
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Paragraphs {selectedIndices.map(i => i + 1).join(', ')} selected.
                          The AI will improve flow, merge ideas, or reorganize as needed.
                        </p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Edit Instruction
                        </label>
                        <textarea
                          value={editInstruction}
                          onChange={(e) => setEditInstruction(e.target.value)}
                          placeholder={isMultiple
                            ? "e.g., Improve transitions, merge these ideas, make more cohesive..."
                            : "e.g., Make it more concise, fix grammar, improve clarity..."
                          }
                          className="w-full h-24 p-3 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none text-sm"
                        />
                        {/* Quick templates */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {[
                            'Make concise',
                            'Fix grammar',
                            'Improve clarity',
                            'Add hedging',
                            'More formal',
                            'Simplify',
                          ].map((template) => (
                            <button
                              key={template}
                              onClick={() => setEditInstruction(template)}
                              className="px-2 py-0.5 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                            >
                              {template}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="text-xs text-[var(--muted-foreground)]">
                        <p className="mb-2">The system will consider:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Your writing style preferences</li>
                          <li>Document structure and section type</li>
                          <li>Surrounding paragraphs for context</li>
                          <li>Defined terms and acronyms</li>
                          {activeProfile && (
                            <li>
                              Audience: {profiles.find((p) => p.id === activeProfile)?.name}
                            </li>
                          )}
                        </ul>
                      </div>

                      <button
                        onClick={handleRequestEdit}
                        disabled={isLoading}
                        className="w-full py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        {isLoading ? 'Getting suggestion...' : (isMultiple ? 'Improve Flow' : 'Get Edit Suggestion')}
                      </button>

                      {/* Agent Visualization Toggle */}
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showAgentViz}
                          onChange={(e) => setShowAgentViz(e.target.checked)}
                          className="rounded border-[var(--border)]"
                        />
                        <span className="text-[var(--muted-foreground)]">Show agent activity</span>
                      </label>

                      {/* Agent Visualization */}
                      {showAgentViz && (
                        <AgentVisualization
                          isActive={isLoading}
                          maxIterations={3}
                        />
                      )}

                      <button
                        onClick={clearSelection}
                        className="w-full py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </aside>
        )}

        {/* History panel */}
        {document && showHistory && (
          <aside className="w-80 border-l border-[var(--border)] bg-[var(--muted)]/30 flex flex-col">
            <div className="p-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Version History</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Check two versions to compare, or click Revert
              </p>
            </div>

            {/* Compare diff view */}
            {compareVersions[0] && compareVersions[1] && history && (() => {
              const v1 = history.snapshots.find(s => s.id === compareVersions[0]);
              const v2 = history.snapshots.find(s => s.id === compareVersions[1]);
              if (!v1 || !v2) return null;
              const text1 = v1.paragraphs.map(p => p.content).join('\n\n');
              const text2 = v2.paragraphs.map(p => p.content).join('\n\n');
              return (
                <div className="p-3 border-b border-[var(--border)] bg-yellow-50 dark:bg-yellow-900/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">Comparing versions</span>
                    <button
                      onClick={() => setCompareVersions([null, null])}
                      className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded">
                      <strong>Older:</strong> {v1.changeDescription}
                      <br />
                      <span className="text-[var(--muted-foreground)]">{v1.paragraphs.length} paragraphs</span>
                    </div>
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                      <strong>Newer:</strong> {v2.changeDescription}
                      <br />
                      <span className="text-[var(--muted-foreground)]">{v2.paragraphs.length} paragraphs</span>
                    </div>
                    <div className="p-2 bg-[var(--background)] rounded border border-[var(--border)]">
                      <strong>Diff:</strong>
                      <br />
                      {text1 === text2 ? (
                        <span className="text-[var(--muted-foreground)]">No differences</span>
                      ) : (
                        <span>
                          {Math.abs(v2.paragraphs.length - v1.paragraphs.length) > 0 && (
                            <span className="block">Paragraphs: {v1.paragraphs.length} → {v2.paragraphs.length}</span>
                          )}
                          <span className="block">Words: {text1.split(/\s+/).length} → {text2.split(/\s+/).length}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto">
              {(!history || history.snapshots.length === 0) ? (
                <div className="p-4 text-center text-[var(--muted-foreground)] text-sm">
                  No history yet. History is saved when you accept edits.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {history.snapshots.map((snapshot, idx) => {
                    const isSelected = compareVersions.includes(snapshot.id);
                    return (
                      <div
                        key={snapshot.id}
                        className={`p-3 hover:bg-[var(--muted)] cursor-pointer group ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleVersionCompare(snapshot.id)}
                            className="mt-1 rounded"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {snapshot.changeDescription}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {formatTimestamp(snapshot.timestamp)}
                            </p>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {snapshot.paragraphs.length} paragraphs
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Revert to this version from ${formatTimestamp(snapshot.timestamp)}? Your current state will be saved to history first.`)) {
                                handleRevert(snapshot);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90 transition-opacity"
                          >
                            Revert
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {history && history.snapshots.length > 0 && (
              <div className="p-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                Showing {history.snapshots.length} of {history.maxSnapshots} max versions
              </div>
            )}
          </aside>
        )}

        {/* Document Profile Panel */}
        {document && showDocProfile && (
          <aside className="w-80 border-l border-[var(--border)] bg-[var(--background)] flex flex-col overflow-hidden">
            <DocumentProfilePanel
              documentId={document.id}
              baseProfileName={profiles.find(p => p.id === activeProfile)?.name}
              profiles={profiles}
              onClose={() => setShowDocProfile(false)}
            />
          </aside>
        )}
      </div>

      {/* AI Generation Modal */}
      {showAIGenerate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">Generate Content with AI</h2>
              <button
                onClick={() => {
                  setShowAIGenerate(false);
                  setGeneratePrompt('');
                  setInsertAtIndex(null);
                }}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Context info */}
              <div className="p-3 bg-[var(--muted)]/50 rounded-lg text-sm">
                {!document || document.paragraphs.length === 0 ? (
                  <p>Creating a new document from scratch.</p>
                ) : insertAtIndex === null ? (
                  <p>Content will be added at the end of the document.</p>
                ) : (
                  <p>Content will be inserted after paragraph {insertAtIndex + 1}.</p>
                )}
                {activeProfile && (
                  <p className="mt-1 text-[var(--muted-foreground)]">
                    Using profile: {profiles.find((p) => p.id === activeProfile)?.name}
                  </p>
                )}
              </div>

              {/* Prompt input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  What would you like to generate?
                </label>
                <textarea
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  placeholder="e.g., Write an introduction about climate change impacts on coastal cities, focusing on economic consequences..."
                  className="w-full h-32 p-4 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none text-sm"
                  autoFocus
                />
              </div>

              {/* Quick prompts */}
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Quick suggestions:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Write an introduction',
                    'Add a methods section',
                    'Write a conclusion',
                    'Expand on the previous point',
                    'Add supporting evidence',
                    'Create a transition paragraph',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setGeneratePrompt(suggestion + (generatePrompt ? ': ' + generatePrompt : ''))}
                      className="px-2 py-1 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--muted)]/30">
              <button
                onClick={() => {
                  setShowAIGenerate(false);
                  setGeneratePrompt('');
                  setInsertAtIndex(null);
                }}
                className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateContent}
                disabled={!generatePrompt.trim() || isGenerating}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
