/**
 * Preference Store
 *
 * JSON-based CRUD operations for managing user preferences.
 * Supports layered profiles (base style + audience overlays).
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  PreferenceStore,
  BaseStyle,
  AudienceProfile,
  LearnedRule,
} from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');

// Current schema version
const SCHEMA_VERSION = '1.0.0';

// Default base style
const DEFAULT_BASE_STYLE: BaseStyle = {
  verbosity: 'moderate',
  sentencePatterns: [],
  paragraphStructure: [],
  preferredWords: {},
  avoidWords: [],
  formalityLevel: 3,
  hedgingStyle: 'balanced',
  activeVoicePreference: 0.7,
  formatBans: [],
  requiredFormats: [],
  argumentStyle: [],
  transitionPhrases: [],
  learnedRules: [],
};

// Default preference store
const DEFAULT_STORE: PreferenceStore = {
  version: SCHEMA_VERSION,
  baseStyle: DEFAULT_BASE_STYLE,
  audienceProfiles: [],
  activeProfileId: null,
};

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
}

/**
 * Load preferences from disk
 */
export async function loadPreferences(): Promise<PreferenceStore> {
  await ensureDataDir();

  try {
    const data = await fs.readFile(PREFERENCES_FILE, 'utf-8');
    const store = JSON.parse(data) as PreferenceStore;

    // Migrate if needed
    if (store.version !== SCHEMA_VERSION) {
      return migrateStore(store);
    }

    return store;
  } catch (err) {
    // File doesn't exist or is invalid, return default
    return { ...DEFAULT_STORE };
  }
}

/**
 * Save preferences to disk
 */
export async function savePreferences(store: PreferenceStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PREFERENCES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Migrate store to current schema version
 */
function migrateStore(store: PreferenceStore): PreferenceStore {
  // For now, just update version - add migrations as schema evolves
  return {
    ...DEFAULT_STORE,
    ...store,
    version: SCHEMA_VERSION,
  };
}

/**
 * Get base style
 */
export async function getBaseStyle(): Promise<BaseStyle> {
  const store = await loadPreferences();
  return store.baseStyle;
}

/**
 * Update base style
 */
export async function updateBaseStyle(
  updates: Partial<BaseStyle>
): Promise<BaseStyle> {
  const store = await loadPreferences();
  store.baseStyle = { ...store.baseStyle, ...updates };
  await savePreferences(store);
  return store.baseStyle;
}

/**
 * Get all audience profiles
 */
export async function getAudienceProfiles(): Promise<AudienceProfile[]> {
  const store = await loadPreferences();
  return store.audienceProfiles;
}

/**
 * Get a specific audience profile
 */
export async function getAudienceProfile(
  id: string
): Promise<AudienceProfile | undefined> {
  const store = await loadPreferences();
  return store.audienceProfiles.find((p) => p.id === id);
}

/**
 * Create or update an audience profile
 */
export async function upsertAudienceProfile(
  profile: AudienceProfile
): Promise<AudienceProfile> {
  const store = await loadPreferences();

  const existingIndex = store.audienceProfiles.findIndex(
    (p) => p.id === profile.id
  );

  if (existingIndex >= 0) {
    store.audienceProfiles[existingIndex] = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
  } else {
    store.audienceProfiles.push({
      ...profile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await savePreferences(store);
  return profile;
}

/**
 * Delete an audience profile
 */
export async function deleteAudienceProfile(id: string): Promise<boolean> {
  const store = await loadPreferences();
  const initialLength = store.audienceProfiles.length;

  store.audienceProfiles = store.audienceProfiles.filter((p) => p.id !== id);

  if (store.activeProfileId === id) {
    store.activeProfileId = null;
  }

  await savePreferences(store);
  return store.audienceProfiles.length < initialLength;
}

/**
 * Set active profile
 */
export async function setActiveProfile(
  id: string | null
): Promise<PreferenceStore> {
  const store = await loadPreferences();

  if (id !== null) {
    const exists = store.audienceProfiles.some((p) => p.id === id);
    if (!exists) {
      throw new Error(`Profile ${id} not found`);
    }
  }

  store.activeProfileId = id;
  await savePreferences(store);
  return store;
}

/**
 * Get active profile (merged with base style)
 */
export async function getActiveStyle(): Promise<BaseStyle> {
  const store = await loadPreferences();

  if (!store.activeProfileId) {
    return store.baseStyle;
  }

  const profile = store.audienceProfiles.find(
    (p) => p.id === store.activeProfileId
  );

  if (!profile) {
    return store.baseStyle;
  }

  // Merge base style with profile overrides
  return mergeStyles(store.baseStyle, profile.overrides);
}

/**
 * Merge base style with profile overrides
 */
export function mergeStyles(
  base: BaseStyle,
  overrides: Partial<BaseStyle>
): BaseStyle {
  return {
    ...base,
    ...overrides,
    // Merge arrays rather than replace
    formatBans: [...base.formatBans, ...(overrides.formatBans || [])],
    requiredFormats: [
      ...base.requiredFormats,
      ...(overrides.requiredFormats || []),
    ],
    avoidWords: [...base.avoidWords, ...(overrides.avoidWords || [])],
    transitionPhrases: [
      ...base.transitionPhrases,
      ...(overrides.transitionPhrases || []),
    ],
    learnedRules: [...base.learnedRules, ...(overrides.learnedRules || [])],
    // Merge objects
    preferredWords: {
      ...base.preferredWords,
      ...(overrides.preferredWords || {}),
    },
  };
}

/**
 * Add a learned rule
 */
export async function addLearnedRule(rule: LearnedRule): Promise<void> {
  const store = await loadPreferences();
  store.baseStyle.learnedRules.push(rule);

  // Keep only the 100 most recent rules
  if (store.baseStyle.learnedRules.length > 100) {
    store.baseStyle.learnedRules = store.baseStyle.learnedRules.slice(-100);
  }

  await savePreferences(store);
}

/**
 * Initialize store from bootstrap results
 */
export async function initializeFromBootstrap(
  baseStyle: BaseStyle,
  audienceProfiles: AudienceProfile[],
  conversationsAnalyzed: number
): Promise<PreferenceStore> {
  // Load existing store to preserve existing profiles
  const existingStore = await loadPreferences();

  // Merge new profiles with existing ones (add new, don't replace existing)
  const existingIds = new Set(existingStore.audienceProfiles.map(p => p.id));
  const newProfiles = audienceProfiles.filter(p => !existingIds.has(p.id));
  const mergedProfiles = [...existingStore.audienceProfiles, ...newProfiles];

  // Merge learned rules from baseStyle with existing
  const existingRules = new Set(existingStore.baseStyle.learnedRules.map(r => r.rule));
  const newRules = baseStyle.learnedRules.filter(r => !existingRules.has(r.rule));
  const mergedRules = [...existingStore.baseStyle.learnedRules, ...newRules];

  const store: PreferenceStore = {
    version: SCHEMA_VERSION,
    baseStyle: {
      ...existingStore.baseStyle,
      // Merge avoid words
      avoidWords: [...new Set([...existingStore.baseStyle.avoidWords, ...baseStyle.avoidWords])],
      // Merge format bans
      formatBans: [...new Set([...existingStore.baseStyle.formatBans, ...baseStyle.formatBans])],
      // Merge preferred words
      preferredWords: { ...existingStore.baseStyle.preferredWords, ...baseStyle.preferredWords },
      // Merge learned rules
      learnedRules: mergedRules,
    },
    audienceProfiles: mergedProfiles,
    activeProfileId: existingStore.activeProfileId,
    lastBootstrap: new Date().toISOString(),
    conversationsAnalyzed,
  };

  await savePreferences(store);
  return store;
}

/**
 * Export preferences to JSON string
 */
export async function exportPreferences(): Promise<string> {
  const store = await loadPreferences();
  return JSON.stringify(store, null, 2);
}

/**
 * Import preferences from JSON string
 */
export async function importPreferences(json: string): Promise<PreferenceStore> {
  const store = JSON.parse(json) as PreferenceStore;

  // Validate basic structure
  if (!store.version || !store.baseStyle) {
    throw new Error('Invalid preference store format');
  }

  await savePreferences(store);
  return store;
}
