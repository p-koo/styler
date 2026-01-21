'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import type { PreferenceStore, AudienceProfile, BaseStyle } from '@/types';

const MODEL_STORAGE_KEY = 'preference-editor-model';
const THEME_STORAGE_KEY = 'styler-theme';

/**
 * Generate a ChatGPT-ready prompt from a profile
 */
function generatePromptForProfile(baseStyle: BaseStyle, profile?: AudienceProfile): string {
  const parts: string[] = [];

  parts.push('You are a writing assistant for academic and scientific writing.');
  parts.push('');

  // Verbosity
  parts.push('STYLE:');
  if (baseStyle.verbosity === 'terse') {
    parts.push('- Be concise and direct. Every word should earn its place.');
  } else if (baseStyle.verbosity === 'detailed') {
    parts.push('- Provide comprehensive, detailed responses.');
  } else {
    parts.push('- Balance conciseness with sufficient detail.');
  }

  // Formality
  if (baseStyle.formalityLevel >= 4) {
    parts.push('- Use formal, academic language.');
  } else if (baseStyle.formalityLevel <= 2) {
    parts.push('- Use conversational, accessible language.');
  } else {
    parts.push('- Use clear, professional language.');
  }

  // Hedging
  if (baseStyle.hedgingStyle === 'confident') {
    parts.push('- Make confident, direct assertions.');
  } else if (baseStyle.hedgingStyle === 'cautious') {
    parts.push('- Use appropriate hedging (may, might, suggests).');
  } else {
    parts.push('- Balance confidence with appropriate hedging.');
  }

  parts.push('');

  // Format preferences
  if (baseStyle.formatBans.length > 0 || baseStyle.requiredFormats.length > 0) {
    parts.push('FORMATTING:');
    if (baseStyle.formatBans.length > 0) {
      parts.push(`- Never use: ${baseStyle.formatBans.join(', ')}`);
    }
    if (baseStyle.requiredFormats.length > 0) {
      parts.push(`- Always use: ${baseStyle.requiredFormats.join(', ')}`);
    }
    parts.push('');
  }

  // Note: Word preferences removed - word choices are contextual

  // Profile-specific
  if (profile) {
    parts.push(`AUDIENCE: ${profile.name}`);

    if (profile.jargonLevel === 'minimal') {
      parts.push('- Use minimal technical jargon. Make content accessible.');
    } else if (profile.jargonLevel === 'heavy') {
      parts.push('- Use appropriate technical terminology freely.');
    }

    if (profile.emphasisPoints.length > 0) {
      parts.push(`- Emphasize: ${profile.emphasisPoints.join(', ')}`);
    }

    if (profile.framingGuidance.length > 0) {
      parts.push('');
      parts.push('FRAMING:');
      profile.framingGuidance.forEach(g => parts.push(`- ${g}`));
    }

    if (profile.lengthGuidance?.target === 'concise') {
      parts.push('- Keep responses concise. Word economy is critical.');
    }
  }

  return parts.join('\n');
}

export default function SettingsPage() {
  const [store, setStore] = useState<PreferenceStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingProfile, setEditingProfile] = useState<AudienceProfile | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [profileCreationMode, setProfileCreationMode] = useState<'select' | 'chatgpt' | 'document' | 'manual' | 'upload'>('select');
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [newProfileSampleText, setNewProfileSampleText] = useState('');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractionPrompt, setExtractionPrompt] = useState('');

  // Editor preferences (model & theme)
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [darkMode, setDarkMode] = useState<'system' | 'light' | 'dark'>('system');
  const [themeLoaded, setThemeLoaded] = useState(false);

  useEffect(() => {
    fetchPreferences();
    fetchModels();
    // Load theme from localStorage
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'system' | 'light' | 'dark' | null;
    if (savedTheme) {
      setDarkMode(savedTheme);
    }
    setThemeLoaded(true);
  }, []);

  // Apply dark mode (only after theme is loaded to avoid overwriting saved value)
  useEffect(() => {
    if (!themeLoaded) return;

    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    if (darkMode !== 'system') {
      root.classList.add(darkMode);
    }
    localStorage.setItem(THEME_STORAGE_KEY, darkMode);
  }, [darkMode, themeLoaded]);

  async function fetchModels() {
    try {
      const res = await fetch('/api/preferences/models');
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models || []);
        // Load saved model preference
        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
        if (savedModel && data.models?.includes(savedModel)) {
          setSelectedModel(savedModel);
        } else if (data.models?.length > 0) {
          setSelectedModel(data.models[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  }

  function handleModelChange(model: string) {
    setSelectedModel(model);
    localStorage.setItem(MODEL_STORAGE_KEY, model);
    setMessage({ type: 'success', text: `Model changed to ${model}` });
  }

  async function fetchPreferences() {
    try {
      const res = await fetch('/api/preferences');
      const data = await res.json();
      setStore(data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load preferences' });
    } finally {
      setLoading(false);
    }
  }

  async function updateBaseStyle(updates: Partial<BaseStyle>) {
    if (!store) return;
    setSaving(true);

    try {
      const res = await fetch('/api/preferences/base-style', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update');

      const data = await res.json();
      setStore((prev) => prev ? { ...prev, baseStyle: data.baseStyle } : null);
      setMessage({ type: 'success', text: 'Base style updated' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update base style' });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile(id: string) {
    if (!confirm('Delete this profile?')) return;

    try {
      await fetch(`/api/preferences/profiles/${id}`, { method: 'DELETE' });
      setStore((prev) =>
        prev
          ? {
              ...prev,
              audienceProfiles: prev.audienceProfiles.filter((p) => p.id !== id),
            }
          : null
      );
      setMessage({ type: 'success', text: 'Profile deleted' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete profile' });
    }
  }

  async function moveProfile(index: number, direction: 'up' | 'down') {
    if (!store) return;
    const profiles = [...store.audienceProfiles];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= profiles.length) return;

    // Swap profiles
    [profiles[index], profiles[newIndex]] = [profiles[newIndex], profiles[index]];

    // Update local state immediately
    setStore((prev) => prev ? { ...prev, audienceProfiles: profiles } : null);

    // Save to backend
    try {
      await fetch('/api/preferences/profiles/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds: profiles.map(p => p.id) }),
      });
    } catch (err) {
      // Revert on error
      fetchPreferences();
      setMessage({ type: 'error', text: 'Failed to reorder profiles' });
    }
  }

  async function createProfile() {
    setCreatingProfile(true);
    try {
      if (profileCreationMode === 'chatgpt') {
        // Handle ChatGPT history upload
        if (!uploadedFile) {
          setMessage({ type: 'error', text: 'Please upload a conversations.json file' });
          setCreatingProfile(false);
          return;
        }
        if (!newProfileName.trim()) {
          setMessage({ type: 'error', text: 'Profile name is required' });
          setCreatingProfile(false);
          return;
        }

        const text = await uploadedFile.text();
        const conversations = JSON.parse(text);

        const res = await fetch('/api/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversations,
            profileName: newProfileName.trim(),
            extractionPrompt: extractionPrompt.trim() || undefined,
          }),
        });

        if (!res.ok) throw new Error('Bootstrap failed');

        const data = await res.json();
        setMessage({
          type: 'success',
          text: `Analyzed ${data.conversationsAnalyzed} conversations, extracted ${data.learnedRules || 0} rules`,
        });

        // Refresh preferences
        fetchPreferences();
      } else if (profileCreationMode === 'document') {
        // Handle document upload for style analysis
        if (!uploadedFile) {
          setMessage({ type: 'error', text: 'Please upload a document' });
          setCreatingProfile(false);
          return;
        }
        if (!newProfileName.trim()) {
          setMessage({ type: 'error', text: 'Profile name is required' });
          setCreatingProfile(false);
          return;
        }

        // Read file content
        let documentText = '';
        if (uploadedFile.type === 'application/pdf') {
          // For PDF, we need to send to an API that can extract text
          const formData = new FormData();
          formData.append('file', uploadedFile);
          formData.append('name', newProfileName);
          formData.append('description', newProfileDescription);

          const res = await fetch('/api/preferences/profiles/from-document', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error('Failed to analyze document');

          const data = await res.json();
          setStore((prev) =>
            prev
              ? { ...prev, audienceProfiles: [...prev.audienceProfiles, data.profile] }
              : null
          );
          setMessage({ type: 'success', text: 'Profile created from document analysis!' });
        } else {
          // For text files, read directly
          documentText = await uploadedFile.text();

          const res = await fetch('/api/preferences/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newProfileName,
              description: newProfileDescription,
              sampleText: documentText,
            }),
          });

          if (!res.ok) throw new Error('Failed to create profile');

          const data = await res.json();
          setStore((prev) =>
            prev
              ? { ...prev, audienceProfiles: [...prev.audienceProfiles, data.profile] }
              : null
          );
          setMessage({ type: 'success', text: 'Profile created from document analysis!' });
        }
      } else if (profileCreationMode === 'upload') {
        // Upload mode - import from JSON file
        if (!uploadedFile) {
          setMessage({ type: 'error', text: 'Please select a profile JSON file' });
          setCreatingProfile(false);
          return;
        }

        const text = await uploadedFile.text();
        const data = JSON.parse(text);

        // Validate it's a profile export
        if (data.type !== 'styler-profile' || !data.profile) {
          setMessage({ type: 'error', text: 'Invalid profile file. Expected a Styler profile export.' });
          setCreatingProfile(false);
          return;
        }

        // Generate new ID to avoid conflicts
        const importedProfile = {
          ...data.profile,
          id: `${data.profile.id || 'imported'}-${Date.now()}`,
          source: 'manual' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Save via API
        const res = await fetch('/api/preferences/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: importedProfile.name,
            description: importedProfile.description,
            importedProfile: importedProfile,
          }),
        });

        if (!res.ok) throw new Error('Failed to import profile');

        fetchPreferences();
        setMessage({ type: 'success', text: `Imported profile: ${importedProfile.name}` });
      } else {
        // Manual mode
        if (!newProfileName.trim()) {
          setMessage({ type: 'error', text: 'Profile name is required' });
          setCreatingProfile(false);
          return;
        }

        const res = await fetch('/api/preferences/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newProfileName,
            description: newProfileDescription,
            sampleText: newProfileSampleText,
          }),
        });

        if (!res.ok) throw new Error('Failed to create profile');

        const data = await res.json();
        setStore((prev) =>
          prev
            ? { ...prev, audienceProfiles: [...prev.audienceProfiles, data.profile] }
            : null
        );
        setMessage({
          type: 'success',
          text: data.optimized
            ? 'Profile created and optimized from your preferences!'
            : 'Profile created successfully',
        });
      }

      // Reset form and close modal
      resetCreateProfileForm();
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to create profile: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setCreatingProfile(false);
    }
  }

  function resetCreateProfileForm() {
    setNewProfileName('');
    setNewProfileDescription('');
    setNewProfileSampleText('');
    setUploadedFile(null);
    setExtractionPrompt('');
    setProfileCreationMode('select');
    setShowCreateProfile(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">Loading...</div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Failed to load preferences</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="settings" />

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-8">Settings</h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Editor Preferences Section */}
        <section className="mb-8 p-6 border border-[var(--border)] rounded-lg">
          <h2 className="text-lg font-medium mb-4">Editor Preferences</h2>
          <p className="text-[var(--muted-foreground)] text-sm mb-4">
            Configure your AI model and display preferences.
          </p>

          <div className="grid grid-cols-2 gap-6">
            {/* AI Model */}
            <div>
              <label className="block text-sm font-medium mb-2">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Select the AI model used for generating edit suggestions.
              </p>
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDarkMode('light')}
                  className={`flex-1 px-3 py-2 rounded-lg border ${
                    darkMode === 'light'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  ☀️ Light
                </button>
                <button
                  onClick={() => setDarkMode('dark')}
                  className={`flex-1 px-3 py-2 rounded-lg border ${
                    darkMode === 'dark'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  🌙 Dark
                </button>
                <button
                  onClick={() => setDarkMode('system')}
                  className={`flex-1 px-3 py-2 rounded-lg border ${
                    darkMode === 'system'
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:bg-[var(--muted)]'
                  }`}
                >
                  💻 System
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Choose your preferred color scheme.
              </p>
            </div>
          </div>
        </section>

        {/* Base Style Section */}
      <section className="mb-8 p-6 border border-[var(--border)] rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Base Style</h2>
          <button
            onClick={() => {
              const prompt = generatePromptForProfile(store.baseStyle);
              navigator.clipboard.writeText(prompt);
              setMessage({ type: 'success', text: 'Base style copied to clipboard!' });
            }}
            className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)]"
          >
            Copy for ChatGPT
          </button>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm mb-4">
          These preferences apply to all conversations regardless of audience profile.
        </p>

        <div className="grid grid-cols-2 gap-6">
          {/* Verbosity */}
          <div>
            <label className="block text-sm font-medium mb-2">Verbosity</label>
            <select
              value={store.baseStyle.verbosity}
              onChange={(e) => updateBaseStyle({ verbosity: e.target.value as BaseStyle['verbosity'] })}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
              disabled={saving}
            >
              <option value="terse">Terse - Be concise</option>
              <option value="moderate">Moderate - Balanced</option>
              <option value="detailed">Detailed - Comprehensive</option>
            </select>
          </div>

          {/* Formality */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Formality Level: {store.baseStyle.formalityLevel}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={store.baseStyle.formalityLevel}
              onChange={(e) => updateBaseStyle({ formalityLevel: parseInt(e.target.value) })}
              className="w-full"
              disabled={saving}
            />
            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Casual</span>
              <span>Formal</span>
            </div>
          </div>

          {/* Hedging Style */}
          <div>
            <label className="block text-sm font-medium mb-2">Hedging Style</label>
            <select
              value={store.baseStyle.hedgingStyle}
              onChange={(e) => updateBaseStyle({ hedgingStyle: e.target.value as BaseStyle['hedgingStyle'] })}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
              disabled={saving}
            >
              <option value="confident">Confident - Direct assertions</option>
              <option value="balanced">Balanced - Appropriate hedging</option>
              <option value="cautious">Cautious - More qualifications</option>
            </select>
          </div>

          {/* Active Voice */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Active Voice Preference: {Math.round(store.baseStyle.activeVoicePreference * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={store.baseStyle.activeVoicePreference * 100}
              onChange={(e) => updateBaseStyle({ activeVoicePreference: parseInt(e.target.value) / 100 })}
              className="w-full"
              disabled={saving}
            />
            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Passive OK</span>
              <span>Prefer Active</span>
            </div>
          </div>
        </div>

        {/* Format Bans */}
        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">Format Bans</label>
          <div className="flex flex-wrap gap-2">
            {['emoji', 'em-dash', 'exclamation', 'headers', 'bullet-points', 'bold', 'italics'].map((format) => (
              <label key={format} className="flex items-center gap-2 px-3 py-1 border border-[var(--border)] rounded-lg cursor-pointer hover:bg-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={store.baseStyle.formatBans.includes(format)}
                  onChange={(e) => {
                    const newBans = e.target.checked
                      ? [...store.baseStyle.formatBans, format]
                      : store.baseStyle.formatBans.filter((b) => b !== format);
                    updateBaseStyle({ formatBans: newBans });
                  }}
                  disabled={saving}
                />
                <span className="text-sm">{format}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Note: Words to Avoid removed - word choices are contextual */}
      </section>

      {/* Audience Profiles Section */}
      <section className="mb-8 p-6 border border-[var(--border)] rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Audience Profiles</h2>
          <button
            onClick={() => setShowCreateProfile(true)}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm"
          >
            + Create Profile
          </button>
        </div>
        <p className="text-[var(--muted-foreground)] text-sm mb-4">
          Audience-specific overrides that modify your base style for different contexts.
        </p>

        {store.audienceProfiles.length === 0 ? (
          <p className="text-[var(--muted-foreground)] text-sm">
            No profiles yet. Import your ChatGPT history to auto-generate profiles, or create one manually.
          </p>
        ) : (
          <div className="space-y-4">
            {store.audienceProfiles.map((profile, index) => (
              <div
                key={profile.id}
                className="p-4 border border-[var(--border)] rounded-lg"
              >
                <div className="flex items-start justify-between">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-1 mr-3">
                    <button
                      onClick={() => moveProfile(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveProfile(index, 'down')}
                      disabled={index === store.audienceProfiles.length - 1}
                      className="p-1 text-xs border border-[var(--border)] rounded hover:bg-[var(--muted)] disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div>
                    <h3 className="font-medium">{profile.name}</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {profile.description}
                    </p>
                    <div className="flex gap-4 mt-2 text-xs text-[var(--muted-foreground)]">
                      <span>Jargon: {profile.jargonLevel}</span>
                      <span>Source: {profile.source}</span>
                      {profile.inferredFrom && (
                        <span>{profile.inferredFrom.length} conversations</span>
                      )}
                    </div>
                    {profile.emphasisPoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {profile.emphasisPoints.map((point) => (
                          <span key={point} className="px-2 py-0.5 bg-[var(--muted)] rounded text-xs">
                            {point}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const exportData = {
                          version: '1.0',
                          type: 'styler-profile',
                          profile: profile,
                          exportedAt: new Date().toISOString(),
                        };
                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${profile.name.toLowerCase().replace(/\s+/g, '-')}-profile.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setMessage({ type: 'success', text: `Exported ${profile.name} profile` });
                      }}
                      className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                      title="Export as JSON"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setEditingProfile(profile)}
                      className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--muted)]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteProfile(profile.id)}
                      className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>


      {/* Profile Edit Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--background)] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">Edit Profile</h2>
              <button
                onClick={() => setEditingProfile(null)}
                className="p-1 hover:bg-[var(--muted)] rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Profile Name</label>
                <input
                  type="text"
                  value={editingProfile.name}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={editingProfile.description || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] h-20 resize-none"
                  placeholder="Describe this profile's purpose..."
                />
              </div>

              {/* Jargon Level */}
              <div>
                <label className="block text-sm font-medium mb-1">Jargon Level</label>
                <select
                  value={editingProfile.jargonLevel}
                  onChange={(e) => setEditingProfile({ ...editingProfile, jargonLevel: e.target.value as 'minimal' | 'moderate' | 'heavy' })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                >
                  <option value="minimal">Minimal - Accessible to general audience</option>
                  <option value="moderate">Moderate - Some technical terms</option>
                  <option value="heavy">Heavy - Full technical language</option>
                </select>
              </div>

              {/* Emphasis Points */}
              <div>
                <label className="block text-sm font-medium mb-1">Emphasis Points</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Key themes or concepts to emphasize</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editingProfile.emphasisPoints.map((point, i) => (
                    <span key={i} className="px-3 py-1 bg-[var(--muted)] rounded-full text-sm flex items-center gap-1">
                      {point}
                      <button
                        onClick={() => setEditingProfile({
                          ...editingProfile,
                          emphasisPoints: editingProfile.emphasisPoints.filter((_, idx) => idx !== i)
                        })}
                        className="ml-1 text-[var(--muted-foreground)] hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add emphasis point..."
                    className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        setEditingProfile({
                          ...editingProfile,
                          emphasisPoints: [...editingProfile.emphasisPoints, e.currentTarget.value.trim()]
                        });
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
              </div>

              {/* Framing Guidance */}
              <div>
                <label className="block text-sm font-medium mb-1">Framing Guidance</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Guidelines for how to frame content</p>
                <div className="space-y-2 mb-2">
                  {editingProfile.framingGuidance.map((guidance, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <input
                        type="text"
                        value={guidance}
                        onChange={(e) => {
                          const newGuidance = [...editingProfile.framingGuidance];
                          newGuidance[i] = e.target.value;
                          setEditingProfile({ ...editingProfile, framingGuidance: newGuidance });
                        }}
                        className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)]"
                      />
                      <button
                        onClick={() => setEditingProfile({
                          ...editingProfile,
                          framingGuidance: editingProfile.framingGuidance.filter((_, idx) => idx !== i)
                        })}
                        className="p-1.5 text-[var(--muted-foreground)] hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setEditingProfile({
                    ...editingProfile,
                    framingGuidance: [...editingProfile.framingGuidance, '']
                  })}
                  className="text-sm text-[var(--primary)] hover:underline"
                >
                  + Add guidance
                </button>
              </div>

              {/* Discipline Terms */}
              <div>
                <label className="block text-sm font-medium mb-1">Domain Terms</label>
                <p className="text-xs text-[var(--muted-foreground)] mb-2">Technical terms appropriate for this audience</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editingProfile.disciplineTerms.map((term, i) => (
                    <span key={i} className="px-2 py-1 bg-[var(--muted)] rounded text-xs flex items-center gap-1">
                      {term}
                      <button
                        onClick={() => setEditingProfile({
                          ...editingProfile,
                          disciplineTerms: editingProfile.disciplineTerms.filter((_, idx) => idx !== i)
                        })}
                        className="ml-1 text-[var(--muted-foreground)] hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add domain term..."
                    className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        setEditingProfile({
                          ...editingProfile,
                          disciplineTerms: [...editingProfile.disciplineTerms, e.currentTarget.value.trim()]
                        });
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
              </div>

              {/* Generated Prompt Preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">ChatGPT Custom Instructions Preview</h3>
                  <button
                    onClick={() => {
                      const prompt = generatePromptForProfile(store.baseStyle, editingProfile);
                      navigator.clipboard.writeText(prompt);
                      setMessage({ type: 'success', text: 'Copied to clipboard!' });
                    }}
                    className="px-3 py-1 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded hover:opacity-90"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs bg-[var(--muted)] p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-40">
                  {generatePromptForProfile(store.baseStyle, editingProfile)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--border)]">
              <button
                onClick={() => setEditingProfile(null)}
                className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    // Save the edited profile via API
                    const res = await fetch(`/api/preferences/profiles/${editingProfile.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(editingProfile),
                    });

                    if (!res.ok) {
                      throw new Error('Failed to save profile');
                    }

                    const updatedProfile = await res.json();
                    setStore((prev) => prev ? {
                      ...prev,
                      audienceProfiles: prev.audienceProfiles.map(p =>
                        p.id === editingProfile.id ? updatedProfile : p
                      )
                    } : null);
                    setEditingProfile(null);
                    setMessage({ type: 'success', text: 'Profile updated!' });
                  } catch (err) {
                    setMessage({ type: 'error', text: 'Failed to save profile' });
                  }
                }}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Profile Modal */}
      {showCreateProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--background)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">Create New Audience Profile</h2>
              <button
                onClick={resetCreateProfileForm}
                className="p-1 hover:bg-[var(--muted)] rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Mode Selection */}
              {profileCreationMode === 'select' && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Choose how you want to create your profile:
                  </p>
                  <button
                    onClick={() => setProfileCreationMode('chatgpt')}
                    className="w-full p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-left"
                  >
                    <div className="font-medium">Import from ChatGPT History</div>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Upload your conversations.json export to automatically extract your writing style preferences
                    </div>
                  </button>
                  <button
                    onClick={() => setProfileCreationMode('upload')}
                    className="w-full p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-left"
                  >
                    <div className="font-medium">Upload Profile (JSON)</div>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Import a profile exported from Styler
                    </div>
                  </button>
                  <button
                    onClick={() => setProfileCreationMode('document')}
                    className="w-full p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-left"
                  >
                    <div className="font-medium">Analyze a Document</div>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Upload a PDF, DOC, or text file and let AI define a profile based on its writing style
                    </div>
                  </button>
                  <button
                    onClick={() => setProfileCreationMode('manual')}
                    className="w-full p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] text-left"
                  >
                    <div className="font-medium">Enter Manually</div>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Describe your preferences or paste style guidelines for AI to optimize
                    </div>
                  </button>
                </div>
              )}

              {/* ChatGPT Import Mode */}
              {profileCreationMode === 'chatgpt' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setProfileCreationMode('select')}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                  >
                    ← Back to options
                  </button>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">How it works</h4>
                    <ul className="text-xs text-[var(--muted-foreground)] space-y-1 list-disc list-inside">
                      <li>Your ChatGPT conversations are analyzed to find writing corrections you made</li>
                      <li>Patterns like "be more concise" or "don't use emojis" become learned rules</li>
                      <li>Topics and styles are clustered to create audience profiles</li>
                      <li>All analysis happens locally - your data stays on your machine</li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Profile Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g., My ChatGPT Style, Academic Writing"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Give this profile a name to distinguish it from others
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Upload ChatGPT Export
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Go to ChatGPT → Settings → Data Controls → Export Data. You will receive an email with a download link for a ZIP file containing conversations.json.
                    </p>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                    {uploadedFile && (
                      <p className="text-sm text-green-600 mt-2">Selected: {uploadedFile.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Extraction Focus (Optional)
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Tell the agent what to focus on. Leave empty to analyze all conversations.
                    </p>
                    <textarea
                      value={extractionPrompt}
                      onChange={(e) => setExtractionPrompt(e.target.value)}
                      placeholder="e.g., Focus on my academic writing conversations, especially grant proposals and paper drafts. Ignore casual conversations and coding help."
                      className="w-full h-24 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-y text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Document Analysis Mode */}
              {profileCreationMode === 'document' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setProfileCreationMode('select')}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                  >
                    ← Back to options
                  </button>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Profile Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g., Nature Journal, Grant Proposal"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newProfileDescription}
                      onChange={(e) => setNewProfileDescription(e.target.value)}
                      placeholder="Brief description of when to use this profile"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Upload Document
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Upload a PDF, DOC, or text file written in the style you want to capture.
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.md"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                    {uploadedFile && (
                      <p className="text-sm text-green-600 mt-2">Selected: {uploadedFile.name}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Manual Entry Mode */}
              {profileCreationMode === 'manual' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setProfileCreationMode('select')}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                  >
                    ← Back to options
                  </button>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Profile Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g., Nature Journal, Grant Proposal, Conference Paper"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newProfileDescription}
                      onChange={(e) => setNewProfileDescription(e.target.value)}
                      placeholder="Brief description of when to use this profile"
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Style Preferences (Optional)
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Paste author guidelines, style guide excerpts, or describe your preferences.
                      The AI will analyze this and optimize your profile settings.
                    </p>
                    <textarea
                      value={newProfileSampleText}
                      onChange={(e) => setNewProfileSampleText(e.target.value)}
                      placeholder="e.g., 'Nature articles should be written clearly and simply. Avoid jargon and acronyms where possible. Keep sentences and paragraphs short. Active voice preferred. Abstract should be 150 words max...'"
                      className="w-full h-48 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] resize-y text-sm"
                    />
                  </div>
                  <div className="p-3 bg-[var(--muted)]/50 rounded-lg">
                    <p className="text-xs font-medium mb-2">Examples of what to paste:</p>
                    <ul className="text-xs text-[var(--muted-foreground)] space-y-1 list-disc list-inside">
                      <li>Journal author guidelines (word limits, formatting rules)</li>
                      <li>Grant agency requirements (emphasis on broader impacts, preliminary data)</li>
                      <li>Conference style preferences (technical depth, audience level)</li>
                      <li>Your own notes on how you like to write for this audience</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Upload Profile Mode */}
              {profileCreationMode === 'upload' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setProfileCreationMode('select')}
                    className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-1"
                  >
                    ← Back to options
                  </button>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Upload Profile JSON
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Select a profile JSON file exported from Styler.
                    </p>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)]"
                    />
                    {uploadedFile && (
                      <p className="text-sm text-green-600 mt-2">Selected: {uploadedFile.name}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--border)]">
              <button
                onClick={resetCreateProfileForm}
                className="px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
              {profileCreationMode !== 'select' && (
                <button
                  onClick={createProfile}
                  disabled={
                    creatingProfile ||
                    (profileCreationMode === 'chatgpt' && (!uploadedFile || !newProfileName.trim())) ||
                    (profileCreationMode === 'document' && (!uploadedFile || !newProfileName.trim())) ||
                    (profileCreationMode === 'manual' && !newProfileName.trim()) ||
                    (profileCreationMode === 'upload' && !uploadedFile)
                  }
                  className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {creatingProfile
                    ? 'Processing...'
                    : profileCreationMode === 'chatgpt'
                    ? 'Import & Analyze'
                    : profileCreationMode === 'document'
                    ? 'Analyze & Create'
                    : profileCreationMode === 'upload'
                    ? 'Import Profile'
                    : newProfileSampleText.trim()
                    ? 'Create & Optimize'
                    : 'Create Profile'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
