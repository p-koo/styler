'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentAdjustments, AudienceProfile, LearnedRule, DocumentGoals } from '@/types';

interface DocumentProfilePanelProps {
  documentId: string;
  documentContent?: string;
  documentTitle?: string;
  baseProfileName?: string;
  profiles: AudienceProfile[];
  onClose?: () => void;
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

type TabType = 'style' | 'guidance' | 'goals' | 'import';

/**
 * Global document profile panel - comprehensive document-specific preferences
 * that the orchestrator actively updates and users can edit.
 */
export default function DocumentProfilePanel({
  documentId,
  documentContent,
  documentTitle,
  baseProfileName,
  profiles,
  onClose,
}: DocumentProfilePanelProps) {
  const [adjustments, setAdjustments] = useState<DocumentAdjustments>(DEFAULT_ADJUSTMENTS);
  const [storedBaseProfileId, setStoredBaseProfileId] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);
  const [acceptanceRate, setAcceptanceRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('style');

  // Get base profile name from stored ID or passed prop
  const effectiveBaseProfileName = storedBaseProfileId
    ? profiles.find(p => p.id === storedBaseProfileId)?.name || baseProfileName
    : baseProfileName;

  // For editing
  const [newGuidance, setNewGuidance] = useState('');
  const [newRule, setNewRule] = useState('');

  // For merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>('new');
  const [newProfileName, setNewProfileName] = useState('');
  const [merging, setMerging] = useState(false);

  // For goals tab
  const [goalsEditing, setGoalsEditing] = useState(false);
  const [editedGoals, setEditedGoals] = useState<Partial<DocumentGoals>>({});
  const [originalGoals, setOriginalGoals] = useState<DocumentGoals | undefined>(undefined);
  const [analyzingGoals, setAnalyzingGoals] = useState(false);
  const [expandedGoalField, setExpandedGoalField] = useState<string | null>(null);

  // Model selection from localStorage
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Load model from localStorage on mount
  useEffect(() => {
    const storedModel = localStorage.getItem('preference-editor-model');
    if (storedModel) setSelectedModel(storedModel);
  }, []);

  // For import constraints
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    verbosityAdjust: number;
    formalityAdjust: number;
    hedgingAdjust: number;
    avoidWords: string[];
    preferWords: Record<string, string>;
    framingGuidance: string[];
    rules: string[];
    summary: string;
  } | null>(null);
  const [showImportPreview, setShowImportPreview] = useState(false);

  // Load preferences
  // Track if we're currently analyzing goals or saving (to prevent polling overwrites)
  // Using refs for synchronous access - state updates are async and cause race conditions
  const isAnalyzingRef = useRef(false);
  const isSavingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);

  const loadPreferences = useCallback(async () => {
    if (!documentId) return;
    // Skip polling while analyzing goals or saving to prevent race condition
    if (isAnalyzingRef.current) return;
    if (isSavingRef.current) return;
    // Also skip if we just saved (give server time to persist)
    if (Date.now() - lastSaveTimeRef.current < 2000) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/preferences`);
      const data = await res.json();

      if (res.ok && data.preferences) {
        setAdjustments(data.preferences.adjustments);
        setStoredBaseProfileId(data.preferences.baseProfileId);
        setEditCount(data.stats?.total || 0);
        setAcceptanceRate(data.stats?.acceptanceRate || 0);
        setLastUpdated(data.preferences.updatedAt);
      }
    } catch (err) {
      console.error('Failed to load document preferences:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadPreferences();
    // Poll for orchestrator updates
    const interval = setInterval(loadPreferences, 3000);
    return () => clearInterval(interval);
  }, [loadPreferences]);

  // Track if auto-analysis has been attempted
  const [autoAnalyzed, setAutoAnalyzed] = useState(false);

  // Save adjustments
  const saveAdjustments = async (newAdjustments: Partial<DocumentAdjustments>) => {
    setSaving(true);
    isSavingRef.current = true;
    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments: newAdjustments }),
      });
      setLastUpdated(new Date().toISOString());
      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  // Update slider
  const updateSlider = (key: 'verbosityAdjust' | 'formalityAdjust' | 'hedgingAdjust', value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
    saveAdjustments({ [key]: value });
  };

  // Add guidance
  const addGuidance = () => {
    if (!newGuidance.trim()) return;
    const guidance = newGuidance.trim();
    if (adjustments.additionalFramingGuidance.includes(guidance)) {
      setNewGuidance('');
      return;
    }
    const newList = [...adjustments.additionalFramingGuidance, guidance];
    setAdjustments(prev => ({ ...prev, additionalFramingGuidance: newList }));
    setNewGuidance('');
    saveAdjustments({ additionalFramingGuidance: newList });
  };

  // Remove guidance
  const removeGuidance = (guidance: string) => {
    const newList = adjustments.additionalFramingGuidance.filter(g => g !== guidance);
    setAdjustments(prev => ({ ...prev, additionalFramingGuidance: newList }));
    saveAdjustments({ additionalFramingGuidance: newList });
  };

  // Add rule
  const addRule = () => {
    if (!newRule.trim()) return;
    const rule: LearnedRule = {
      rule: newRule.trim(),
      confidence: 1.0,
      source: 'explicit',
      timestamp: new Date().toISOString(),
    };
    const newRules = [...adjustments.learnedRules, rule];
    setAdjustments(prev => ({ ...prev, learnedRules: newRules }));
    setNewRule('');
    saveAdjustments({ learnedRules: newRules });
  };

  // Remove rule
  const removeRule = (ruleText: string) => {
    const newRules = adjustments.learnedRules.filter(r => r.rule !== ruleText);
    setAdjustments(prev => ({ ...prev, learnedRules: newRules }));
    saveAdjustments({ learnedRules: newRules });
  };

  // Consolidate guidance and rules using LLM
  const consolidateGuidance = async () => {
    const hasGuidance = adjustments.additionalFramingGuidance.length >= 3;
    const hasRules = adjustments.learnedRules.length >= 3;

    if (!hasGuidance && !hasRules) return;

    setConsolidating(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/consolidate-guidance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidance: adjustments.additionalFramingGuidance,
          rules: adjustments.learnedRules.map(r => r.rule),
          model: selectedModel,
        }),
      });

      if (!res.ok) throw new Error('Failed to consolidate');

      const data = await res.json();

      const updates: Partial<typeof adjustments> = {};

      if (data.consolidatedGuidance && data.consolidatedGuidance.length > 0) {
        updates.additionalFramingGuidance = data.consolidatedGuidance;
      }

      if (data.consolidatedRules && data.consolidatedRules.length > 0) {
        // Convert rule strings back to LearnedRule objects
        updates.learnedRules = data.consolidatedRules.map((rule: string) => ({
          rule,
          confidence: 0.9,
          source: 'inferred' as const,
          timestamp: new Date().toISOString(),
        }));
      }

      if (Object.keys(updates).length > 0) {
        setAdjustments(prev => ({ ...prev, ...updates }));
        saveAdjustments(updates);
      }
    } catch (err) {
      alert('Failed to consolidate');
    } finally {
      setConsolidating(false);
    }
  };

  // Reset
  const handleReset = async () => {
    if (!confirm('Reset all document-specific preferences? Edit history will be preserved.')) return;
    try {
      const res = await fetch(`/api/documents/${documentId}/preferences?keepHistory=true`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setAdjustments(data.preferences.adjustments);
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  // Merge to profile
  const handleMerge = async () => {
    if (mergeTarget === 'new' && !newProfileName.trim()) {
      alert('Please enter a profile name');
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
          clearAfterMerge: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`Saved to profile: ${data.profile.name}`);
      setShowMergeModal(false);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setMerging(false);
    }
  };

  // Extract constraints from text
  const handleExtractConstraints = async (preview = false) => {
    if (!importText.trim() || importText.trim().length < 50) {
      alert('Please provide at least 50 characters of text to analyze');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract-constraints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: importText,
          merge: !preview,
          model: selectedModel,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      if (preview) {
        setImportPreview(data.extracted);
        setShowImportPreview(true);
      } else {
        // Constraints were merged
        if (data.preferences) {
          setAdjustments(data.preferences.adjustments);
          setLastUpdated(new Date().toISOString());
        }
        setImportText('');
        setImportPreview(null);
        setShowImportPreview(false);
        setActiveTab('guidance');
        alert(`Extracted and merged: ${data.extracted.summary}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to extract constraints');
    } finally {
      setImporting(false);
    }
  };

  // Apply previewed constraints
  const handleApplyPreview = async () => {
    if (!importPreview) return;
    await handleExtractConstraints(false);
  };

  // Analyze document goals
  const handleAnalyzeGoals = async () => {
    setAnalyzingGoals(true);
    isAnalyzingRef.current = true; // Prevent polling from overwriting (sync)
    try {
      const res = await fetch(`/api/documents/${documentId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          content: documentContent,
          title: documentTitle,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      if (data.goals) {
        setAdjustments(prev => ({
          ...prev,
          documentGoals: data.goals,
        }));
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      // Only show alert for manual triggers, not auto-analyze
      if (autoAnalyzed) {
        alert(err instanceof Error ? err.message : 'Failed to analyze goals');
      } else {
        console.error('Auto-analyze goals failed:', err);
      }
    } finally {
      setAnalyzingGoals(false);
      isAnalyzingRef.current = false; // Re-enable polling (sync)
      // Force reload to get saved goals from server
      loadPreferences();
    }
  };

  // Auto-generate goals when document loads if none exist
  useEffect(() => {
    // Only run once after initial load, if no goals exist AND model is loaded
    if (!loading && !autoAnalyzed && !adjustments.documentGoals?.summary && !analyzingGoals && selectedModel) {
      setAutoAnalyzed(true);
      // Trigger goal analysis automatically
      handleAnalyzeGoals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autoAnalyzed, adjustments.documentGoals?.summary, analyzingGoals, selectedModel]);

  // Save edited goals
  const handleSaveGoals = async () => {
    const updatedGoals: DocumentGoals = {
      summary: editedGoals.summary || adjustments.documentGoals?.summary || '',
      objectives: editedGoals.objectives || adjustments.documentGoals?.objectives || [],
      mainArgument: editedGoals.mainArgument || adjustments.documentGoals?.mainArgument,
      audienceNeeds: editedGoals.audienceNeeds || adjustments.documentGoals?.audienceNeeds,
      successCriteria: editedGoals.successCriteria || adjustments.documentGoals?.successCriteria,
      updatedAt: new Date().toISOString(),
      userEdited: true, // Mark as user-edited
    };

    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustments: { documentGoals: updatedGoals },
        }),
      });
      setAdjustments(prev => ({
        ...prev,
        documentGoals: updatedGoals,
      }));
      setGoalsEditing(false);
      setEditedGoals({});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      alert('Failed to save goals');
    }
  };

  // Start editing goals
  const startEditingGoals = () => {
    // Store original goals for cancel/revert
    setOriginalGoals(adjustments.documentGoals ? { ...adjustments.documentGoals } : undefined);
    setEditedGoals({
      summary: adjustments.documentGoals?.summary || '',
      objectives: adjustments.documentGoals?.objectives || [],
      mainArgument: adjustments.documentGoals?.mainArgument || '',
      audienceNeeds: adjustments.documentGoals?.audienceNeeds || '',
      successCriteria: adjustments.documentGoals?.successCriteria || '',
    });
    setExpandedGoalField('summary'); // Start with summary expanded
    setGoalsEditing(true);
  };

  // Cancel editing goals (revert to original)
  const cancelEditingGoals = () => {
    // Revert to original goals
    if (originalGoals) {
      setAdjustments(prev => ({
        ...prev,
        documentGoals: originalGoals,
      }));
    }
    setGoalsEditing(false);
    setEditedGoals({});
    setOriginalGoals(undefined);
    setExpandedGoalField(null);
  };

  // Clear all goals
  const handleClearGoals = async () => {
    if (!confirm('Clear all document goals?')) return;
    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustments: { documentGoals: undefined },
        }),
      });
      setAdjustments(prev => ({
        ...prev,
        documentGoals: undefined,
      }));
      setGoalsEditing(false);
      setEditedGoals({});
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      alert('Failed to clear goals');
    }
  };

  // Toggle goals lock (prevent Intent Agent from auto-updating)
  const handleToggleLock = async () => {
    if (!adjustments.documentGoals) return;

    const newLocked = !adjustments.documentGoals.locked;
    const updatedGoals = {
      ...adjustments.documentGoals,
      locked: newLocked,
      updatedAt: new Date().toISOString(),
    };

    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustments: { documentGoals: updatedGoals },
        }),
      });
      setAdjustments(prev => ({
        ...prev,
        documentGoals: updatedGoals,
      }));
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      alert('Failed to update lock state');
    }
  };

  // Handle file upload (PDF text extraction)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, only support text files. PDF would require additional library.
    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text();
      setImportText(text);
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      alert('PDF upload coming soon. For now, please copy and paste the text content.');
    } else {
      // Try to read as text anyway
      try {
        const text = await file.text();
        setImportText(text);
      } catch {
        alert('Could not read file. Please paste the text content instead.');
      }
    }
    // Reset the input
    e.target.value = '';
  };

  // Helpers - using clear thresholds that match applyAdjustmentsToStyle
  const getEffectiveVerbosity = () => {
    if (adjustments.verbosityAdjust <= -0.5) return 'Terse';
    if (adjustments.verbosityAdjust >= 0.5) return 'Detailed';
    return 'Moderate';
  };
  const getEffectiveFormality = () => {
    // Formality uses the raw adjustment value added to base level 3
    const level = 3 + adjustments.formalityAdjust;
    if (level <= 2) return 'Casual';
    if (level >= 4) return 'Formal';
    return 'Balanced';
  };
  const getEffectiveHedging = () => {
    if (adjustments.hedgingAdjust <= -0.5) return 'Confident';
    if (adjustments.hedgingAdjust >= 0.5) return 'Cautious';
    return 'Balanced';
  };

  const hasAdjustments = adjustments.verbosityAdjust !== 0 ||
    adjustments.formalityAdjust !== 0 ||
    adjustments.hedgingAdjust !== 0 ||
    adjustments.additionalAvoidWords.length > 0 ||
    Object.keys(adjustments.additionalPreferWords).length > 0 ||
    adjustments.additionalFramingGuidance.length > 0 ||
    adjustments.learnedRules.length > 0;

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">Document Profile</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {effectiveBaseProfileName ? `Base: ${effectiveBaseProfileName}` : 'No base profile'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-[10px] text-purple-500">Saving...</span>}
            {onClose && (
              <button onClick={onClose} className="text-lg leading-none hover:text-[var(--foreground)]">×</button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1 px-2 py-1 bg-[var(--muted)]/50 rounded text-center">
            <div className="text-sm font-bold">{editCount}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">edits</div>
          </div>
          <div className="flex-1 px-2 py-1 bg-[var(--muted)]/50 rounded text-center">
            <div className="text-sm font-bold">{Math.round(acceptanceRate * 100)}%</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">accepted</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {(['style', 'guidance', 'goals', 'import'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium capitalize ${
              activeTab === tab
                ? 'border-b-2 border-purple-500 text-purple-600'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Style Tab */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Verbosity */}
            <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium">Verbosity</span>
                <span className="text-xs text-purple-600 font-medium">{getEffectiveVerbosity()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-7">Terse</span>
                <input
                  type="range" min="-2" max="2" step="0.1"
                  value={adjustments.verbosityAdjust}
                  onChange={e => updateSlider('verbosityAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 accent-purple-600"
                />
                <span className="text-[10px] w-10 text-right">Detailed</span>
              </div>
            </div>

            {/* Formality */}
            <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium">Formality</span>
                <span className="text-xs text-purple-600 font-medium">{getEffectiveFormality()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-7">Casual</span>
                <input
                  type="range" min="-2" max="2" step="0.1"
                  value={adjustments.formalityAdjust}
                  onChange={e => updateSlider('formalityAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 accent-purple-600"
                />
                <span className="text-[10px] w-10 text-right">Formal</span>
              </div>
            </div>

            {/* Hedging */}
            <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium">Hedging</span>
                <span className="text-xs text-purple-600 font-medium">{getEffectiveHedging()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-7">Bold</span>
                <input
                  type="range" min="-2" max="2" step="0.1"
                  value={adjustments.hedgingAdjust}
                  onChange={e => updateSlider('hedgingAdjust', parseFloat(e.target.value))}
                  className="flex-1 h-1.5 accent-purple-600"
                />
                <span className="text-[10px] w-10 text-right">Cautious</span>
              </div>
            </div>

            {/* Gen Alpha Mode - Easter Egg */}
            <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-dashed border-purple-200">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🧠</span>
                  <span className="text-xs font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Gen Alpha Mode</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adjustments.genAlphaMode || false}
                    onChange={() => {
                      const newValue = !adjustments.genAlphaMode;
                      setAdjustments(prev => ({ ...prev, genAlphaMode: newValue }));
                      saveAdjustments({ genAlphaMode: newValue });
                    }}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer-focus:outline-none transition-colors ${
                    adjustments.genAlphaMode
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                      : 'bg-gray-300'
                  }`}>
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                        adjustments.genAlphaMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>
              </div>
              {adjustments.genAlphaMode && (
                <p className="text-[10px] text-purple-600 mt-2">
                  no cap fr fr, edits will be bussin 💀
                </p>
              )}
            </div>
          </div>
        )}

        {/* Guidance Tab */}
        {activeTab === 'guidance' && (
          <div className="space-y-4">
            {/* Consolidate button - shows when either guidance or rules can be consolidated */}
            {(adjustments.additionalFramingGuidance.length >= 3 || adjustments.learnedRules.length >= 3) && (
              <button
                onClick={consolidateGuidance}
                disabled={consolidating}
                className="w-full py-2 text-xs bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex items-center justify-center gap-2"
                title="Use AI to merge similar guidance and rules into fewer, clearer items"
              >
                {consolidating ? 'Consolidating...' : '✨ Consolidate All'}
              </button>
            )}

            {/* Framing Guidance */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium">Framing & Constraints</h4>
              </div>
              <div className="space-y-1 mb-2 min-h-[24px]">
                {adjustments.additionalFramingGuidance.map((g, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] group p-2 bg-blue-50 rounded">
                    <span className="flex-1 text-blue-700">{g}</span>
                    <button onClick={() => removeGuidance(g)} className="opacity-50 hover:opacity-100 text-blue-600">×</button>
                  </div>
                ))}
                {adjustments.additionalFramingGuidance.length === 0 && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">No custom constraints</span>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newGuidance}
                  onChange={e => setNewGuidance(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuidance()}
                  placeholder="e.g., Focus on practical examples..."
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)]"
                />
                <button onClick={addGuidance} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Add</button>
              </div>
            </div>

            {/* Rules */}
            <div>
              <h4 className="text-xs font-medium mb-2">Specific Rules</h4>
              <div className="space-y-1 mb-2 min-h-[24px]">
                {adjustments.learnedRules.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] group p-2 bg-purple-50 rounded">
                    <span className="text-purple-500">•</span>
                    <span className="flex-1 text-purple-700">{r.rule}</span>
                    <span className="text-purple-400 text-[9px]">{r.source}</span>
                    <button onClick={() => removeRule(r.rule)} className="opacity-50 hover:opacity-100 text-purple-600">×</button>
                  </div>
                ))}
                {adjustments.learnedRules.length === 0 && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">No rules yet</span>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newRule}
                  onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRule()}
                  placeholder="e.g., Always use active voice..."
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)]"
                />
                <button onClick={addRule} className="px-2 py-1 text-xs bg-purple-50 text-purple-600 rounded hover:bg-purple-100">Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === 'goals' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-medium">Document Goals</h4>
                <div className="flex items-center gap-2">
                  {adjustments.documentGoals?.userEdited && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">Edited</span>
                  )}
                  {adjustments.documentGoals?.summary && (
                    <button
                      onClick={handleToggleLock}
                      className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        adjustments.documentGoals?.locked
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title={adjustments.documentGoals?.locked ? 'Unlock to allow auto-updates' : 'Lock to prevent auto-updates'}
                    >
                      {adjustments.documentGoals?.locked ? '🔒 Locked' : '🔓 Auto-update'}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] mb-3">
                {adjustments.documentGoals?.locked
                  ? 'Goals are locked. The Intent Agent will not auto-update them.'
                  : 'Goals help the AI understand your document\'s purpose. They auto-update as your document evolves.'}
              </p>

              {goalsEditing ? (
                /* Editing Mode - Expandable Sections */
                <div className="space-y-2">
                  {/* Summary */}
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGoalField(expandedGoalField === 'summary' ? null : 'summary')}
                      className="w-full flex items-center justify-between p-2 bg-[var(--muted)]/30 hover:bg-[var(--muted)]/50 text-left"
                    >
                      <span className="text-[10px] font-medium">Summary</span>
                      <span className="text-xs">{expandedGoalField === 'summary' ? '▼' : '▶'}</span>
                    </button>
                    {expandedGoalField === 'summary' && (
                      <div className="p-2">
                        <textarea
                          value={editedGoals.summary || ''}
                          onChange={e => setEditedGoals(prev => ({ ...prev, summary: e.target.value }))}
                          placeholder="What is this document trying to accomplish?"
                          className="w-full p-2 text-xs border border-[var(--border)] rounded bg-[var(--background)] resize-y min-h-[100px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Main Argument */}
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGoalField(expandedGoalField === 'mainArgument' ? null : 'mainArgument')}
                      className="w-full flex items-center justify-between p-2 bg-[var(--muted)]/30 hover:bg-[var(--muted)]/50 text-left"
                    >
                      <span className="text-[10px] font-medium">Main Argument/Thesis</span>
                      <span className="text-xs">{expandedGoalField === 'mainArgument' ? '▼' : '▶'}</span>
                    </button>
                    {expandedGoalField === 'mainArgument' && (
                      <div className="p-2">
                        <textarea
                          value={editedGoals.mainArgument || ''}
                          onChange={e => setEditedGoals(prev => ({ ...prev, mainArgument: e.target.value }))}
                          placeholder="The central claim or thesis"
                          className="w-full p-2 text-xs border border-[var(--border)] rounded bg-[var(--background)] resize-y min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Objectives */}
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGoalField(expandedGoalField === 'objectives' ? null : 'objectives')}
                      className="w-full flex items-center justify-between p-2 bg-[var(--muted)]/30 hover:bg-[var(--muted)]/50 text-left"
                    >
                      <span className="text-[10px] font-medium">Key Objectives</span>
                      <span className="text-xs">{expandedGoalField === 'objectives' ? '▼' : '▶'}</span>
                    </button>
                    {expandedGoalField === 'objectives' && (
                      <div className="p-2">
                        <textarea
                          value={(editedGoals.objectives || []).join('\n')}
                          onChange={e => setEditedGoals(prev => ({
                            ...prev,
                            objectives: e.target.value.split('\n').filter(o => o.trim())
                          }))}
                          placeholder="One objective per line"
                          className="w-full p-2 text-xs border border-[var(--border)] rounded bg-[var(--background)] resize-y min-h-[120px] font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Audience Needs */}
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGoalField(expandedGoalField === 'audienceNeeds' ? null : 'audienceNeeds')}
                      className="w-full flex items-center justify-between p-2 bg-[var(--muted)]/30 hover:bg-[var(--muted)]/50 text-left"
                    >
                      <span className="text-[10px] font-medium">Audience Needs</span>
                      <span className="text-xs">{expandedGoalField === 'audienceNeeds' ? '▼' : '▶'}</span>
                    </button>
                    {expandedGoalField === 'audienceNeeds' && (
                      <div className="p-2">
                        <textarea
                          value={editedGoals.audienceNeeds || ''}
                          onChange={e => setEditedGoals(prev => ({ ...prev, audienceNeeds: e.target.value }))}
                          placeholder="What does the reader need from this document?"
                          className="w-full p-2 text-xs border border-[var(--border)] rounded bg-[var(--background)] resize-y min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Success Criteria */}
                  <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedGoalField(expandedGoalField === 'successCriteria' ? null : 'successCriteria')}
                      className="w-full flex items-center justify-between p-2 bg-[var(--muted)]/30 hover:bg-[var(--muted)]/50 text-left"
                    >
                      <span className="text-[10px] font-medium">Success Criteria</span>
                      <span className="text-xs">{expandedGoalField === 'successCriteria' ? '▼' : '▶'}</span>
                    </button>
                    {expandedGoalField === 'successCriteria' && (
                      <div className="p-2">
                        <textarea
                          value={editedGoals.successCriteria || ''}
                          onChange={e => setEditedGoals(prev => ({ ...prev, successCriteria: e.target.value }))}
                          placeholder="What does success look like for this document?"
                          className="w-full p-2 text-xs border border-[var(--border)] rounded bg-[var(--background)] resize-y min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={cancelEditingGoals}
                      className="flex-1 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveGoals}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs"
                    >
                      Save Goals
                    </button>
                  </div>
                </div>
              ) : adjustments.documentGoals?.summary ? (
                /* Display Mode */
                <div className="space-y-3">
                  <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
                    <div className="text-[10px] font-medium text-purple-600 mb-1">Summary</div>
                    <p className="text-xs text-[var(--foreground)]">{adjustments.documentGoals.summary}</p>
                  </div>

                  {adjustments.documentGoals.mainArgument && (
                    <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
                      <div className="text-[10px] font-medium text-purple-600 mb-1">Main Argument</div>
                      <p className="text-xs text-[var(--foreground)]">{adjustments.documentGoals.mainArgument}</p>
                    </div>
                  )}

                  {adjustments.documentGoals.objectives && adjustments.documentGoals.objectives.length > 0 && (
                    <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
                      <div className="text-[10px] font-medium text-purple-600 mb-1">Objectives</div>
                      <ul className="space-y-1">
                        {adjustments.documentGoals.objectives.map((obj, i) => (
                          <li key={i} className="text-xs text-[var(--foreground)] flex items-start gap-2">
                            <span className="text-purple-500">•</span>
                            {obj}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {adjustments.documentGoals.audienceNeeds && (
                    <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
                      <div className="text-[10px] font-medium text-purple-600 mb-1">Audience Needs</div>
                      <p className="text-xs text-[var(--foreground)]">{adjustments.documentGoals.audienceNeeds}</p>
                    </div>
                  )}

                  {adjustments.documentGoals.successCriteria && (
                    <div className="p-3 bg-[var(--muted)]/30 rounded-lg">
                      <div className="text-[10px] font-medium text-purple-600 mb-1">Success Criteria</div>
                      <p className="text-xs text-[var(--foreground)]">{adjustments.documentGoals.successCriteria}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={startEditingGoals}
                      className="flex-1 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleAnalyzeGoals}
                      disabled={analyzingGoals}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs disabled:opacity-50"
                    >
                      {analyzingGoals ? 'Analyzing...' : 'Re-analyze'}
                    </button>
                    <button
                      onClick={handleClearGoals}
                      className="px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-xs"
                      title="Clear all goals"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : analyzingGoals ? (
                /* Loading state */
                <div className="text-center py-8">
                  <div className="text-3xl mb-3 animate-pulse">🎯</div>
                  <p className="text-xs text-purple-600 font-medium mb-2">
                    Analyzing document goals...
                  </p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    The Intent Agent is synthesizing your document's purpose and objectives.
                  </p>
                </div>
              ) : (
                /* No goals yet */
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">🎯</div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-4">
                    No document goals defined yet. Goals help the AI understand your document's purpose and align edits accordingly.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={startEditingGoals}
                      className="flex-1 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-xs"
                    >
                      Write Goals
                    </button>
                    <button
                      onClick={handleAnalyzeGoals}
                      disabled={analyzingGoals}
                      className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs disabled:opacity-50"
                    >
                      {analyzingGoals ? 'Analyzing...' : 'Auto-analyze'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-medium mb-2">Import Requirements</h4>
              <p className="text-[10px] text-[var(--muted-foreground)] mb-3">
                Paste text from a grant call, style guide, or submission requirements.
                AI will extract constraints and merge them into this document's profile.
              </p>

              {/* File upload */}
              <div className="mb-3">
                <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:bg-[var(--muted)]/50 transition-colors">
                  <span className="text-xs">Upload .txt or .md file</span>
                  <input
                    type="file"
                    accept=".txt,.md,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Text input */}
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Paste requirements text here (e.g., R01 grant call, submission guidelines, style requirements...)"
                className="w-full h-40 px-2 py-2 text-xs border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none"
              />

              {/* Character count */}
              <div className="text-[10px] text-[var(--muted-foreground)] mt-1">
                {importText.length} characters {importText.length < 50 && importText.length > 0 && '(minimum 50)'}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleExtractConstraints(true)}
                disabled={importing || importText.trim().length < 50}
                className="flex-1 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-xs disabled:opacity-50"
              >
                {importing ? 'Analyzing...' : 'Preview'}
              </button>
              <button
                onClick={() => handleExtractConstraints(false)}
                disabled={importing || importText.trim().length < 50}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import & Merge'}
              </button>
            </div>

            {/* Preview Modal */}
            {showImportPreview && importPreview && (
              <div className="mt-4 p-3 bg-[var(--muted)]/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-medium">Extraction Preview</h5>
                  <button
                    onClick={() => { setShowImportPreview(false); setImportPreview(null); }}
                    className="text-xs hover:text-[var(--foreground)]"
                  >
                    ×
                  </button>
                </div>

                <p className="text-[10px] text-[var(--muted-foreground)] italic">
                  {importPreview.summary}
                </p>

                {/* Style adjustments */}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="p-2 bg-[var(--background)] rounded text-center">
                    <div className="font-medium">Verbosity</div>
                    <div className={importPreview.verbosityAdjust > 0 ? 'text-blue-600' : importPreview.verbosityAdjust < 0 ? 'text-orange-600' : ''}>
                      {importPreview.verbosityAdjust > 0 ? '+' : ''}{importPreview.verbosityAdjust}
                    </div>
                  </div>
                  <div className="p-2 bg-[var(--background)] rounded text-center">
                    <div className="font-medium">Formality</div>
                    <div className={importPreview.formalityAdjust > 0 ? 'text-blue-600' : importPreview.formalityAdjust < 0 ? 'text-orange-600' : ''}>
                      {importPreview.formalityAdjust > 0 ? '+' : ''}{importPreview.formalityAdjust}
                    </div>
                  </div>
                  <div className="p-2 bg-[var(--background)] rounded text-center">
                    <div className="font-medium">Hedging</div>
                    <div className={importPreview.hedgingAdjust > 0 ? 'text-blue-600' : importPreview.hedgingAdjust < 0 ? 'text-orange-600' : ''}>
                      {importPreview.hedgingAdjust > 0 ? '+' : ''}{importPreview.hedgingAdjust}
                    </div>
                  </div>
                </div>

                {/* Extracted items */}
                {importPreview.avoidWords.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium mb-1">Words to Avoid ({importPreview.avoidWords.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {importPreview.avoidWords.slice(0, 10).map((word, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[9px] rounded">{word}</span>
                      ))}
                      {importPreview.avoidWords.length > 10 && (
                        <span className="text-[9px] text-[var(--muted-foreground)]">+{importPreview.avoidWords.length - 10} more</span>
                      )}
                    </div>
                  </div>
                )}

                {importPreview.framingGuidance.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium mb-1">Framing Guidance ({importPreview.framingGuidance.length})</div>
                    <ul className="space-y-0.5">
                      {importPreview.framingGuidance.slice(0, 5).map((g, i) => (
                        <li key={i} className="text-[9px] text-blue-700 bg-blue-50 p-1 rounded">{g}</li>
                      ))}
                      {importPreview.framingGuidance.length > 5 && (
                        <li className="text-[9px] text-[var(--muted-foreground)]">+{importPreview.framingGuidance.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {importPreview.rules.length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium mb-1">Rules ({importPreview.rules.length})</div>
                    <ul className="space-y-0.5">
                      {importPreview.rules.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-[9px] text-purple-700 bg-purple-50 p-1 rounded">• {r}</li>
                      ))}
                      {importPreview.rules.length > 5 && (
                        <li className="text-[9px] text-[var(--muted-foreground)]">+{importPreview.rules.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleApplyPreview}
                  disabled={importing}
                  className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs disabled:opacity-50"
                >
                  {importing ? 'Applying...' : 'Apply These Constraints'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="px-3 py-1 text-[10px] text-[var(--muted-foreground)] text-center border-t border-[var(--border)]">
          Updated: {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      )}

      {/* Actions */}
      <div className="p-3 border-t border-[var(--border)] space-y-2">
        <button
          onClick={() => setShowMergeModal(true)}
          disabled={!hasAdjustments}
          className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium disabled:opacity-50"
        >
          Save as Global Profile
        </button>
        <button
          onClick={handleReset}
          disabled={!hasAdjustments}
          className="w-full py-1.5 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-xs disabled:opacity-50"
        >
          Reset to Base
        </button>
      </div>

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="font-medium">Save as Global Profile</h3>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-[var(--muted-foreground)]">
                Create a reusable profile from this document's preferences.
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">Save to:</label>
                <select
                  value={mergeTarget}
                  onChange={e => setMergeTarget(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-sm"
                >
                  <option value="new">Create new profile</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>Update: {p.name}</option>
                  ))}
                </select>
              </div>
              {mergeTarget === 'new' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Profile name:</label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    placeholder="e.g., Technical Writing (Refined)"
                    className="w-full p-2 border border-[var(--border)] rounded-lg bg-[var(--background)] text-sm"
                  />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
              <button onClick={() => setShowMergeModal(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-sm">
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={merging || (mergeTarget === 'new' && !newProfileName.trim())}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50"
              >
                {merging ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
