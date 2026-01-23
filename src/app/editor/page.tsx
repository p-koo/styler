'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import DiffView, { SideBySideDiff, type FeedbackType, type RejectFeedback, type RefinementContext } from '@/components/DiffView';
import CritiqueBadge from '@/components/CritiqueBadge';
import EditInsights from '@/components/EditInsights';
import AgentVisualization from '@/components/AgentVisualization';
import DocumentProfilePanel from '@/components/DocumentProfilePanel';
import FeedbackPanel, { type FeedbackPanelState, DEFAULT_FEEDBACK_STATE } from '@/components/FeedbackPanel';
import StructurePanel, { DEFAULT_STRUCTURE_STATE } from '@/components/StructurePanel';
import type { StructurePanelState, StructureProposal } from '@/types';
import SyntaxHighlighter, { type HighlightMode } from '@/components/SyntaxHighlighter';
import ApiKeyWarning from '@/components/ApiKeyWarning';
import SelectionEditPopover from '@/components/SelectionEditPopover';
import ChatPanel from '@/components/ChatPanel';
import { ToastContainer, showToast } from '@/components/Toast';
import { useTextSelection, type TextSelection } from '@/hooks/useTextSelection';
import type { AudienceProfile, CritiqueAnalysis } from '@/types';

// Shared theme storage key (same as settings page)
const THEME_STORAGE_KEY = 'styler-theme';

// Dynamic import CodeMirror to avoid SSR issues
const CodeMirrorEditor = dynamic(() => import('@/components/CodeMirrorEditor'), {
  ssr: false,
  loading: () => <div className="h-32 bg-[var(--muted)] animate-pulse rounded" />,
});
import {
  getDocumentHistory,
  saveSnapshot,
  formatTimestamp,
  type DocumentSnapshot,
  type DocumentHistory,
} from '@/memory/document-history';
import { smartSplit, cleanupCells, type SyntaxMode } from '@/utils/smart-split';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { jsPDF } from 'jspdf';

interface DocumentSection {
  id: string;
  name: string;
  type: string;
  startCell: number;
  endCell: number;
  purpose: string;
}

interface DocumentStructure {
  title: string;
  documentType: string;
  sections: DocumentSection[];
  keyTerms: string[];
  mainArgument: string;
}

// Agent trace type (matches orchestrator)
interface AgentTraceEntry {
  agent: 'intent' | 'prompt' | 'llm' | 'critique';
  timestamp: number;
  durationMs: number;
  summary: string;
  details?: Record<string, unknown>;
}

interface Cell {
  id: string;
  index: number;
  content: string;
  type?: 'cell' | 'heading'; // Default is 'cell'
  edited?: string;
  editAccepted?: boolean;
  originalBatchContent?: string; // For batch edits: combined original cells
  critique?: CritiqueAnalysis; // Critique analysis for the suggested edit
  iterations?: number; // Number of orchestrator attempts
  convergenceHistory?: Array<{
    attempt: number;
    alignmentScore: number;
    adjustmentsMade: string[];
  }>;
  agentTrace?: AgentTraceEntry[]; // Trace of agent activity
  documentProfileApplied?: boolean; // Whether document-specific profile was used
  // Batch edit per-cell tracking
  batchEditStatus?: 'modified' | 'removed' | 'unchanged'; // Status in batch edit
  batchEditContent?: string; // New content for this cell (if modified)
  batchEditGroupId?: string; // Group ID to link cells in same batch edit
  batchNewCells?: Array<{ content: string; type?: 'cell' | 'heading' }>; // New cells to be added (only on first cell of batch)
  // For merged cell editing (simplified multi-cell edit)
  originalMergedCells?: Array<{ content: string; type?: 'cell' | 'heading' }>; // Original cells before merge
  mergedFromIndices?: number[]; // Original indices that were merged
}

interface Document {
  id: string;
  title: string;
  cells: Cell[];
  structure?: DocumentStructure;
}

const MODEL_STORAGE_KEY = 'preference-editor-model';
const LAST_DOCUMENT_STORAGE_KEY = 'preference-last-document';

// Auto-detect syntax mode from content
function detectSyntaxMode(content: string): HighlightMode {
  // Check for LaTeX patterns
  const latexPatterns = [
    /\\(?:documentclass|usepackage|begin|end|section|subsection|textbf|textit|cite|ref)\b/,
    /\\[a-zA-Z]+\{/,  // Commands with arguments
    /\$[^$]+\$/,      // Inline math
    /\$\$[\s\S]+?\$\$/, // Display math
    /\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega)\b/, // Greek letters
  ];

  const latexScore = latexPatterns.reduce((score, pattern) =>
    score + (pattern.test(content) ? 1 : 0), 0);

  // Check for Markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers
    /\*\*[^*]+\*\*/,         // Bold
    /\*[^*]+\*/,             // Italic
    /`[^`]+`/,               // Inline code
    /```[\s\S]*?```/,        // Code blocks
    /\[[^\]]+\]\([^)]+\)/,   // Links
    /^[-*]\s+/m,             // Unordered lists
    /^\d+\.\s+/m,            // Ordered lists
  ];

  const markdownScore = markdownPatterns.reduce((score, pattern) =>
    score + (pattern.test(content) ? 1 : 0), 0);

  // Require at least 2 matches to detect
  if (latexScore >= 2) return 'latex';
  if (markdownScore >= 2) return 'markdown';

  return 'plain';
}

interface SavedDocumentInfo {
  id: string;
  title: string;
  cellCount: number;
  updatedAt: string;
}

export default function EditorPage() {
  const [document, setDocument] = useState<Document | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refiningCellIndex, setRefiningCellIndex] = useState<number | null>(null);
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
  const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);
  const [editingCellContent, setEditingCellContent] = useState('');
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null); // null = at end, number = after that index
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null); // null = current state, 0 = most recent snapshot, etc.
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); // For canceling LLM requests
  const [futureStates, setFutureStates] = useState<Array<{ cells: Cell[]; description: string }>>([]); // For redo
  const [showDocProfile, setShowDocProfile] = useState(false); // Document profile panel
  const [darkMode, setDarkMode] = useState<'system' | 'light' | 'dark'>('system'); // Theme preference
  const [editorMode, setEditorMode] = useState<HighlightMode>('plain'); // Syntax highlighting mode
  const [showNavMenu, setShowNavMenu] = useState(false); // Navigation dropdown
  const [showFeedbackPanel, setShowFeedbackPanel] = useState(true); // Edit panel - visible by default
  const [feedbackStates, setFeedbackStates] = useState<Record<string, FeedbackPanelState>>({}); // Per-document feedback states
  const [structureStates, setStructureStates] = useState<Record<string, StructurePanelState>>({}); // Per-document structure states
  const [editMode, setEditMode] = useState<'styler' | 'structure' | 'vibe'>('styler'); // Active tab in edit panel
  const [selectedStylerTemplates, setSelectedStylerTemplates] = useState<string[]>([]); // Multi-select Styler templates
  const [showNewDocModal, setShowNewDocModal] = useState(false); // New document creation modal
  const [newDocMode, setNewDocMode] = useState<'blank' | 'paste' | 'generate'>('blank'); // How to start new doc
  const [pasteContent, setPasteContent] = useState(''); // Content to paste for new doc
  const [newDocTitle, setNewDocTitle] = useState(''); // Title for new doc
  const [quickPasteContent, setQuickPasteContent] = useState(''); // Content for quick paste upload
  const navMenuRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState(''); // Document search
  const [reviewHighlightedCells, setReviewHighlightedCells] = useState<Set<number>>(new Set()); // Cells highlighted from review suggestion
  const [searchResults, setSearchResults] = useState<number[]>([]); // Paragraph indices with matches
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0); // Current match navigation
  const [compareVersions, setCompareVersions] = useState<[string | null, string | null]>([null, null]); // Version IDs to compare
  const [showChatPanel, setShowChatPanel] = useState(false); // Chat assistant panel

  // Text selection for targeted editing
  const { selection: textSelection, clearSelection: clearTextSelection, lockSelection, unlockSelection } = useTextSelection({
    containerSelector: '[data-cell-container]',
    cellDataAttribute: 'data-cell-index',
  });
  const [isSelectionEditing, setIsSelectionEditing] = useState(false);
  const [selectionEditResult, setSelectionEditResult] = useState<{
    originalText: string;
    editedText: string;
    instruction: string;
    cellIndex: number;
    startOffset: number;
    endOffset: number;
  } | null>(null);

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

  // Document order for manual reordering
  const [documentOrder, setDocumentOrder] = useState<string[]>([]);

  // Load saved documents list from API on mount
  const loadDocumentsList = useCallback(async () => {
    try {
      // Fetch documents and order in parallel
      const [docsRes, orderRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/documents/order')
      ]);

      if (docsRes.ok) {
        const docsData = await docsRes.json();
        let documents = docsData.documents || [];

        // Apply custom order if available
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          const order = orderData.order || [];
          setDocumentOrder(order);

          if (order.length > 0) {
            // Sort documents by custom order, keeping unordered at end
            documents = [...documents].sort((a: SavedDocumentInfo, b: SavedDocumentInfo) => {
              const aIndex = order.indexOf(a.id);
              const bIndex = order.indexOf(b.id);
              // If both have order, use that
              if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
              // If only one has order, put ordered first
              if (aIndex !== -1) return -1;
              if (bIndex !== -1) return 1;
              // Neither has order, sort by updatedAt
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
          }
        }

        setSavedDocuments(documents);
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

  // Track if theme has been loaded from storage
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Load saved theme on mount (uses shared key with settings page)
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'system' | 'light' | 'dark' | null;
    if (savedTheme) {
      setDarkMode(savedTheme);
    }
    setThemeLoaded(true);
  }, []);

  // Apply dark mode class to document (only after theme is loaded)
  useEffect(() => {
    if (!themeLoaded) return; // Don't apply until we've loaded from storage

    const root = window.document.documentElement;
    root.classList.remove('dark', 'light');
    if (darkMode === 'dark') {
      root.classList.add('dark');
    } else if (darkMode === 'light') {
      root.classList.add('light');
    }
    localStorage.setItem(THEME_STORAGE_KEY, darkMode);
  }, [darkMode, themeLoaded]);

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
    const matches = document.cells
      .map((p, idx) => (p.content.toLowerCase().includes(query) ? idx : -1))
      .filter((idx) => idx !== -1);
    setSearchResults(matches);
    setCurrentSearchIndex(0);
  }, [searchQuery, document]);

  // Close nav menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setShowNavMenu(false);
      }
    }
    window.document.addEventListener('mousedown', handleClickOutside);
    return () => window.document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    window.document.addEventListener('mousedown', handleClickOutside);
    return () => window.document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    // Scroll to the cell
    const cellEl = window.document.getElementById(`cell-${searchResults[newIndex]}`);
    cellEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Track save status to avoid spamming toasts
  const lastSaveFailedRef = useRef(false);
  const saveRetryCountRef = useRef(0);

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
        // Get current feedback state for this document
        const currentFeedbackState = feedbackStates[document.id];

        const response = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: document.id,
            title: document.title,
            cells: document.cells,
            structure: document.structure,
            selectedProfileId: activeProfile,
            syntaxMode: editorMode,
            // Separate custom instructions for each edit mode
            stylerInstruction: editInstruction,
            vibeGuidance: currentFeedbackState?.guidance || '',
            vibeSelectedPresets: currentFeedbackState?.selectedVibes || [],
          }),
        });

        if (!response.ok) {
          throw new Error('Save failed');
        }

        // If we recovered from a failure, show success
        if (lastSaveFailedRef.current) {
          showToast('Changes saved', 'success');
          lastSaveFailedRef.current = false;
          saveRetryCountRef.current = 0;
        }

        // Silently refresh documents list
        loadDocumentsList();
      } catch (e) {
        console.error('Auto-save failed:', e);

        // Only show error toast on first failure or after several retries
        if (!lastSaveFailedRef.current) {
          showToast('Changes not saved - check connection', 'error');
          lastSaveFailedRef.current = true;
        } else {
          // Increment retry count and show periodic reminders
          saveRetryCountRef.current++;
          if (saveRetryCountRef.current % 5 === 0) {
            showToast('Still unable to save - changes may be lost', 'error');
          }
        }
      }
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [document, loadDocumentsList, activeProfile, editorMode, editInstruction, feedbackStates]);

  // Export document as Word (.docx) file
  const handleExportWord = useCallback(async () => {
    if (!document || isExporting) return;

    setIsExporting(true);
    setShowExportMenu(false);
    try {
      // Build paragraphs for Word document
      const paragraphs = document.cells.map((cell) => {
        return new Paragraph({
          children: [
            new TextRun({
              text: cell.content,
              size: 24, // 12pt
            }),
          ],
          spacing: { after: 200 },
        });
      });

      // Create the document
      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: [
              // Title
              new Paragraph({
                children: [
                  new TextRun({
                    text: document.title,
                    bold: true,
                    size: 32, // 16pt
                  }),
                ],
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 400 },
              }),
              ...paragraphs,
            ],
          },
        ],
      });

      // Generate and download
      const blob = await Packer.toBlob(doc);
      const sanitizedTitle = document.title
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${sanitizedTitle}_${timestamp}.docx`;

      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Exported as Word document', 'success');
    } catch (e) {
      console.error('Failed to export Word document:', e);
      showToast('Failed to export Word document', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [document, isExporting]);

  // Export document as PDF file
  const handleExportPdf = useCallback(() => {
    if (!document || isExporting) return;

    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let yPosition = margin;

      // Add title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      const titleLines = pdf.splitTextToSize(document.title, maxWidth);
      pdf.text(titleLines, margin, yPosition);
      yPosition += titleLines.length * 8 + 10;

      // Add content
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');

      for (const cell of document.cells) {
        const lines = pdf.splitTextToSize(cell.content, maxWidth);

        // Check if we need a new page
        const lineHeight = 5;
        const blockHeight = lines.length * lineHeight + 8;
        if (yPosition + blockHeight > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.text(lines, margin, yPosition);
        yPosition += blockHeight;
      }

      // Save the PDF
      const sanitizedTitle = document.title
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${sanitizedTitle}_${timestamp}.pdf`;

      pdf.save(filename);
      showToast('Exported as PDF', 'success');
    } catch (e) {
      console.error('Failed to export PDF:', e);
      showToast('Failed to export PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  }, [document, isExporting]);

  // Export as plain text (renamed from handleExportDocument)
  const handleExportTxt = useCallback(() => {
    if (!document || isExporting) return;

    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const textContent = document.cells
        .map((p) => p.content)
        .join('\n\n');

      const sanitizedTitle = document.title
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${sanitizedTitle}_${timestamp}.txt`;

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Exported as text file', 'success');
    } catch (e) {
      console.error('Failed to export document:', e);
      showToast('Failed to export document', 'error');
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
      setSelectedCells(new Set());
      setLastSelectedIndex(null);

      // Save as last opened document for restoration
      localStorage.setItem(LAST_DOCUMENT_STORAGE_KEY, docId);

      // Restore the profile that was selected for this document
      if (loadedDoc.selectedProfileId !== undefined) {
        setActiveProfile(loadedDoc.selectedProfileId);
      }

      // Restore or auto-detect syntax mode
      if (loadedDoc.syntaxMode) {
        setEditorMode(loadedDoc.syntaxMode);
      } else {
        // Auto-detect from content
        const fullContent = loadedDoc.cells.map((p: { content: string }) => p.content).join('\n');
        const detected = detectSyntaxMode(fullContent);
        setEditorMode(detected);
      }

      // Restore separate custom instructions
      // Styler Edit instruction
      if (loadedDoc.stylerInstruction) {
        setEditInstruction(loadedDoc.stylerInstruction);
      } else {
        setEditInstruction('');
      }

      // Vibe Edit guidance and presets
      if (loadedDoc.vibeGuidance || loadedDoc.vibeSelectedPresets) {
        setFeedbackStates(prev => ({
          ...prev,
          [loadedDoc.id]: {
            ...DEFAULT_FEEDBACK_STATE,
            guidance: loadedDoc.vibeGuidance || '',
            selectedVibes: loadedDoc.vibeSelectedPresets || [],
          }
        }));
      }
    } catch (e) {
      console.error('Failed to load document:', e);
      showToast('Failed to load document', 'error');
    }
  }, []);

  // Auto-restore last opened document on mount
  const hasAttemptedRestore = useRef(false);
  useEffect(() => {
    // Only attempt once, when savedDocuments first loads
    if (hasAttemptedRestore.current || document || savedDocuments.length === 0) return;
    hasAttemptedRestore.current = true;

    const lastDocId = localStorage.getItem(LAST_DOCUMENT_STORAGE_KEY);
    if (lastDocId && savedDocuments.some(doc => doc.id === lastDocId)) {
      handleLoadDocument(lastDocId);
    }
  }, [savedDocuments, document, handleLoadDocument]);

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

      // If we deleted the last opened document, clear it from localStorage
      const lastDocId = localStorage.getItem(LAST_DOCUMENT_STORAGE_KEY);
      if (lastDocId === docId) {
        localStorage.removeItem(LAST_DOCUMENT_STORAGE_KEY);
      }

      // Refresh the documents list
      await loadDocumentsList();
    } catch (e) {
      console.error('Failed to delete document:', e);
      showToast('Failed to delete document', 'error');
    }
  }, [document?.id, loadDocumentsList]);

  // Reorder documents (move up or down)
  const handleReorderDocument = useCallback(async (docId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();

    const currentIndex = savedDocuments.findIndex(doc => doc.id === docId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= savedDocuments.length) return;

    // Create new order
    const newDocs = [...savedDocuments];
    const [removed] = newDocs.splice(currentIndex, 1);
    newDocs.splice(newIndex, 0, removed);

    // Update local state immediately for responsiveness
    setSavedDocuments(newDocs);

    // Save new order to server
    const newOrder = newDocs.map(doc => doc.id);
    setDocumentOrder(newOrder);

    try {
      await fetch('/api/documents/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: newOrder }),
      });
    } catch (e) {
      console.error('Failed to save document order:', e);
    }
  }, [savedDocuments]);

  // Handle feedback panel state changes - memoized to prevent infinite loops
  const handleFeedbackStateChange = useCallback((state: FeedbackPanelState) => {
    if (!document?.id) return;
    setFeedbackStates(prev => ({ ...prev, [document.id]: state }));
  }, [document?.id]);

  // Handle structure panel state changes - memoized to prevent infinite loops
  const handleStructureStateChange = useCallback((state: StructurePanelState) => {
    if (!document?.id) return;
    setStructureStates(prev => ({ ...prev, [document.id]: state }));
  }, [document?.id]);

  // Apply structure proposals to the document
  const handleApplyStructureProposals = useCallback((proposals: StructureProposal[]) => {
    if (!document) return;

    // Sort proposals by type priority: remove first (to get indices right), then others
    // Actually, we need to apply them in a way that doesn't break indices
    // For now, apply one at a time and recalculate

    setDocument(prev => {
      if (!prev) return null;

      let cells = [...prev.cells];

      // Process proposals in reverse order of position to avoid index shifting issues
      // Group by type for cleaner processing
      const sorted = [...proposals].sort((a, b) => {
        // Process in order: clarify/condense first (content changes), then structural changes
        const typeOrder: Record<StructureProposal['type'], number> = {
          remove: 7,
          reorder: 6,
          split: 5,
          merge: 4,
          add: 3,
          transition: 2,
          condense: 1,
          clarify: 0,
        };
        return typeOrder[a.type] - typeOrder[b.type];
      });

      for (const proposal of sorted) {
        switch (proposal.type) {
          case 'add': {
            const newCell = {
              id: `para-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              index: proposal.insertPosition,
              content: proposal.newContent,
              type: 'cell' as const,
            };
            cells.splice(proposal.insertPosition, 0, newCell);
            // Reindex
            cells = cells.map((c, i) => ({ ...c, index: i }));
            break;
          }
          case 'transition': {
            // Add transition after the first cell
            const [afterIndex] = proposal.betweenCells;
            const newCell = {
              id: `para-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              index: afterIndex + 1,
              content: proposal.transitionText,
              type: 'cell' as const,
            };
            cells.splice(afterIndex + 1, 0, newCell);
            // Reindex
            cells = cells.map((c, i) => ({ ...c, index: i }));
            break;
          }
          case 'merge': {
            if (proposal.cellsToMerge.length < 2) break;
            const sortedIndices = [...proposal.cellsToMerge].sort((a, b) => a - b);
            const firstIdx = sortedIndices[0];
            // Replace first cell with merged content
            cells[firstIdx] = {
              ...cells[firstIdx],
              content: proposal.mergedContent,
            };
            // Remove other cells (in reverse order to preserve indices)
            for (let i = sortedIndices.length - 1; i > 0; i--) {
              cells.splice(sortedIndices[i], 1);
            }
            // Reindex
            cells = cells.map((c, i) => ({ ...c, index: i }));
            break;
          }
          case 'split': {
            const idx = proposal.cellToSplit;
            if (idx < 0 || idx >= cells.length) break;
            const originalCell = cells[idx];
            const newCells = proposal.splitContent.map((content, i) => ({
              id: `para-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
              index: idx + i,
              content,
              type: originalCell.type || ('cell' as const),
            }));
            cells.splice(idx, 1, ...newCells);
            // Reindex
            cells = cells.map((c, i) => ({ ...c, index: i }));
            break;
          }
          case 'reorder': {
            const { sourceCells, targetPosition } = proposal;
            if (sourceCells.length === 0) break;
            // Extract cells to move
            const sortedSources = [...sourceCells].sort((a, b) => b - a); // Reverse order
            const movedCells: typeof cells = [];
            for (const idx of sortedSources) {
              if (idx >= 0 && idx < cells.length) {
                movedCells.unshift(cells[idx]);
                cells.splice(idx, 1);
              }
            }
            // Calculate adjusted target position
            let adjustedTarget = targetPosition;
            for (const idx of sourceCells) {
              if (idx < targetPosition) adjustedTarget--;
            }
            // Insert at target
            cells.splice(adjustedTarget, 0, ...movedCells);
            // Reindex
            cells = cells.map((c, i) => ({ ...c, index: i }));
            break;
          }
          case 'remove': {
            const idx = proposal.cellToRemove;
            if (idx >= 0 && idx < cells.length) {
              cells.splice(idx, 1);
              // Reindex
              cells = cells.map((c, i) => ({ ...c, index: i }));
            }
            break;
          }
          case 'condense': {
            const idx = proposal.cellToCondense;
            if (idx >= 0 && idx < cells.length && proposal.condensedContent) {
              cells[idx] = {
                ...cells[idx],
                content: proposal.condensedContent,
              };
            }
            break;
          }
          case 'clarify': {
            const idx = proposal.cellToClarify;
            if (idx >= 0 && idx < cells.length && proposal.clarifiedContent) {
              cells[idx] = {
                ...cells[idx],
                content: proposal.clarifiedContent,
              };
            }
            break;
          }
        }
      }

      return { ...prev, cells };
    });

    // Clear selection after applying
    setSelectedCells(new Set());
  }, [document]);

  // Analyze document structure
  const analyzeDocument = useCallback(async (cells: string[]) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/document/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells }),
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
    // Auto-detect syntax mode from content
    const detectedMode = detectSyntaxMode(text);

    // Use smart splitting based on detected syntax mode
    const cellTexts = smartSplit(text, {
      syntaxMode: detectedMode as SyntaxMode,
    });

    const cells: Cell[] = cellTexts.map((content, index) => ({
      id: `cell-${index}`,
      index,
      content,
    }));

    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title: title || 'Untitled Document',
      cells,
    };

    setDocument(newDoc);
    clearSelection();
    setEditorMode(detectedMode);

    // Analyze structure in background
    const structure = await analyzeDocument(cellTexts);
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
  const handleCellClick = useCallback((index: number, e: React.MouseEvent) => {
    // Switch to Styler tab when selecting cells (don't close panel)
    if (showFeedbackPanel) {
      setEditMode('styler');
    } else {
      // Open the panel on Styler tab when clicking a cell
      setShowFeedbackPanel(true);
      setEditMode('styler');
    }

    if (e.shiftKey && lastSelectedIndex !== null) {
      // Shift+click: select range
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedCells(newSelection);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedCells((prev) => {
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
      setSelectedCells(new Set([index]));
      setLastSelectedIndex(index);
    }
  }, [lastSelectedIndex, showFeedbackPanel]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Handle targeted selection edit - get edit suggestion
  const handleSelectionEdit = useCallback(async (instruction: string) => {
    if (!textSelection || !document) return;

    const cell = document.cells[textSelection.cellIndex];
    if (!cell) return;

    setIsSelectionEditing(true);
    lockSelection(); // Prevent selection from being cleared during edit

    try {
      const res = await fetch('/api/document/edit-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText: textSelection.text,
          fullCellContent: cell.content,
          startOffset: textSelection.startOffset,
          endOffset: textSelection.endOffset,
          instruction,
          profileId: activeProfile,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Edit failed');
      }

      const data = await res.json();

      // Store the result for review (don't apply yet)
      setSelectionEditResult({
        originalText: textSelection.text,
        editedText: data.editedSelection,
        instruction,
        cellIndex: textSelection.cellIndex,
        startOffset: textSelection.startOffset,
        endOffset: textSelection.endOffset,
      });

    } catch (error) {
      console.error('Selection edit failed:', error);
      showToast(error instanceof Error ? error.message : 'Selection edit failed', 'error');
      unlockSelection(); // Unlock on error too
    } finally {
      setIsSelectionEditing(false);
    }
  }, [textSelection, document, activeProfile, selectedModel, lockSelection, unlockSelection]);

  // Accept selection edit
  const handleSelectionEditAccept = useCallback(() => {
    if (!selectionEditResult || !document) return;

    const cell = document.cells[selectionEditResult.cellIndex];
    if (!cell) return;

    // Apply the edit
    const textBefore = cell.content.slice(0, selectionEditResult.startOffset);
    const textAfter = cell.content.slice(selectionEditResult.endOffset);
    const newContent = textBefore + selectionEditResult.editedText + textAfter;

    setDocument(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated.cells = prev.cells.map((c, i) => {
        if (i === selectionEditResult.cellIndex) {
          return { ...c, content: newContent };
        }
        return c;
      });
      return updated;
    });

    // Clear everything
    setSelectionEditResult(null);
    unlockSelection();
    clearTextSelection();
    window.getSelection()?.removeAllRanges();
  }, [selectionEditResult, document, clearTextSelection, unlockSelection]);

  // Reject selection edit
  const handleSelectionEditReject = useCallback(() => {
    setSelectionEditResult(null);
    unlockSelection();
    clearTextSelection();
    window.getSelection()?.removeAllRanges();
  }, [clearTextSelection, unlockSelection]);

  // Refine selection edit
  const handleSelectionEditRefine = useCallback(async (feedback: string) => {
    if (!selectionEditResult || !document) return;

    const cell = document.cells[selectionEditResult.cellIndex];
    if (!cell) return;

    setIsSelectionEditing(true);

    try {
      const res = await fetch('/api/document/edit-selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText: selectionEditResult.originalText,
          fullCellContent: cell.content,
          startOffset: selectionEditResult.startOffset,
          endOffset: selectionEditResult.endOffset,
          instruction: `Previous edit: "${selectionEditResult.editedText}". User feedback: ${feedback}. Please revise the edit based on the feedback.`,
          profileId: activeProfile,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Refine failed');
      }

      const data = await res.json();

      // Update the result with the refined edit
      setSelectionEditResult(prev => prev ? {
        ...prev,
        editedText: data.editedSelection,
        instruction: feedback,
      } : null);

    } catch (error) {
      console.error('Selection edit refine failed:', error);
      showToast(error instanceof Error ? error.message : 'Refine failed', 'error');
    } finally {
      setIsSelectionEditing(false);
    }
  }, [selectionEditResult, document, activeProfile, selectedModel]);

  // Request edit with specific parameters (used by feedback panel Apply button)
  const handleRequestEditDirect = useCallback(async (cellIndices: number[], instruction: string) => {
    console.log('[Vibe Edit] handleRequestEditDirect called:', { cellIndices, instruction, hasDocument: !!document });

    if (!document || cellIndices.length === 0) {
      console.log('[Vibe Edit] Early return - no document or empty cellIndices');
      return;
    }

    // Validate that all indices are within bounds
    const invalidIndices = cellIndices.filter(i => i < 0 || i >= document.cells.length);
    if (invalidIndices.length > 0) {
      console.error('[Vibe Edit] Invalid cell indices:', invalidIndices, 'document has', document.cells.length, 'cells');
      // Clear selection and notify user
      setSelectedCells(new Set());
      alert(`Selection contains invalid cell indices. The document may have changed. Please reselect cells and try again.`);
      return;
    }

    const selectedIndices = [...cellIndices].sort((a, b) => a - b);
    const isMultiple = selectedIndices.length > 1;
    console.log('[Vibe Edit] Processing:', { selectedIndices, isMultiple, totalCells: document.cells.length });

    // Update selection to show which paragraphs are being edited
    setSelectedCells(new Set(cellIndices));
    setEditInstruction(instruction);
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      if (isMultiple) {
        // SIMPLIFIED APPROACH: Merge cells → Edit as one → Split on accept
        // Step 1: Merge all selected cells into one block of text
        const originalCells = selectedIndices.map((i) => ({
          content: document.cells[i]?.content || '',
          type: document.cells[i]?.type || 'cell',
        }));
        const mergedContent = originalCells.map((c) => c.content).join('\n\n');

        console.log('[Vibe Edit] Merged', selectedIndices.length, 'cells into one block');

        // Step 2: Call single-cell edit API on the merged content
        // Include surrounding cells for context (cells before and after the selection)
        const beforeCells = document.cells.slice(0, selectedIndices[0]).map(c => c.content);
        const afterCells = document.cells.slice(selectedIndices[selectedIndices.length - 1] + 1).map(c => c.content);
        const cellsWithContext = [...beforeCells, mergedContent, ...afterCells];
        const mergedCellIndex = beforeCells.length;

        const res = await fetch('/api/document/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cells: cellsWithContext, // Include surrounding cells for context
            cellIndex: mergedCellIndex,
            instruction,
            profileId: activeProfile,
            documentStructure: document.structure,
            model: selectedModel || undefined,
            documentId: document.id,
            syntaxMode: editorMode,
            includeCritique: true, // Include critique for alignment score
          }),
          signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get edit');
        }

        const data = await res.json();
        console.log('[Vibe Edit] Got edited content, length:', data.editedText?.length);

        // Step 3: Merge cells in document - remove selected cells, replace with single merged cell
        // Store original cells for splitting on accept and restore on reject
        setDocument((prev) => {
          if (!prev) return null;
          const updated = { ...prev };

          console.log('[Vibe Edit] Before merge:', prev.cells.length, 'cells, merging indices:', selectedIndices);

          // Build new cells array: keep cells before selection, add merged cell, keep cells after
          const newCells: Cell[] = [];
          let newIndex = 0;

          for (let i = 0; i < prev.cells.length; i++) {
            if (i === selectedIndices[0]) {
              // Insert the merged cell with edit suggestion
              newCells.push({
                id: `merged-${Date.now()}`,
                index: newIndex,
                content: mergedContent,
                type: 'cell', // Merged cell is generic
                edited: data.editedText,
                critique: data.critique, // Include critique for alignment score
                iterations: data.iterations,
                convergenceHistory: data.convergenceHistory,
                agentTrace: data.agentTrace,
                // Store original cells for splitting on accept and restore on reject
                originalMergedCells: originalCells,
                mergedFromIndices: selectedIndices,
                originalBatchContent: mergedContent, // Also store for diff display
              });
              newIndex++;
            } else if (!selectedIndices.includes(i)) {
              // Keep non-selected cells (cells NOT in the selection)
              newCells.push({
                ...prev.cells[i],
                index: newIndex,
              });
              newIndex++;
            }
            // Skip other selected cells (they're merged into the first one and removed from array)
          }

          console.log('[Vibe Edit] After merge:', newCells.length, 'cells (removed', selectedIndices.length - 1, 'cells)');
          updated.cells = newCells;
          return updated;
        });

        // Update selection to just the merged cell
        setSelectedCells(new Set([selectedIndices[0]]));
      } else {
        // Single cell edit
        console.log('[Vibe Edit] Single cell mode, index:', selectedIndices[0], 'instruction:', instruction);

        const cellIndex = selectedIndices[0];
        const res = await fetch('/api/document/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cells: document.cells.map((p) => p.content),
            cellIndex,
            instruction,
            profileId: activeProfile,
            documentStructure: document.structure,
            model: selectedModel || undefined,
            documentId: document.id,
            syntaxMode: editorMode,
            includeCritique: true,
          }),
          signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to get edit');
        }

        const data = await res.json();
        console.log('[Vibe Edit] Single cell response:', data.editedText?.slice(0, 300));

        setDocument((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          updated.cells = [...prev.cells];
          updated.cells[cellIndex] = {
            ...updated.cells[cellIndex],
            edited: data.editedText,
            critique: data.critique,
            iterations: data.iterations,
            convergenceHistory: data.convergenceHistory,
            agentTrace: data.agentTrace,
            documentProfileApplied: data.documentPreferences?.applied,
          };
          return updated;
        });
      }

      // Scroll to show the edit
      const element = window.document.getElementById(`cell-${selectedIndices[0]}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      // Don't show error if request was aborted by user
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Edit request cancelled by user');
        return;
      }
      console.error('Edit request failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to get edit suggestion';
      showToast(`Edit failed: ${message}`, 'error');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [document, activeProfile, selectedModel]);

  // Request edit for selected paragraphs
  const handleRequestEdit = useCallback(async () => {
    if (!document || selectedCells.size === 0) return;

    const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);

    // Validate that all indices are within bounds
    const invalidIndices = selectedIndices.filter(i => i < 0 || i >= document.cells.length);
    if (invalidIndices.length > 0) {
      console.error('[Edit] Invalid cell indices:', invalidIndices, 'document has', document.cells.length, 'cells');
      setSelectedCells(new Set());
      alert(`Selection contains invalid cell indices. Please reselect cells and try again.`);
      return;
    }

    // For multi-cell edits, delegate to handleRequestEditDirect which properly merges cells
    if (selectedIndices.length > 1) {
      const instruction = editInstruction || 'Improve logical flow and coherence';
      handleRequestEditDirect(selectedIndices, instruction);
      return;
    }

    // Single cell edit
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      {
        // Single paragraph: use existing endpoint
        const cellIndex = selectedIndices[0];
        const res = await fetch('/api/document/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cells: document.cells.map((p) => p.content),
            cellIndex,
            instruction: editInstruction || 'Improve this cell',
            profileId: activeProfile,
            documentStructure: document.structure,
            model: selectedModel || undefined,
            documentId: document.id,
            syntaxMode: editorMode,
            includeCritique: true,
          }),
          signal,
        });

        if (!res.ok) throw new Error('Failed to get edit');

        const data = await res.json();

        // Update paragraph with suggested edit, critique, and orchestration info
        setDocument((prev) => {
          if (!prev) return null;
          const updated = { ...prev };
          updated.cells = [...prev.cells];
          updated.cells[cellIndex] = {
            ...updated.cells[cellIndex],
            edited: data.editedText,
            critique: data.critique,
            iterations: data.iterations,
            convergenceHistory: data.convergenceHistory,
            agentTrace: data.agentTrace,
            documentProfileApplied: data.documentPreferences?.applied,
          };
          return updated;
        });
      }
    } catch (err) {
      // Don't show error if request was aborted by user
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Edit request cancelled by user');
        return;
      }
      console.error('Edit error:', err);
      showToast('Failed to get edit suggestion', 'error');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [document, selectedCells, editInstruction, activeProfile, selectedModel, editorMode, handleRequestEditDirect]);

  // Stop/cancel the current LLM request
  const handleStopEdit = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // Accept edit with final text (may be partially accepted or batch edit)
  const handleAcceptEdit = useCallback((index: number, finalText: string) => {
    console.log('handleAcceptEdit called:', { index, finalTextLength: finalText?.length });

    // Detect batch edit from stored metadata, NOT current selection (selection may have changed)
    const cell = document?.cells[index];
    const batchGroupId = cell?.batchEditGroupId;
    const batchIndices = batchGroupId
      ? document?.cells
          .map((c, i) => (c.batchEditGroupId === batchGroupId ? i : -1))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b) || []
      : [];
    const isBatchEdit = batchIndices.length > 1 && batchIndices[0] === index;
    // Use batch indices for the operation, fall back to current selection for single edits
    const selectedIndices = isBatchEdit ? batchIndices : Array.from(selectedCells).sort((a, b) => a - b);

    // Get original and suggested text before updating document
    const originalText = document?.cells[index]?.originalBatchContent || document?.cells[index]?.content || '';
    const suggestedEdit = document?.cells[index]?.edited || '';
    const critique = document?.cells[index]?.critique;
    const docId = document?.id;

    // Determine if this is a partial acceptance
    const isPartial = suggestedEdit !== finalText && finalText !== originalText;
    const decision = isPartial ? 'partial' : 'accepted';

    setDocument((prev) => {
      if (!prev) return null;

      // Check if this is a merged cell (from multi-cell edit)
      const currentCell = prev.cells.find((c, i) => i === index);
      const isMergedCell = currentCell?.originalMergedCells && currentCell.originalMergedCells.length > 0;

      // Save snapshot before making the change
      const snapshot = saveSnapshot(
        prev.id,
        prev.title,
        prev.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
        isMergedCell
          ? `Edited merged cells`
          : isBatchEdit
          ? `Edited cells ${selectedIndices.map(i => i + 1).join(', ')}`
          : `Edited cell ${index + 1}`
      );

      // Update history state
      setHistory((h) => {
        if (!h) return { documentId: prev.id, snapshots: [snapshot], maxSnapshots: 50 };
        return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
      });

      if (isMergedCell) {
        // MERGED CELL: Split the accepted text back into cells
        const originalCellCount = currentCell.originalMergedCells?.length || 1;
        console.log('[Accept Merged] Splitting accepted text back into cells, original count:', originalCellCount);

        // Try to split by double newlines first
        let splitTexts = finalText
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        // If we got fewer splits than original cells, try single newlines
        if (splitTexts.length < originalCellCount && splitTexts.length === 1) {
          const singleNewlineSplit = finalText
            .split(/\n/)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

          // Only use single newline split if it gives us a reasonable number of cells
          if (singleNewlineSplit.length >= originalCellCount) {
            splitTexts = singleNewlineSplit;
            console.log('[Accept Merged] Used single newline split:', splitTexts.length);
          }
        }

        console.log('[Accept Merged] Split into', splitTexts.length, 'cells (original was', originalCellCount, ')');

        // Build new cells array
        const newCells: Cell[] = [];
        let newIndex = 0;

        for (let i = 0; i < prev.cells.length; i++) {
          if (i === index) {
            // Replace merged cell with split cells
            for (const text of splitTexts) {
              newCells.push({
                id: `para-${Date.now()}-${newIndex}`,
                index: newIndex,
                content: text,
                type: 'cell',
                editAccepted: true,
              });
              newIndex++;
            }
          } else {
            // Keep other cells
            newCells.push({
              ...prev.cells[i],
              index: newIndex,
              // Clear any merge-related fields
              originalMergedCells: undefined,
              mergedFromIndices: undefined,
            });
            newIndex++;
          }
        }

        return { ...prev, cells: newCells };
      } else if (isBatchEdit) {
        // OLD BATCH EDIT PATH (for backward compatibility)
        // Batch edit: replace selected cells with new content
        const firstCell = prev.cells[selectedIndices[0]];
        const structuredCells = firstCell?.batchNewCells;

        // Parse into cells - prefer structured data, fall back to text splitting
        interface ParsedCell { content: string; type?: 'cell' | 'heading'; }
        let parsedCells: ParsedCell[];

        if (structuredCells && structuredCells.length > 0) {
          parsedCells = structuredCells;
          console.log('[Accept Batch] Using structured cells:', parsedCells.length);
        } else {
          parsedCells = finalText
            .split(/\n\s*\n/)
            .map((p) => ({ content: p.trim(), type: 'cell' as const }))
            .filter((p) => p.content.length > 0);
          console.log('[Accept Batch] Parsed from text:', parsedCells.length);
        }

        // Build new cells array
        const newCells: Cell[] = [];
        let newIndex = 0;

        for (let i = 0; i < prev.cells.length; i++) {
          if (i === selectedIndices[0]) {
            for (const parsed of parsedCells) {
              newCells.push({
                id: `para-${Date.now()}-${newIndex}`,
                index: newIndex,
                content: parsed.content,
                type: parsed.type || 'cell',
                editAccepted: true,
              });
              newIndex++;
            }
          } else if (!selectedIndices.includes(i)) {
            newCells.push({
              ...prev.cells[i],
              index: newIndex,
            });
            newIndex++;
          }
        }

        return { ...prev, cells: newCells };
      } else {
        // Single paragraph edit - also clear any batch edit status
        const batchGroupId = prev.cells[index]?.batchEditGroupId;
        const updated = { ...prev };
        updated.cells = prev.cells.map((cell, i) => {
          if (i === index) {
            return {
              ...cell,
              content: finalText,
              edited: undefined,
              critique: undefined,
              iterations: undefined,
              convergenceHistory: undefined,
              agentTrace: undefined,
              editAccepted: true,
              batchEditStatus: undefined,
              batchEditContent: undefined,
              batchEditGroupId: undefined,
              batchNewCells: undefined,
            };
          }
          // Clear batch edit status from other cells in same group
          if (batchGroupId && cell.batchEditGroupId === batchGroupId) {
            return {
              ...cell,
              batchEditStatus: undefined,
              batchEditContent: undefined,
              batchEditGroupId: undefined,
              batchNewCells: undefined,
            };
          }
          return cell;
        });
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
          cellIndex: index,
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
    setReviewHighlightedCells(new Set()); // Clear review highlighting
  }, [document, selectedCells, clearSelection, editInstruction, activeProfile, selectedModel]);

  // Reject edit with optional feedback
  const handleRejectEdit = useCallback((index: number, feedback?: RejectFeedback[]) => {
    console.log('handleRejectEdit called:', { index, feedback });
    // Get original and suggested text before updating document
    const currentCell = document?.cells[index];
    const originalText = currentCell?.originalBatchContent || currentCell?.content || '';
    const suggestedEdit = currentCell?.edited || '';
    const critique = currentCell?.critique;
    const docId = document?.id;

    // Check if this is a merged cell that needs to be restored to original cells
    const isMergedCell = currentCell?.originalMergedCells && currentCell.originalMergedCells.length > 0;

    // Get the batch group ID to clear all related cells
    const batchGroupId = currentCell?.batchEditGroupId;

    setDocument((prev) => {
      if (!prev) return null;

      if (isMergedCell && currentCell?.originalMergedCells) {
        // MERGED CELL: Restore original cells
        console.log('[Reject Merged] Restoring', currentCell.originalMergedCells.length, 'original cells');

        const newCells: Cell[] = [];
        let newIndex = 0;

        for (let i = 0; i < prev.cells.length; i++) {
          if (i === index) {
            // Replace merged cell with original cells
            for (const original of currentCell.originalMergedCells) {
              newCells.push({
                id: `para-${Date.now()}-${newIndex}`,
                index: newIndex,
                content: original.content,
                type: original.type || 'cell',
              });
              newIndex++;
            }
          } else {
            // Keep other cells
            newCells.push({
              ...prev.cells[i],
              index: newIndex,
            });
            newIndex++;
          }
        }

        return { ...prev, cells: newCells };
      }

      // Standard reject: just clear edit state
      const updated = { ...prev };
      updated.cells = prev.cells.map((cell) => {
        // Clear this cell or any cell in the same batch group
        if (cell.index === index || (batchGroupId && cell.batchEditGroupId === batchGroupId)) {
          return {
            ...cell,
            edited: undefined,
            critique: undefined,
            iterations: undefined,
            convergenceHistory: undefined,
            agentTrace: undefined,
            originalBatchContent: undefined,
            batchEditStatus: undefined,
            batchEditContent: undefined,
            batchEditGroupId: undefined,
            batchNewCells: undefined,
            originalMergedCells: undefined,
            mergedFromIndices: undefined,
          };
        }
        return cell;
      });
      return updated;
    });

    // Record the rejection for learning (async, don't wait)
    if (docId && suggestedEdit) {
      console.log('Recording rejection:', { docId, hasOriginal: !!originalText, hasSuggested: !!suggestedEdit, feedback });
      fetch('/api/document/edit-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          cellIndex: index,
          originalText,
          suggestedEdit,
          finalText: originalText, // User kept original
          decision: 'rejected',
          instruction: editInstruction || undefined,
          critiqueAnalysis: critique,
          profileId: activeProfile,
          model: selectedModel || undefined,
          feedback: feedback || undefined, // Include explicit feedback if provided
        }),
      })
        .then(res => res.json())
        .then(data => console.log('Rejection recorded with feedback:', data))
        .catch((err) => console.error('Failed to record rejection:', err));
    } else {
      console.log('Skipping rejection - missing data:', { docId, hasSuggested: !!suggestedEdit });
    }

    clearSelection();
    setReviewHighlightedCells(new Set()); // Clear review highlighting
  }, [document, clearSelection, editInstruction, activeProfile, selectedModel]);

  // Handle refine edit request - iterative refinement with user feedback
  const handleRefineEdit = useCallback(async (index: number, refinementContext: RefinementContext) => {
    console.log('handleRefineEdit called:', { index, refinementContext });

    if (!document) return;

    const cell = document.cells[index];
    if (!cell || !cell.edited) {
      console.error('No edited cell to refine at index:', index);
      return;
    }

    setIsRefining(true);
    setRefiningCellIndex(index);

    // Check if this is a multi-cell (merged) edit
    const isMergedEdit = cell.originalMergedCells && cell.originalMergedCells.length > 0;

    try {
      // Get the original text (before any edits)
      // For merged cells, use originalBatchContent which has the combined original text
      const originalText = cell.originalBatchContent || cell.content;

      // Build the cells array for context
      // For the cell being refined, use its original content (not the edited version)
      const cells = document.cells.map((c, i) => {
        if (i === index) {
          // Use the original content for the cell being refined
          return c.originalBatchContent || c.content;
        }
        return c.content;
      });

      console.log('Refining cell:', { index, isMergedEdit, originalLength: originalText.length });

      const res = await fetch('/api/document/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells,
          cellIndex: index,
          instruction: editInstruction || undefined,
          profileId: activeProfile,
          documentStructure: document.structure,
          model: selectedModel || undefined,
          documentId: document.id,
          syntaxMode: editorMode,
          includeCritique: true,
          refinementContext: {
            previousEdit: cell.edited,
            userCurrentText: refinementContext.currentText,
            userFeedback: refinementContext.feedback,
            rejectedChanges: refinementContext.rejectedChanges,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to refine edit');
      }

      const data = await res.json();
      console.log('Refinement response:', data.editedText?.slice(0, 300));

      // Update the cell with the new refined edit
      // IMPORTANT: Preserve all multi-cell edit metadata (originalMergedCells, mergedFromIndices, etc.)
      // so that accept/reject can properly handle the merged cells
      setDocument((prev) => {
        if (!prev) return null;
        const updated = { ...prev };
        updated.cells = [...prev.cells];
        const currentCell = updated.cells[index];

        // Only update the edit-related fields, preserve everything else including multi-cell metadata
        updated.cells[index] = {
          ...currentCell,
          // Update with new refined edit
          edited: data.editedText,
          critique: data.critique,
          iterations: (currentCell.iterations || 1) + data.iterations,
          convergenceHistory: [
            ...(currentCell.convergenceHistory || []),
            ...(data.convergenceHistory || []),
          ],
          agentTrace: [
            ...(currentCell.agentTrace || []),
            ...(data.agentTrace || []),
          ],
          // Explicitly preserve multi-cell edit metadata
          originalMergedCells: currentCell.originalMergedCells,
          mergedFromIndices: currentCell.mergedFromIndices,
          originalBatchContent: currentCell.originalBatchContent,
        };
        return updated;
      });
    } catch (error) {
      console.error('Refinement failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to refine edit';
      showToast(`Refinement failed: ${message}`, 'error');
    } finally {
      setIsRefining(false);
      setRefiningCellIndex(null);
    }
  }, [document, editInstruction, activeProfile, selectedModel, editorMode]);

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
    if (editingCellIndex === null || !document) return;

    const originalContent = document.cells[editingCellIndex]?.content;
    if (editingCellContent === originalContent) {
      // No changes, just exit edit mode
      setEditingCellIndex(null);
      setEditingCellContent('');
      return;
    }

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Directly edited cell ${editingCellIndex + 1}`
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
      updated.cells = [...prev.cells];
      updated.cells[editingCellIndex] = {
        ...updated.cells[editingCellIndex],
        content: editingCellContent,
      };
      return updated;
    });

    setEditingCellIndex(null);
    setEditingCellContent('');
  }, [document, editingCellIndex, editingCellContent]);

  // Cancel direct paragraph edit
  const handleCancelDirectEdit = useCallback(() => {
    setEditingCellIndex(null);
    setEditingCellContent('');
  }, []);

  // Revert to a snapshot
  const handleRevert = useCallback((snapshot: DocumentSnapshot) => {
    setDocument((prev) => {
      if (!prev) return null;

      // Create a snapshot of current state before reverting
      const currentSnapshot = saveSnapshot(
        prev.id,
        prev.title,
        prev.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
        'Before revert'
      );

      // Update history with the new snapshot
      setHistory((h) => {
        if (!h) return { documentId: prev.id, snapshots: [currentSnapshot], maxSnapshots: 50 };
        return { ...h, snapshots: [currentSnapshot, ...h.snapshots].slice(0, 50) };
      });

      // Restore paragraphs from snapshot
      const restoredCells: Cell[] = snapshot.cells.map((p) => ({
        id: p.id,
        index: p.index,
        content: p.content,
      }));

      return {
        ...prev,
        cells: restoredCells,
      };
    });

    setShowHistory(false);
    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Clear document (close without saving)
  const handleClearDocument = useCallback(() => {
    setDocument(null);
    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, []);

  // Create new blank document
  const handleNewDocument = useCallback(() => {
    // Reset new doc modal state and show it
    setNewDocMode('blank');
    setPasteContent('');
    setNewDocTitle('');
    setShowNewDocModal(true);
  }, []);

  // Actually create the new document based on mode
  const handleCreateNewDocument = useCallback(() => {
    const title = newDocTitle.trim() || 'Untitled Document';

    if (newDocMode === 'paste' && pasteContent.trim()) {
      // Detect syntax mode and use smart splitting
      const detectedMode = detectSyntaxMode(pasteContent);
      const paragraphs = smartSplit(pasteContent, {
        syntaxMode: detectedMode as SyntaxMode,
      });

      const cells: Cell[] = paragraphs.map((content, index) => ({
        id: `cell-${index}`,
        index,
        content,
      }));

      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title,
        cells,
      };
      setDocument(newDoc);
      setEditorMode(detectedMode);
    } else if (newDocMode === 'generate') {
      // Create empty doc and show AI generate modal
      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title,
        cells: [],
      };
      setDocument(newDoc);
      setEditorMode('plain');
      setShowAIGenerate(true);
    } else {
      // Blank document - create with one empty cell for immediate editing
      const newDoc: Document = {
        id: `doc-${Date.now()}`,
        title,
        cells: [{
          id: 'cell-0',
          index: 0,
          content: '',
        }],
      };
      setDocument(newDoc);
      setEditorMode('plain');
      // Select the first cell for immediate editing
      setSelectedCells(new Set([0]));
      setEditingCellIndex(0);
      setEditingCellContent('');
    }

    setSelectedCells(new Set());
    setLastSelectedIndex(null);
    setShowNewDocModal(false);
  }, [newDocMode, pasteContent, newDocTitle]);

  // Clean up cells: AI-driven formatting, splitting, and merging
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const handleCleanup = useCallback(async () => {
    if (!document || document.cells.length === 0 || isCleaningUp) return;

    setIsCleaningUp(true);
    try {
      // Join all cells content
      const content = document.cells.map(c => c.content).join('\n\n');

      // Call AI cleanup endpoint
      const res = await fetch('/api/document/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          syntaxMode: editorMode,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to clean up content');
      }

      const data = await res.json();
      const sections = data.sections as string[];

      if (sections && sections.length > 0) {
        const newCells: Cell[] = sections.map((content, index) => ({
          id: `cell-${Date.now()}-${index}`,
          index,
          content,
        }));

        setDocument(prev => prev ? { ...prev, cells: newCells } : null);
        setSelectedCells(new Set());
        setLastSelectedIndex(null);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      // Fallback to local cleanup
      const currentContents = document.cells.map(c => c.content);
      const cleaned = cleanupCells(currentContents, editorMode as SyntaxMode);
      const newCells: Cell[] = cleaned.map((content, index) => ({
        id: `cell-${Date.now()}-${index}`,
        index,
        content,
      }));
      setDocument(prev => prev ? { ...prev, cells: newCells } : null);
      setSelectedCells(new Set());
      setLastSelectedIndex(null);
    } finally {
      setIsCleaningUp(false);
    }
  }, [document, editorMode, selectedModel, isCleaningUp]);

  // Insert a new cell or heading at a specific position
  const handleInsertContent = useCallback((afterIndex: number | null, type: 'cell' | 'heading' = 'cell', content: string = '') => {
    const defaultContent = type === 'heading' ? 'New Section' : 'New cell...';

    setDocument((prev) => {
      if (!prev) return null;

      const newItem: Cell = {
        id: `${type}-${Date.now()}`,
        index: 0, // Will be recalculated
        content: content || defaultContent,
        type,
      };

      const newCells = [...prev.cells];

      if (afterIndex === null || afterIndex < 0) {
        // Insert at beginning
        newCells.unshift(newItem);
      } else if (afterIndex >= prev.cells.length - 1) {
        // Insert at end
        newCells.push(newItem);
      } else {
        // Insert after the specified index
        newCells.splice(afterIndex + 1, 0, newItem);
      }

      // Recalculate indices
      newCells.forEach((p, i) => {
        p.index = i;
      });

      return { ...prev, cells: newCells };
    });

    // Start editing the new content
    const newIndex = afterIndex === null ? 0 : afterIndex + 1;
    setEditingCellIndex(newIndex);
    setEditingCellContent(content || defaultContent);
  }, []);

  // Convenience wrappers
  const handleInsertCell = useCallback((afterIndex: number | null, content: string = '') => {
    handleInsertContent(afterIndex, 'cell', content);
  }, [handleInsertContent]);

  const handleInsertHeading = useCallback((afterIndex: number | null, content: string = '') => {
    handleInsertContent(afterIndex, 'heading', content);
  }, [handleInsertContent]);

  // Delete a single block
  const handleDeleteBlock = useCallback((index: number) => {
    if (!document) return;

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Deleted cell ${index + 1}`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });
    setFutureStates([]); // Clear redo stack

    setDocument((prev) => {
      if (!prev) return null;
      const newCells = prev.cells.filter((_, i) => i !== index);
      newCells.forEach((p, i) => { p.index = i; });
      return { ...prev, cells: newCells };
    });
    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, [document]);

  // Move a cell up or down
  const handleMoveCell = useCallback((index: number, direction: 'up' | 'down') => {
    if (!document) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= document.cells.length) return;

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Moved cell ${index + 1} ${direction}`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });
    setFutureStates([]); // Clear redo stack

    setDocument((prev) => {
      if (!prev) return null;
      const newCells = [...prev.cells];
      const [removed] = newCells.splice(index, 1);
      newCells.splice(newIndex, 0, removed);
      newCells.forEach((p, i) => { p.index = i; });
      return { ...prev, cells: newCells };
    });

    // Update selection to follow the moved cell
    if (selectedCells.has(index)) {
      setSelectedCells(new Set([newIndex]));
      setLastSelectedIndex(newIndex);
    }
  }, [document, selectedCells]);

  // Delete selected blocks
  const handleDeleteSelected = useCallback(() => {
    if (!document || selectedCells.size === 0) return;

    const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Deleted cells ${selectedIndices.map(i => i + 1).join(', ')}`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });
    setFutureStates([]); // Clear redo stack

    setDocument((prev) => {
      if (!prev) return null;
      const newCells = prev.cells.filter((_, i) => !selectedCells.has(i));
      newCells.forEach((p, i) => { p.index = i; });
      return { ...prev, cells: newCells };
    });
    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, [document, selectedCells]);

  // Copy selected blocks to clipboard
  const handleCopySelected = useCallback(() => {
    if (!document || selectedCells.size === 0) return;
    const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);
    const text = selectedIndices
      .map((i) => document.cells[i]?.content || '')
      .join('\n\n');
    navigator.clipboard.writeText(text);
  }, [document, selectedCells]);

  // Split a cell into multiple cells (by double newlines or sentences)
  const handleSplitCell = useCallback((index: number, splitBy: 'newlines' | 'sentences' = 'newlines') => {
    if (!document || index < 0 || index >= document.cells.length) return;

    const cell = document.cells[index];
    const content = cell.content;

    let parts: string[];
    if (splitBy === 'newlines') {
      // Split by double newlines or single newlines
      parts = content.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
    } else {
      // Split by sentences (period, exclamation, question mark followed by space or end)
      parts = content.split(/(?<=[.!?])\s+/).map(p => p.trim()).filter(p => p.length > 0);
    }

    // If only one part, nothing to split
    if (parts.length <= 1) return;

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Split cell ${index + 1} into ${parts.length} cells`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });
    setFutureStates([]); // Clear redo stack

    setDocument((prev) => {
      if (!prev) return null;

      // Create new cells from the parts
      const newCells = [...prev.cells];
      const newItems: Cell[] = parts.map((part, i) => ({
        id: i === 0 ? cell.id : `cell-${Date.now()}-${i}`,
        index: 0, // Will be recalculated
        content: part,
        type: cell.type,
      }));

      // Replace the original cell with the new parts
      newCells.splice(index, 1, ...newItems);

      // Recalculate indices
      newCells.forEach((p, i) => { p.index = i; });

      return { ...prev, cells: newCells };
    });

    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, [document]);

  // Merge selected consecutive cells into one
  const handleMergeCells = useCallback(() => {
    if (!document || selectedCells.size < 2) return;

    const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);

    // Check if selected cells are consecutive
    const isConsecutive = selectedIndices.every((val, i) =>
      i === 0 || val === selectedIndices[i - 1] + 1
    );

    if (!isConsecutive) {
      showToast('Can only merge consecutive cells', 'error');
      return;
    }

    // Save snapshot before making the change
    const snapshot = saveSnapshot(
      document.id,
      document.title,
      document.cells.map((p) => ({ id: p.id, index: p.index, content: p.content })),
      `Merged cells ${selectedIndices.map(i => i + 1).join(', ')}`
    );

    // Update history state
    setHistory((h) => {
      if (!h) return { documentId: document.id, snapshots: [snapshot], maxSnapshots: 50 };
      return { ...h, snapshots: [snapshot, ...h.snapshots].slice(0, 50) };
    });
    setFutureStates([]); // Clear redo stack

    setDocument((prev) => {
      if (!prev) return null;

      const firstIndex = selectedIndices[0];
      const firstCell = prev.cells[firstIndex];

      // Combine content with double newlines to preserve paragraph separation
      const mergedContent = selectedIndices
        .map(i => prev.cells[i]?.content || '')
        .join('\n\n');

      // Create the merged cell
      const mergedCell: Cell = {
        id: firstCell.id,
        index: 0, // Will be recalculated
        content: mergedContent,
        type: firstCell.type,
      };

      // Remove the selected cells and insert the merged one
      const newCells = prev.cells.filter((_, i) => !selectedCells.has(i));
      newCells.splice(firstIndex, 0, mergedCell);

      // Recalculate indices
      newCells.forEach((p, i) => { p.index = i; });

      return { ...prev, cells: newCells };
    });

    setSelectedCells(new Set());
    setLastSelectedIndex(null);
  }, [document, selectedCells]);

  // Find first different paragraph between two arrays
  const findFirstDifference = useCallback((oldParas: Cell[], newParas: Cell[]): number => {
    const maxLen = Math.max(oldParas.length, newParas.length);
    for (let i = 0; i < maxLen; i++) {
      if (!oldParas[i] || !newParas[i] || oldParas[i].content !== newParas[i].content) {
        return i;
      }
    }
    return -1;
  }, []);

  // Scroll to a paragraph by index
  const scrollToCell = useCallback((index: number) => {
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

    const currentCells = [...document.cells];

    // Save current state to future states for redo
    setFutureStates((prev) => [
      { cells: currentCells, description: 'Current state' },
      ...prev,
    ]);

    // Get the snapshot to restore
    const snapshotIndex = historyIndex === null ? 0 : historyIndex + 1;
    if (snapshotIndex >= history.snapshots.length) return; // No more history

    const snapshot = history.snapshots[snapshotIndex];

    // Restore paragraphs from snapshot
    const restoredCells: Cell[] = snapshot.cells.map((p) => ({
      id: p.id,
      index: p.index,
      content: p.content,
    }));

    // Find first difference and scroll to it
    const diffIndex = findFirstDifference(currentCells, restoredCells);

    setDocument((prev) => prev ? { ...prev, cells: restoredCells } : null);
    setHistoryIndex(snapshotIndex);
    setSelectedCells(new Set());
    setLastSelectedIndex(null);

    if (diffIndex >= 0 && diffIndex < restoredCells.length) {
      scrollToCell(diffIndex);
    }
  }, [document, history, historyIndex, findFirstDifference, scrollToCell]);

  // Redo - go forward in history
  const handleRedo = useCallback(() => {
    if (!document || futureStates.length === 0) return;

    const currentCells = [...document.cells];

    // Get the next future state
    const [nextState, ...remainingFutures] = futureStates;

    // Find first difference and scroll to it
    const diffIndex = findFirstDifference(currentCells, nextState.cells);

    // Restore paragraphs
    setDocument((prev) => prev ? { ...prev, cells: nextState.cells } : null);
    setFutureStates(remainingFutures);

    // Update history index
    if (remainingFutures.length === 0) {
      setHistoryIndex(null); // Back to current state
    } else if (historyIndex !== null && historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }

    setSelectedCells(new Set());
    setLastSelectedIndex(null);

    if (diffIndex >= 0 && diffIndex < nextState.cells.length) {
      scrollToCell(diffIndex);
    }
  }, [document, futureStates, historyIndex, findFirstDifference, scrollToCell]);

  // Check if undo/redo are available
  const canUndo = history && history.snapshots.length > 0 && (historyIndex === null || historyIndex < history.snapshots.length - 1);
  const canRedo = futureStates.length > 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when in input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        editingCellIndex !== null;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Escape - Exit edit mode and clear selection
      if (e.key === 'Escape') {
        if (editingCellIndex !== null) {
          setEditingCellIndex(null);
          e.preventDefault();
        } else if (selectedCells.size > 0) {
          setSelectedCells(new Set());
          setLastSelectedIndex(null);
          e.preventDefault();
        }
        return;
      }

      // Allow these shortcuts even when not editing
      // Ctrl/Cmd + Z - Undo
      if (cmdOrCtrl && !e.shiftKey && e.key === 'z') {
        if (history && history.snapshots.length > 0) {
          e.preventDefault();
          handleUndo();
        }
        return;
      }

      // Ctrl/Cmd + Shift + Z - Redo
      if (cmdOrCtrl && e.shiftKey && e.key === 'z') {
        if (futureStates.length > 0) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      // Don't handle other shortcuts when editing text
      if (isEditing) return;

      // Delete/Backspace - Delete selected cells
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCells.size > 0 && document) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Enter - Edit selected cell (first one if multiple selected)
      if (e.key === 'Enter' && selectedCells.size > 0 && document) {
        e.preventDefault();
        const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);
        const firstSelected = selectedIndices[0];
        if (firstSelected !== undefined && firstSelected < document.cells.length) {
          setEditingCellIndex(firstSelected);
          setEditingCellContent(document.cells[firstSelected].content);
        }
        return;
      }

      // Ctrl/Cmd + A - Select all cells
      if (cmdOrCtrl && e.key === 'a' && document && document.cells.length > 0) {
        e.preventDefault();
        const allIndices = new Set(document.cells.map((_, i) => i));
        setSelectedCells(allIndices);
        setLastSelectedIndex(document.cells.length - 1);
        return;
      }

      // Cmd/Ctrl + C - Copy selected cells
      if (cmdOrCtrl && e.key === 'c' && selectedCells.size > 0 && document) {
        e.preventDefault();
        handleCopySelected();
        return;
      }

      // Cmd/Ctrl + X - Cut selected cells (copy + delete)
      if (cmdOrCtrl && e.key === 'x' && selectedCells.size > 0 && document) {
        e.preventDefault();
        handleCopySelected();
        handleDeleteSelected();
        return;
      }

      // Cmd/Ctrl + V - Paste cells from clipboard
      if (cmdOrCtrl && e.key === 'v' && document) {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (!text.trim()) return;

          // Split pasted text into cells by double newlines
          const newCellContents = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
          if (newCellContents.length === 0) return;

          // Find insertion point (after last selected cell, or at end)
          const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);
          const insertAfter = selectedIndices.length > 0
            ? selectedIndices[selectedIndices.length - 1]
            : document.cells.length - 1;

          setDocument(prev => {
            if (!prev) return null;
            const newCells = [...prev.cells];
            const insertPosition = insertAfter + 1;

            const cellsToInsert: Cell[] = newCellContents.map((content, i) => ({
              id: `cell-${Date.now()}-${i}`,
              index: 0,
              content,
              type: 'cell' as const,
            }));

            newCells.splice(insertPosition, 0, ...cellsToInsert);
            newCells.forEach((c, i) => { c.index = i; });

            return { ...prev, cells: newCells };
          });

          // Select the newly pasted cells
          const newSelection = new Set<number>();
          for (let i = 0; i < newCellContents.length; i++) {
            newSelection.add(insertAfter + 1 + i);
          }
          setSelectedCells(newSelection);
          setLastSelectedIndex(insertAfter + newCellContents.length);
        });
        return;
      }

      // Arrow keys for navigation
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document && document.cells.length > 0) {
        e.preventDefault();
        const direction = e.key === 'ArrowUp' ? -1 : 1;

        if (e.shiftKey && lastSelectedIndex !== null) {
          // Shift + Arrow - Extend selection
          const newIndex = Math.max(0, Math.min(document.cells.length - 1, lastSelectedIndex + direction));
          setSelectedCells(prev => {
            const newSelection = new Set(prev);
            newSelection.add(newIndex);
            return newSelection;
          });
          setLastSelectedIndex(newIndex);

          // Scroll into view
          setTimeout(() => {
            const element = window.document.querySelector(`[data-para-index="${newIndex}"]`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 10);
        } else if (selectedCells.size > 0) {
          // Arrow - Move selection
          const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);
          const currentIndex = direction === -1 ? selectedIndices[0] : selectedIndices[selectedIndices.length - 1];
          const newIndex = Math.max(0, Math.min(document.cells.length - 1, currentIndex + direction));
          setSelectedCells(new Set([newIndex]));
          setLastSelectedIndex(newIndex);

          // Scroll into view
          setTimeout(() => {
            const element = window.document.querySelector(`[data-para-index="${newIndex}"]`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 10);
        } else {
          // No selection - start from top or bottom
          const newIndex = direction === -1 ? document.cells.length - 1 : 0;
          setSelectedCells(new Set([newIndex]));
          setLastSelectedIndex(newIndex);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    document,
    selectedCells,
    lastSelectedIndex,
    editingCellIndex,
    history,
    futureStates,
    handleUndo,
    handleRedo,
    handleDeleteSelected,
    handleCopySelected,
  ]);

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
            existingCells: document.cells.map(p => p.content),
            structure: document.structure,
          } : null,
          insertAfterIndex: insertAtIndex,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate content');

      const data = await res.json();

      // Parse generated content into paragraphs
      const generatedCells = data.content
        .split(/\n\s*\n/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      if (!document) {
        // Create new document with generated content
        const newDoc: Document = {
          id: `doc-${Date.now()}`,
          title: data.suggestedTitle || 'Generated Document',
          cells: generatedCells.map((content: string, index: number) => ({
            id: `para-${Date.now()}-${index}`,
            index,
            content,
          })),
        };
        setDocument(newDoc);

        // Analyze structure in background
        const structure = await analyzeDocument(generatedCells);
        if (structure) {
          setDocument((prev) => prev ? { ...prev, structure, title: structure.title || prev.title } : null);
        }
      } else {
        // Insert into existing document
        setDocument((prev) => {
          if (!prev) return null;

          const newCells = [...prev.cells];
          const insertPosition = insertAtIndex === null
            ? newCells.length
            : insertAtIndex + 1;

          // Insert generated paragraphs
          const cellsToInsert = generatedCells.map((content: string, i: number) => ({
            id: `para-${Date.now()}-${i}`,
            index: 0,
            content,
          }));

          newCells.splice(insertPosition, 0, ...cellsToInsert);

          // Recalculate indices
          newCells.forEach((p, i) => {
            p.index = i;
          });

          return { ...prev, cells: newCells };
        });
      }

      setGeneratePrompt('');
      setShowAIGenerate(false);
      setInsertAtIndex(null);
    } catch (err) {
      console.error('Generation error:', err);
      showToast('Failed to generate content', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [generatePrompt, isGenerating, activeProfile, document, insertAtIndex, selectedModel, analyzeDocument]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Logo with navigation dropdown */}
          <div className="flex items-center gap-4">
            <div className="relative" ref={navMenuRef}>
              <button
                onClick={() => setShowNavMenu(!showNavMenu)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <img src="/logo.png" alt="Styler" className="h-8 w-8" />
                <span className="text-xl font-semibold">Styler</span>
                <svg
                  className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${showNavMenu ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showNavMenu && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
                  <Link
                    href="/"
                    onClick={() => setShowNavMenu(false)}
                    className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    Home
                  </Link>
                  <div className="px-4 py-2 text-sm bg-[var(--primary)] text-[var(--primary-foreground)]">
                    Editor
                  </div>
                  <Link
                    href="/guide"
                    onClick={() => setShowNavMenu(false)}
                    className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    Guide
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowNavMenu(false)}
                    className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    Settings
                  </Link>
                  <Link
                    href="/about"
                    onClick={() => setShowNavMenu(false)}
                    className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    About
                  </Link>
                </div>
              )}
            </div>

            {isAnalyzing && (
              <span className="text-sm text-[var(--muted-foreground)]">
                Analyzing...
              </span>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {/* Style: Profile selector with icon */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <span title="Style Profile">🎨</span>
              <select
                value={activeProfile || ''}
                onChange={(e) => setActiveProfile(e.target.value || null)}
                className="text-sm bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="">Base Style</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View: Diff mode with icon */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <span title="Diff View">👁️</span>
              <select
                value={diffMode}
                onChange={(e) => setDiffMode(e.target.value as 'inline' | 'side-by-side')}
                className="text-sm bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="inline">Inline</option>
                <option value="side-by-side">Side by Side</option>
              </select>
            </div>

            {/* Syntax: Editor mode with icon */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <span title="Syntax Mode">📝</span>
              <select
                value={editorMode}
                onChange={(e) => setEditorMode(e.target.value as HighlightMode)}
                className="text-sm bg-transparent border-none outline-none cursor-pointer"
              >
                <option value="plain">Plain</option>
                <option value="markdown">Markdown</option>
                <option value="latex">LaTeX</option>
              </select>
            </div>

            {document && (
              <>
                {/* Search */}
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">🔍</span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-28 pl-7 pr-6 py-1 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
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
                    <span className="text-xs text-red-500">None</span>
                  )}
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-[var(--border)]" />

                {/* Undo/Redo */}
                <div className="flex border border-[var(--border)] rounded-lg overflow-hidden">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="px-2 py-1 text-sm hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed border-r border-[var(--border)]"
                    title="Undo"
                  >
                    ↩
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="px-2 py-1 text-sm hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo"
                  >
                    ↪
                  </button>
                </div>

                {/* Edit Panel Toggle */}
                <button
                  onClick={() => {
                    const newState = !showFeedbackPanel;
                    setShowFeedbackPanel(newState);
                    // Default to Vibe Edit when opening via button (unless cells are selected)
                    if (newState && selectedCells.size === 0) {
                      setEditMode('vibe');
                    } else if (newState && selectedCells.size > 0) {
                      setEditMode('styler');
                    }
                  }}
                  className={`p-2 rounded-lg border ${
                    showFeedbackPanel
                      ? 'border-purple-500 bg-purple-50 text-purple-600'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                  title="Edit Panel (Vibe/Styler)"
                >
                  ✨
                </button>

                {/* Chat Assistant */}
                <button
                  onClick={() => setShowChatPanel(!showChatPanel)}
                  className={`p-2 rounded-lg border ${
                    showChatPanel
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                  title="Chat Assistant"
                >
                  💬
                </button>

                {/* Doc Profile */}
                <button
                  onClick={() => setShowDocProfile(!showDocProfile)}
                  className={`p-2 rounded-lg border ${
                    showDocProfile
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                  title="Document Profile"
                >
                  📋
                </button>

                {/* History */}
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`p-2 rounded-lg border ${
                    showHistory
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                  title={`History${history && history.snapshots.length > 0 ? ` (${history.snapshots.length})` : ''}`}
                >
                  📜
                </button>

                {/* Export dropdown */}
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={isExporting}
                    className="p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] disabled:opacity-50 flex items-center gap-1"
                    title="Export"
                  >
                    💾
                    <svg
                      className={`w-3 h-3 text-[var(--muted-foreground)] transition-transform ${showExportMenu ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showExportMenu && (
                    <div className="absolute top-full right-0 mt-1 w-40 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={handleExportTxt}
                        disabled={isExporting}
                        className="w-full px-4 py-2 text-sm text-left text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 flex items-center gap-2"
                      >
                        📄 Text (.txt)
                      </button>
                      <button
                        onClick={handleExportWord}
                        disabled={isExporting}
                        className="w-full px-4 py-2 text-sm text-left text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 flex items-center gap-2"
                      >
                        📘 Word (.docx)
                      </button>
                      <button
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="w-full px-4 py-2 text-sm text-left text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 flex items-center gap-2"
                      >
                        📕 PDF (.pdf)
                      </button>
                    </div>
                  )}
                </div>

              </>
            )}

            {/* Settings icon - always visible */}
            <Link
              href="/settings"
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              title="Settings"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <ApiKeyWarning className="mx-4 mt-2" />

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
                  {savedDocuments.filter(doc => doc.id).map((doc, idx, arr) => (
                    <div key={doc.id || `doc-${idx}`} onClick={() => handleLoadDocument(doc.id)} className={`p-3 cursor-pointer hover:bg-[var(--muted)] transition-colors group ${document?.id === doc.id ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {doc.cellCount} cells
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {formatTimestamp(doc.updatedAt)}
                          </p>
                        </div>
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleReorderDocument(doc.id, 'up', e)}
                            disabled={idx === 0}
                            className={`p-0.5 text-xs rounded ${idx === 0 ? 'text-[var(--muted-foreground)]/30 cursor-not-allowed' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'}`}
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={(e) => handleReorderDocument(doc.id, 'down', e)}
                            disabled={idx === arr.length - 1}
                            className={`p-0.5 text-xs rounded ${idx === arr.length - 1 ? 'text-[var(--muted-foreground)]/30 cursor-not-allowed' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'}`}
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSavedDocument(doc.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-xs text-red-600 hover:bg-red-50 rounded transition-opacity ml-1"
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
        <main
          className="flex-1 overflow-y-auto p-6 relative"
          onClick={(e) => {
            // Clear selection when clicking on background (not on a cell)
            const target = e.target as HTMLElement;
            const clickedOnCell = target.closest('[data-para-index]');
            const clickedOnButton = target.closest('button');
            const clickedOnInput = target.closest('input, textarea');
            if (!clickedOnCell && !clickedOnButton && !clickedOnInput && selectedCells.size > 0) {
              setSelectedCells(new Set());
              setLastSelectedIndex(null);
            }
          }}
        >
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
                  value={quickPasteContent}
                  onChange={(e) => setQuickPasteContent(e.target.value)}
                  placeholder="Paste your document here..."
                  className="w-full h-48 p-4 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none"
                />
                {quickPasteContent.trim() && (
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {(() => {
                        const mode = detectSyntaxMode(quickPasteContent);
                        const cells = smartSplit(quickPasteContent, { syntaxMode: mode as SyntaxMode });
                        return `${cells.length} cell(s) detected (${mode} mode)`;
                      })()}
                    </p>
                    <button
                      onClick={() => {
                        handleTextUpload(quickPasteContent);
                        setQuickPasteContent('');
                      }}
                      className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90"
                    >
                      Import Document
                    </button>
                  </div>
                )}
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
                      {document.structure.documentType} • {document.cells.length} cells • {document.structure.sections.length} sections
                    </p>
                  )}
                </div>
              </div>

              {/* Insert button at the start */}
              {document.cells.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="text-[var(--muted-foreground)]">No content yet.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInsertCell(null)}
                      className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
                    >
                      + Add Cell
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
                <div className="flex justify-center py-2 group">
                  <button
                    onClick={() => handleInsertCell(null)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title="Insert cell at the beginning"
                  >
                    + Cell
                  </button>
                </div>
              )}

              <div data-cell-container>
              {document.cells.map((para, index) => {
                const isSearchMatch = searchResults.includes(index);
                const isCurrentSearchMatch = searchResults[currentSearchIndex] === index;

                return (
                  <div key={para.id} id={`cell-${index}`}>
                    <div
                      data-para-index={index}
                      className={`relative group ${
                        selectedCells.has(index)
                          ? 'ring-2 ring-[var(--primary)] rounded-lg'
                          : ''
                      } ${
                        reviewHighlightedCells.has(index)
                          ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20 rounded-lg'
                          : ''
                      } ${
                        isCurrentSearchMatch
                          ? 'bg-yellow-200 dark:bg-yellow-900/50 rounded-lg'
                          : isSearchMatch
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 rounded-lg'
                          : ''
                      }`}
                    >
                      {/* Paragraph number on left */}
                      <div className="absolute -left-10 top-2 flex items-center">
                        <span className="text-xs text-[var(--muted-foreground)] w-6 text-right">
                          {index + 1}
                        </span>
                      </div>

                      {/* Cell toolbar on top right - move up/down and delete */}
                      <div className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[var(--background)] border border-[var(--border)] rounded-md shadow-sm px-1 py-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCell(index, 'up');
                          }}
                          disabled={index === 0}
                          className="p-1 hover:bg-[var(--muted)] rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCell(index, 'down');
                          }}
                          disabled={index === document.cells.length - 1}
                          className="p-1 hover:bg-[var(--muted)] rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBlock(index);
                          }}
                          className="p-1 hover:bg-[var(--muted)] rounded"
                          title="Delete cell"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {/* Show diff if edited, batch edit status, direct edit mode, or normal content */}
                      {para.edited ? (
                        <div className="space-y-2">
                          {/* Show edit insights with score progression and agent timeline */}
                          <div className="px-3 py-1.5 space-y-2">
                            {/* Refining indicator */}
                            {isRefining && refiningCellIndex === index && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg animate-pulse">🎯</span>
                                    <span className="text-lg animate-pulse delay-100">📝</span>
                                    <span className="text-lg animate-pulse delay-200">🤖</span>
                                    <span className="text-lg animate-pulse delay-300">⚖️</span>
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Refining edit...</div>
                                    <div className="text-xs text-blue-600 dark:text-blue-400">Agents are processing your feedback</div>
                                  </div>
                                  <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                </div>
                              </div>
                            )}

                            {/* Edit Insights: Score progression + Agent timeline */}
                            {para.convergenceHistory && para.convergenceHistory.length > 0 && para.agentTrace && para.agentTrace.length > 0 && (
                              <EditInsights
                                convergenceHistory={para.convergenceHistory}
                                agentTrace={para.agentTrace}
                                iterations={para.iterations || 1}
                                critique={para.critique}
                              />
                            )}

                            {/* Fallback: Show critique badge if no agent trace (shouldn't happen normally) */}
                            {para.critique && (!para.agentTrace || para.agentTrace.length === 0) && (
                              <CritiqueBadge critique={para.critique} />
                            )}

                            {/* Additional badges */}
                            <div className="flex items-center gap-2 flex-wrap">
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
                                  Multi-cell edit
                                </span>
                              )}
                            </div>
                          </div>
                          {diffMode === 'inline' ? (
                            <DiffView
                              original={para.originalBatchContent || para.content}
                              edited={para.edited}
                              onAccept={(finalText) => handleAcceptEdit(index, finalText)}
                              onReject={(feedback) => handleRejectEdit(index, feedback)}
                              onFeedback={handleFeedback}
                              onRefine={(ctx) => handleRefineEdit(index, ctx)}
                              isRefining={isRefining && refiningCellIndex === index}
                            />
                          ) : (
                            <SideBySideDiff
                              original={para.originalBatchContent || para.content}
                              edited={para.edited}
                              onAccept={(finalText) => handleAcceptEdit(index, finalText)}
                              onReject={(feedback) => handleRejectEdit(index, feedback)}
                              onFeedback={handleFeedback}
                              onRefine={(ctx) => handleRefineEdit(index, ctx)}
                              isRefining={isRefining && refiningCellIndex === index}
                            />
                          )}
                        </div>
                      ) : para.batchEditStatus === 'removed' ? (
                        /* Cell marked for removal - red with strikethrough */
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-2 border-red-300 dark:border-red-800">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-red-200 text-red-800 text-xs rounded font-medium">
                              Will be removed
                            </span>
                          </div>
                          <div className="line-through text-red-700 dark:text-red-300 opacity-70">
                            <SyntaxHighlighter content={para.content} mode={editorMode} />
                          </div>
                        </div>
                      ) : para.batchEditStatus === 'modified' && para.batchEditContent && !para.edited ? (
                        /* Cell with modifications (not the main diff cell) */
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-2 border-yellow-300 dark:border-yellow-800">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs rounded font-medium">
                              Modified
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs text-[var(--muted-foreground)] font-medium">Original:</div>
                            <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded text-sm line-through opacity-70">
                              {para.content.slice(0, 200)}{para.content.length > 200 ? '...' : ''}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)] font-medium">New:</div>
                            <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded text-sm">
                              {para.batchEditContent.slice(0, 200)}{para.batchEditContent.length > 200 ? '...' : ''}
                            </div>
                          </div>
                        </div>
                      ) : para.batchEditStatus === 'unchanged' ? (
                        /* Cell unchanged in batch edit */
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 opacity-60">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                              Unchanged
                            </span>
                          </div>
                          <div className="leading-relaxed">
                            <SyntaxHighlighter content={para.content} mode={editorMode} />
                          </div>
                        </div>
                      ) : editingCellIndex === index ? (
                        <div className="p-2">
                          {editorMode === 'plain' ? (
                            <textarea
                              value={editingCellContent}
                              onChange={(e) => {
                                setEditingCellContent(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') handleCancelDirectEdit();
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDirectEdit();
                              }}
                              ref={(el) => {
                                if (el) {
                                  el.style.height = 'auto';
                                  el.style.height = Math.max(el.scrollHeight, 150) + 'px';
                                  el.focus();
                                  if (editingCellContent === 'New cell...' || editingCellContent === 'New Section') {
                                    el.select();
                                  }
                                }
                              }}
                              className="w-full p-4 border-2 border-[var(--primary)] rounded-lg bg-[var(--background)] resize-none text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            />
                          ) : (
                            <div
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') handleCancelDirectEdit();
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleSaveDirectEdit();
                                }
                              }}
                            >
                              <CodeMirrorEditor
                                value={editingCellContent}
                                onChange={setEditingCellContent}
                                mode={editorMode}
                                darkMode={darkMode === 'dark' || (darkMode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
                                minHeight="150px"
                                className="border-2 border-[var(--primary)]"
                              />
                            </div>
                          )}
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
                          data-cell-index={index}
                          onClick={(e) => handleCellClick(index, e)}
                          onDoubleClick={() => {
                            setEditingCellIndex(index);
                            setEditingCellContent(para.content);
                            clearSelection();
                          }}
                          className={`rounded-lg cursor-pointer transition-colors ${
                            para.type === 'heading' ? 'py-2 px-4' : 'p-4'
                          } ${
                            selectedCells.has(index)
                              ? 'bg-[var(--primary)]/5'
                              : 'hover:bg-[var(--muted)]'
                          }`}
                          title="Click to select, Shift+click for range, Cmd/Ctrl+click to add. Double-click to edit directly."
                        >
                          {/* Render with inline diff if there's a pending selection edit for this cell */}
                          {selectionEditResult && selectionEditResult.cellIndex === index ? (
                            <div className={`leading-relaxed ${para.type === 'heading' ? 'text-lg font-semibold' : ''}`}>
                              <span>{para.content.slice(0, selectionEditResult.startOffset)}</span>
                              <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 line-through">{selectionEditResult.originalText}</span>
                              <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">{selectionEditResult.editedText}</span>
                              <span>{para.content.slice(selectionEditResult.endOffset)}</span>
                            </div>
                          ) : para.type === 'heading' ? (
                            <h3 className="text-lg font-semibold text-[var(--foreground)]">
                              <SyntaxHighlighter content={para.content} mode={editorMode} />
                            </h3>
                          ) : (
                            <div className="leading-relaxed">
                              <SyntaxHighlighter content={para.content} mode={editorMode} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Show new cells that will be added in this batch */}
                    {para.batchNewCells && para.batchNewCells.length > 0 && (
                      <div className="space-y-2 my-2">
                        {para.batchNewCells.map((newCell, newIdx) => (
                          <div
                            key={`new-${index}-${newIdx}`}
                            className={`p-4 rounded-lg border-2 ${
                              newCell.type === 'heading'
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                newCell.type === 'heading'
                                  ? 'bg-blue-200 text-blue-800'
                                  : 'bg-green-200 text-green-800'
                              }`}>
                                + {newCell.type === 'heading' ? 'New heading' : 'New cell'}
                              </span>
                            </div>
                            <div className={`leading-relaxed ${
                              newCell.type === 'heading'
                                ? 'text-blue-800 dark:text-blue-200 font-semibold text-lg'
                                : 'text-green-800 dark:text-green-200'
                            }`}>
                              <SyntaxHighlighter content={newCell.content} mode={editorMode} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Insert button after each cell */}
                    <div className="flex justify-center py-1 group">
                      <button
                        onClick={() => handleInsertCell(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 text-xs border border-dashed border-[var(--border)] rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        title={`Insert cell after item ${index + 1}`}
                      >
                        + Cell
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>

              {/* AI Generate button at bottom */}
              {document.cells.length > 0 && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={() => {
                      setInsertAtIndex(document.cells.length - 1);
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
              const text1 = v1.cells.map(p => p.content).join('\n\n');
              const text2 = v2.cells.map(p => p.content).join('\n\n');
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
                      <span className="text-[var(--muted-foreground)]">{v1.cells.length} cells</span>
                    </div>
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                      <strong>Newer:</strong> {v2.changeDescription}
                      <br />
                      <span className="text-[var(--muted-foreground)]">{v2.cells.length} cells</span>
                    </div>
                    <div className="p-2 bg-[var(--background)] rounded border border-[var(--border)]">
                      <strong>Diff:</strong>
                      <br />
                      {text1 === text2 ? (
                        <span className="text-[var(--muted-foreground)]">No differences</span>
                      ) : (
                        <span>
                          {Math.abs(v2.cells.length - v1.cells.length) > 0 && (
                            <span className="block">Paragraphs: {v1.cells.length} → {v2.cells.length}</span>
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
                              {snapshot.cells.length} cells
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

        {/* Unified Edit Panel with Tabs */}
        {document && showFeedbackPanel && (
          <aside className="w-96 border-l border-[var(--border)] bg-[var(--background)] flex flex-col overflow-hidden">
            {/* Header with Tabs */}
            <div className="border-b border-[var(--border)]">
              <div className="flex items-center justify-between p-3 pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <h3 className="font-semibold">Edit</h3>
                </div>
                <button
                  onClick={() => setShowFeedbackPanel(false)}
                  className="text-xl leading-none hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
                >
                  ×
                </button>
              </div>
              {/* Tab Buttons */}
              <div className="flex px-3 mt-2">
                <button
                  onClick={() => setEditMode('styler')}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    editMode === 'styler'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  🎨 Styler
                </button>
                <button
                  onClick={() => setEditMode('structure')}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    editMode === 'structure'
                      ? 'border-teal-500 text-teal-600'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  🏗️ Structure
                </button>
                <button
                  onClick={() => {
                    setEditMode('vibe');
                    // Don't clear selection - user might want to switch back
                  }}
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                    editMode === 'vibe'
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  ✨ Vibe
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {editMode === 'vibe' ? (
                /* Vibe Edit Content */
                <FeedbackPanel
                  cells={document.cells.map(p => p.content)}
                  selectedIndices={Array.from(selectedCells)}
                  activeProfileName={profiles.find(p => p.id === activeProfile)?.name}
                  isLoading={isLoading}
                  documentStructure={document.structure}
                  savedState={feedbackStates[document.id]}
                  onStateChange={handleFeedbackStateChange}
                  onClose={() => setShowFeedbackPanel(false)}
                  onRequestEdit={(cellIndices, instruction) => {
                    setReviewHighlightedCells(new Set(cellIndices));
                    handleRequestEditDirect(cellIndices, instruction);
                    setTimeout(() => {
                      const firstIndex = Math.min(...cellIndices);
                      const element = window.document.getElementById(`cell-${firstIndex}`);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }, 100);
                  }}
                  hideHeader={true}
                  onStop={handleStopEdit}
                />
              ) : editMode === 'structure' ? (
                /* Structure Edit Content */
                <StructurePanel
                  cells={document.cells.map(c => ({ index: c.index, content: c.content, type: c.type }))}
                  selectedIndices={Array.from(selectedCells)}
                  documentTitle={document.title}
                  documentGoals={undefined} // TODO: Pass document goals when available
                  model={selectedModel || undefined}
                  isLoading={isLoading}
                  savedState={structureStates[document.id]}
                  onStateChange={handleStructureStateChange}
                  onClose={() => setShowFeedbackPanel(false)}
                  onApplyProposals={handleApplyStructureProposals}
                  hideHeader={true}
                  onStop={handleStopEdit}
                />
              ) : (
                /* Styler Edit Content */
                <div className="p-4 space-y-4">
                  {selectedCells.size === 0 ? (
                    <div className="text-center py-8 text-[var(--muted-foreground)]">
                      <p className="text-sm">Click on a cell to select it for editing.</p>
                      <p className="text-xs mt-2">Use Shift+click for ranges or Cmd/Ctrl+click for multiple.</p>
                    </div>
                  ) : (() => {
                    const selectedIndices = Array.from(selectedCells).sort((a, b) => a - b);
                    const isMultiple = selectedIndices.length > 1;
                    const STYLER_TEMPLATES_SINGLE = ['Make concise', 'Fix grammar', 'Improve clarity', 'Add hedging', 'More formal', 'Simplify'];
                    const STYLER_TEMPLATES_MULTI = ['Make concise', 'Improve clarity', 'Improve logical flow', 'Strengthen transitions', 'Restructure', 'Reduce redundancy'];
                    const templates = isMultiple ? STYLER_TEMPLATES_MULTI : STYLER_TEMPLATES_SINGLE;

                    // Build instruction from selected templates + custom instruction
                    const buildStylerInstruction = () => {
                      const parts = [...selectedStylerTemplates];
                      if (editInstruction.trim()) {
                        parts.push(editInstruction.trim());
                      }
                      // Default instruction when nothing selected - apply style preferences
                      if (parts.length === 0) {
                        return 'Improve this text according to my style preferences';
                      }
                      return parts.join('. ');
                    };

                    const handleStylerEdit = () => {
                      const instruction = buildStylerInstruction();
                      setEditInstruction(instruction);
                      handleRequestEdit();
                    };

                    return (
                      <>
                        <div className="text-sm text-[var(--muted-foreground)]">
                          {isMultiple
                            ? `${selectedIndices.length} cells selected`
                            : `Cell ${selectedIndices[0] + 1} selected`}
                        </div>

                        {isMultiple && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                            <p className="font-medium text-blue-700 dark:text-blue-300">Multi-cell edit</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                              Cells {selectedIndices.map(i => i + 1).join(', ')} selected.
                            </p>
                          </div>
                        )}

                        {/* Quick Templates - Multi-select */}
                        <div>
                          <label className="block text-xs font-medium mb-2">
                            Quick Styles <span className="font-normal text-[var(--muted-foreground)]">(select multiple)</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {templates.map((template) => {
                              const isSelected = selectedStylerTemplates.includes(template);
                              return (
                                <button
                                  key={template}
                                  onClick={() => {
                                    setSelectedStylerTemplates(prev =>
                                      prev.includes(template)
                                        ? prev.filter(t => t !== template)
                                        : [...prev, template]
                                    );
                                  }}
                                  disabled={isLoading}
                                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors disabled:opacity-50 ${
                                    isSelected
                                      ? 'border-blue-500 bg-blue-100 text-blue-700'
                                      : 'border-[var(--border)] hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                                  }`}
                                >
                                  {isSelected && <span className="mr-1">✓</span>}
                                  {template}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Custom Instruction */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium">Custom Instruction</label>
                            {editInstruction && (
                              <button
                                onClick={() => setEditInstruction('')}
                                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                                title="Clear instruction"
                              >
                                <span>×</span> Clear
                              </button>
                            )}
                          </div>
                          <textarea
                            value={editInstruction}
                            onChange={(e) => setEditInstruction(e.target.value)}
                            placeholder={isMultiple
                              ? "e.g., Improve transitions, merge these ideas..."
                              : "e.g., Make it more concise, fix grammar..."
                            }
                            className="w-full h-20 p-3 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none text-sm"
                          />
                        </div>

                        {/* Main Action Button + Stop Button */}
                        <div className="flex gap-2">
                          <button
                            onClick={handleStylerEdit}
                            disabled={isLoading}
                            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex flex-col items-center justify-center gap-1"
                          >
                            {isLoading ? (
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Styling...
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  🎨 {isMultiple ? 'Improve Flow' : 'Style It'}
                                  <span className="text-blue-200 text-sm">({selectedIndices.length} {selectedIndices.length === 1 ? 'cell' : 'cells'})</span>
                                </div>
                                {(selectedStylerTemplates.length > 0 || editInstruction.trim()) ? (
                                  <span className="text-blue-200 text-xs">
                                    {selectedStylerTemplates.length > 0 && selectedStylerTemplates.join(' + ')}
                                    {selectedStylerTemplates.length > 0 && editInstruction.trim() && ' + '}
                                    {editInstruction.trim() && 'custom'}
                                  </span>
                                ) : (
                                  <span className="text-blue-200 text-xs">Apply style preferences</span>
                                )}
                              </>
                            )}
                          </button>
                          {isLoading && (
                            <button
                              onClick={handleStopEdit}
                              className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                              title="Stop"
                            >
                              ◼
                            </button>
                          )}
                        </div>

                        {/* Agent Pipeline Visualization during loading */}
                        {isLoading && (
                          <AgentVisualization isActive={isLoading} />
                        )}
                        {/* Cell Actions */}
                        {(() => {
                          // Check if selected cell can be split (has newlines)
                          const canSplit = !isMultiple &&
                            document.cells[selectedIndices[0]]?.content?.includes('\n');
                          const canMerge = isMultiple;

                          return (
                            <div className="border-t border-[var(--border)] pt-4">
                              <p className="text-xs text-[var(--muted-foreground)] mb-2">Cell Actions:</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSplitCell(selectedIndices[0], 'newlines')}
                                  disabled={!canSplit}
                                  className="flex-1 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                  title={canSplit ? 'Split cell by line breaks' : 'Cell has no line breaks to split'}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                  </svg>
                                  Split
                                </button>
                                <button
                                  onClick={handleMergeCells}
                                  disabled={!canMerge}
                                  className="flex-1 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                  title={canMerge ? 'Merge selected cells into one' : 'Select multiple cells to merge'}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                  </svg>
                                  Merge
                                </button>
                                <button
                                  onClick={handleCleanup}
                                  disabled={isCleaningUp}
                                  className="flex-1 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] disabled:opacity-50 flex items-center justify-center gap-1.5"
                                  title="Prettify: merge fragments, remove artifacts, clean up PDF imports"
                                >
                                  {isCleaningUp ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                    </svg>
                                  )}
                                  {isCleaningUp ? 'Prettifying...' : 'Prettify'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Delete */}
                        <button
                          onClick={() => isMultiple ? handleDeleteSelected() : handleDeleteBlock(selectedIndices[0])}
                          className="w-full py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {isMultiple ? `Delete ${selectedIndices.length} Cells` : 'Delete Cell'}
                        </button>

                        <button
                          onClick={clearSelection}
                          className="w-full py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
                        >
                          Clear Selection
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Document Profile Panel - appears to the right of Edit Panel */}
        {document && showDocProfile && (
          <aside className="w-80 border-l border-[var(--border)] bg-[var(--background)] flex flex-col overflow-hidden">
            <DocumentProfilePanel
              documentId={document.id}
              documentContent={document.cells.map(c => c.content).join('\n\n')}
              documentTitle={document.title}
              baseProfileName={profiles.find(p => p.id === activeProfile)?.name}
              profiles={profiles}
              onClose={() => setShowDocProfile(false)}
            />
          </aside>
        )}

        {/* Chat Assistant Panel */}
        {document && showChatPanel && (
          <ChatPanel
            isOpen={showChatPanel}
            onClose={() => setShowChatPanel(false)}
            documentId={document.id}
            profile={profiles.find(p => p.id === activeProfile) || null}
            selectedCellsContent={Array.from(selectedCells).sort((a, b) => a - b).map(i => document.cells[i]?.content || '').filter(Boolean)}
            selectedCellIndices={Array.from(selectedCells).sort((a, b) => a - b)}
            documentTitle={document.title}
          />
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
                {!document || document.cells.length === 0 ? (
                  <p>Creating a new document from scratch.</p>
                ) : insertAtIndex === null ? (
                  <p>Content will be added at the end of the document.</p>
                ) : (
                  <p>Content will be inserted after cell {insertAtIndex + 1}.</p>
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
                    'Create a transition',
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

      {/* New Document Modal */}
      {showNewDocModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">New Document</h2>
              <button
                onClick={() => setShowNewDocModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Document Title */}
              <div>
                <label className="block text-sm font-medium mb-2">Document Title</label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="Untitled Document"
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-sm"
                />
              </div>

              {/* Start Mode Selection */}
              <div>
                <label className="block text-sm font-medium mb-3">How would you like to start?</label>
                <div className="space-y-2">
                  {/* Blank Document */}
                  <button
                    onClick={() => setNewDocMode('blank')}
                    className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                      newDocMode === 'blank'
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📝</span>
                      <div>
                        <p className="font-medium">Blank Document</p>
                        <p className="text-sm text-[var(--muted-foreground)]">Start fresh with an empty document</p>
                      </div>
                    </div>
                  </button>

                  {/* Paste Content */}
                  <button
                    onClick={() => setNewDocMode('paste')}
                    className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                      newDocMode === 'paste'
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📋</span>
                      <div>
                        <p className="font-medium">Paste Existing Text</p>
                        <p className="text-sm text-[var(--muted-foreground)]">Import text you've already written</p>
                      </div>
                    </div>
                  </button>

                  {/* AI Generate */}
                  <button
                    onClick={() => setNewDocMode('generate')}
                    className={`w-full p-4 text-left rounded-lg border-2 transition-colors ${
                      newDocMode === 'generate'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-[var(--border)] hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">✨</span>
                      <div>
                        <p className="font-medium">AI Generate</p>
                        <p className="text-sm text-[var(--muted-foreground)]">Let AI help you draft content</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Paste Content Area (shown when paste mode selected) */}
              {newDocMode === 'paste' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Paste your content</label>
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder="Paste your text here. Paragraphs will be split into separate cells..."
                    className="w-full h-48 p-3 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none text-sm font-mono"
                    autoFocus
                  />
                  {pasteContent && (
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      {(() => {
                        const mode = detectSyntaxMode(pasteContent);
                        const cells = smartSplit(pasteContent, { syntaxMode: mode as SyntaxMode });
                        return `${cells.length} cell(s) detected (${mode} mode)`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              {/* AI Generate hint */}
              {newDocMode === 'generate' && (
                <div className="p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
                  <p>You'll be able to describe what you want to write, and AI will help generate a first draft aligned to your style profile.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--muted)]/30">
              <button
                onClick={() => setShowNewDocModal(false)}
                className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewDocument}
                disabled={newDocMode === 'paste' && !pasteContent.trim()}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm"
              >
                {newDocMode === 'generate' ? 'Continue to AI Generate' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selection Edit Popover - for targeted text editing */}
      {(textSelection || selectionEditResult) && document && (
        <SelectionEditPopover
          selectedText={selectionEditResult?.originalText || textSelection?.text || ''}
          selectionRect={textSelection?.rect || null}
          onSubmit={handleSelectionEdit}
          onAccept={handleSelectionEditAccept}
          onReject={handleSelectionEditReject}
          onRefine={handleSelectionEditRefine}
          onCancel={() => {
            setSelectionEditResult(null);
            clearTextSelection();
          }}
          isLoading={isSelectionEditing}
          editResult={selectionEditResult ? {
            originalText: selectionEditResult.originalText,
            editedText: selectionEditResult.editedText,
            instruction: selectionEditResult.instruction,
          } : null}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
