'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DocumentAdjustments, AudienceProfile, LearnedRule } from '@/types';

interface DocumentProfilePanelProps {
  documentId: string;
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

type TabType = 'style' | 'words' | 'guidance' | 'import';

/**
 * Global document profile panel - comprehensive document-specific preferences
 * that the orchestrator actively updates and users can edit.
 */
export default function DocumentProfilePanel({
  documentId,
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
  const [newAvoidWord, setNewAvoidWord] = useState('');
  const [newPreferFrom, setNewPreferFrom] = useState('');
  const [newPreferTo, setNewPreferTo] = useState('');
  const [newGuidance, setNewGuidance] = useState('');
  const [newRule, setNewRule] = useState('');

  // For merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>('new');
  const [newProfileName, setNewProfileName] = useState('');
  const [merging, setMerging] = useState(false);

  // For import constraints
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
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
  const loadPreferences = useCallback(async () => {
    if (!documentId) return;

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

  // Save adjustments
  const saveAdjustments = async (newAdjustments: Partial<DocumentAdjustments>) => {
    setSaving(true);
    try {
      await fetch(`/api/documents/${documentId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments: newAdjustments }),
      });
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  // Update slider
  const updateSlider = (key: 'verbosityAdjust' | 'formalityAdjust' | 'hedgingAdjust', value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
    saveAdjustments({ [key]: value });
  };

  // Add avoid word
  const addAvoidWord = () => {
    if (!newAvoidWord.trim()) return;
    const word = newAvoidWord.trim().toLowerCase();
    if (adjustments.additionalAvoidWords.includes(word)) {
      setNewAvoidWord('');
      return;
    }
    const newWords = [...adjustments.additionalAvoidWords, word];
    setAdjustments(prev => ({ ...prev, additionalAvoidWords: newWords }));
    setNewAvoidWord('');
    saveAdjustments({ additionalAvoidWords: newWords });
  };

  // Remove avoid word
  const removeAvoidWord = (word: string) => {
    const newWords = adjustments.additionalAvoidWords.filter(w => w !== word);
    setAdjustments(prev => ({ ...prev, additionalAvoidWords: newWords }));
    saveAdjustments({ additionalAvoidWords: newWords });
  };

  // Add prefer word
  const addPreferWord = () => {
    if (!newPreferFrom.trim() || !newPreferTo.trim()) return;
    const from = newPreferFrom.trim().toLowerCase();
    const to = newPreferTo.trim();
    const newPrefer = { ...adjustments.additionalPreferWords, [from]: to };
    setAdjustments(prev => ({ ...prev, additionalPreferWords: newPrefer }));
    setNewPreferFrom('');
    setNewPreferTo('');
    saveAdjustments({ additionalPreferWords: newPrefer });
  };

  // Remove prefer word
  const removePreferWord = (from: string) => {
    const newPrefer = { ...adjustments.additionalPreferWords };
    delete newPrefer[from];
    setAdjustments(prev => ({ ...prev, additionalPreferWords: newPrefer }));
    saveAdjustments({ additionalPreferWords: newPrefer });
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
        {(['style', 'words', 'guidance', 'import'] as TabType[]).map(tab => (
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
                    onChange={() => saveAdjustments({ genAlphaMode: !adjustments.genAlphaMode })}
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

        {/* Words Tab */}
        {activeTab === 'words' && (
          <div className="space-y-4">
            {/* Avoid Words */}
            <div>
              <h4 className="text-xs font-medium mb-2">Words to Avoid</h4>
              <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
                {adjustments.additionalAvoidWords.map((word, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] rounded group">
                    {word}
                    <button onClick={() => removeAvoidWord(word)} className="opacity-50 hover:opacity-100">×</button>
                  </span>
                ))}
                {adjustments.additionalAvoidWords.length === 0 && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">None</span>
                )}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newAvoidWord}
                  onChange={e => setNewAvoidWord(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAvoidWord()}
                  placeholder="Add word..."
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)]"
                />
                <button onClick={addAvoidWord} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Add</button>
              </div>
            </div>

            {/* Prefer Words */}
            <div>
              <h4 className="text-xs font-medium mb-2">Word Preferences</h4>
              <div className="space-y-1 mb-2 min-h-[24px]">
                {Object.entries(adjustments.additionalPreferWords).map(([from, to], i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] group">
                    <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded line-through">{from}</span>
                    <span>→</span>
                    <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded">{to}</span>
                    <button onClick={() => removePreferWord(from)} className="opacity-0 group-hover:opacity-50 hover:!opacity-100">×</button>
                  </div>
                ))}
                {Object.keys(adjustments.additionalPreferWords).length === 0 && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">None</span>
                )}
              </div>
              <div className="flex gap-1 items-center">
                <input
                  type="text"
                  value={newPreferFrom}
                  onChange={e => setNewPreferFrom(e.target.value)}
                  placeholder="Avoid..."
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)]"
                />
                <span className="text-xs">→</span>
                <input
                  type="text"
                  value={newPreferTo}
                  onChange={e => setNewPreferTo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPreferWord()}
                  placeholder="Use..."
                  className="flex-1 px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)]"
                />
                <button onClick={addPreferWord} className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100">Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Guidance Tab */}
        {activeTab === 'guidance' && (
          <div className="space-y-4">
            {/* Framing Guidance */}
            <div>
              <h4 className="text-xs font-medium mb-2">Framing & Constraints</h4>
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
