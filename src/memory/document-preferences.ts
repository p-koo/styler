/**
 * Document Preferences Storage
 *
 * Manages document-specific preferences that layer on top of global profiles.
 * Preferences are stored alongside document data in the documents folder.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  DocumentPreferences,
  DocumentAdjustments,
  EditDecision,
  AudienceProfile,
  LearnedRule,
} from '@/types';
import { DEFAULT_ADJUSTMENTS } from '@/agents/critique-agent';
import { loadPreferences, upsertAudienceProfile } from './preference-store';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DOCUMENTS_DIR = path.join(BASE_PATH, 'documents');

/**
 * Ensure documents directory exists
 */
async function ensureDir(): Promise<void> {
  try {
    await fs.access(DOCUMENTS_DIR);
  } catch {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  }
}

/**
 * Get the preferences file path for a document
 */
function getPreferencesPath(documentId: string): string {
  return path.join(DOCUMENTS_DIR, `${documentId}.prefs.json`);
}

/**
 * Load document preferences
 */
export async function loadDocumentPreferences(
  documentId: string
): Promise<DocumentPreferences | null> {
  await ensureDir();

  try {
    const filePath = getPreferencesPath(documentId);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as DocumentPreferences;
  } catch {
    return null;
  }
}

/**
 * Save document preferences
 */
export async function saveDocumentPreferences(
  prefs: DocumentPreferences
): Promise<void> {
  await ensureDir();

  const filePath = getPreferencesPath(prefs.documentId);
  await fs.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
}

/**
 * Create default document preferences
 */
export function createDefaultPreferences(
  documentId: string,
  baseProfileId: string | null = null
): DocumentPreferences {
  return {
    documentId,
    baseProfileId,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    editHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get or create document preferences
 */
export async function getOrCreateDocumentPreferences(
  documentId: string,
  baseProfileId: string | null = null
): Promise<DocumentPreferences> {
  const existing = await loadDocumentPreferences(documentId);
  if (existing) {
    // Update baseProfileId if changed
    if (baseProfileId !== null && existing.baseProfileId !== baseProfileId) {
      existing.baseProfileId = baseProfileId;
      existing.updatedAt = new Date().toISOString();
      await saveDocumentPreferences(existing);
    }
    return existing;
  }

  const newPrefs = createDefaultPreferences(documentId, baseProfileId);
  await saveDocumentPreferences(newPrefs);
  return newPrefs;
}

/**
 * Record an edit decision and update preferences
 */
export async function recordEditDecision(
  documentId: string,
  decision: Omit<EditDecision, 'id' | 'timestamp'>
): Promise<EditDecision> {
  const prefs = await getOrCreateDocumentPreferences(documentId);

  const fullDecision: EditDecision = {
    ...decision,
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  prefs.editHistory.push(fullDecision);

  // Keep history to a reasonable size (last 100 decisions)
  if (prefs.editHistory.length > 100) {
    prefs.editHistory = prefs.editHistory.slice(-100);
  }

  prefs.updatedAt = new Date().toISOString();
  await saveDocumentPreferences(prefs);

  return fullDecision;
}

/**
 * Update document preferences adjustments
 */
export async function updateDocumentAdjustments(
  documentId: string,
  updates: Partial<DocumentAdjustments>
): Promise<DocumentPreferences> {
  const prefs = await getOrCreateDocumentPreferences(documentId);

  prefs.adjustments = {
    ...prefs.adjustments,
    ...updates,
  };
  prefs.updatedAt = new Date().toISOString();

  await saveDocumentPreferences(prefs);
  return prefs;
}

/**
 * Merge document preferences into a global profile
 */
export async function mergeToProfile(
  documentPrefs: DocumentPreferences,
  targetProfileId: string | 'new',
  newProfileName?: string
): Promise<AudienceProfile> {
  const store = await loadPreferences();

  let profile: AudienceProfile;

  if (targetProfileId === 'new') {
    if (!newProfileName) {
      throw new Error('New profile name is required');
    }

    // Create new profile based on document preferences
    profile = {
      id: `profile-${Date.now()}`,
      name: newProfileName,
      description: `Profile created from document preferences`,
      source: 'document',
      jargonLevel: 'moderate',
      disciplineTerms: [],
      emphasisPoints: [],
      framingGuidance: [...documentPrefs.adjustments.additionalFramingGuidance],
      overrides: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Apply adjustments to base profile
    const adj = documentPrefs.adjustments;

    // Apply verbosity if adjusted
    if (adj.verbosityAdjust !== 0) {
      const verbosityLevels = ['terse', 'moderate', 'detailed'] as const;
      const baseIndex = 1; // moderate
      const newIndex = Math.max(
        0,
        Math.min(2, baseIndex + Math.round(adj.verbosityAdjust))
      );
      profile.overrides.verbosity = verbosityLevels[newIndex];
    }

    // Apply formality if adjusted
    if (adj.formalityAdjust !== 0) {
      profile.overrides.formalityLevel = Math.max(
        1,
        Math.min(5, 3 + Math.round(adj.formalityAdjust))
      );
    }

    // Apply hedging if adjusted
    if (adj.hedgingAdjust !== 0) {
      const hedgingLevels = ['confident', 'balanced', 'cautious'] as const;
      const baseIndex = 1; // balanced
      const newIndex = Math.max(
        0,
        Math.min(2, baseIndex + Math.round(adj.hedgingAdjust))
      );
      profile.overrides.hedgingStyle = hedgingLevels[newIndex];
    }

    // Add avoid words
    if (adj.additionalAvoidWords.length > 0) {
      profile.overrides.avoidWords = adj.additionalAvoidWords;
    }

    // Add preferred words
    if (Object.keys(adj.additionalPreferWords).length > 0) {
      profile.overrides.preferredWords = adj.additionalPreferWords;
    }

    // Add learned rules
    if (adj.learnedRules.length > 0) {
      profile.overrides.learnedRules = adj.learnedRules.map((r) => ({
        ...r,
        source: 'document' as const,
      }));
    }
  } else {
    // Merge into existing profile
    const existing = store.audienceProfiles.find((p) => p.id === targetProfileId);
    if (!existing) {
      throw new Error(`Profile ${targetProfileId} not found`);
    }

    profile = { ...existing };
    const adj = documentPrefs.adjustments;

    // Merge avoid words (don't duplicate)
    const existingAvoid = new Set(profile.overrides.avoidWords || []);
    adj.additionalAvoidWords.forEach((w) => existingAvoid.add(w));
    profile.overrides.avoidWords = Array.from(existingAvoid);

    // Merge preferred words (don't overwrite existing)
    profile.overrides.preferredWords = {
      ...adj.additionalPreferWords,
      ...profile.overrides.preferredWords,
    };

    // Append framing guidance
    profile.framingGuidance = [
      ...profile.framingGuidance,
      ...adj.additionalFramingGuidance.filter(
        (g) => !profile.framingGuidance.includes(g)
      ),
    ];

    // Add new learned rules
    const existingRules = new Set(
      (profile.overrides.learnedRules || []).map((r) => r.rule)
    );
    const newRules = adj.learnedRules.filter((r) => !existingRules.has(r.rule));
    profile.overrides.learnedRules = [
      ...(profile.overrides.learnedRules || []),
      ...newRules.map((r) => ({ ...r, source: 'document' as const })),
    ];

    profile.updatedAt = new Date().toISOString();
  }

  // Save the profile
  await upsertAudienceProfile(profile);
  return profile;
}

/**
 * Delete document preferences
 */
export async function deleteDocumentPreferences(
  documentId: string
): Promise<boolean> {
  try {
    const filePath = getPreferencesPath(documentId);
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear document preferences (reset to defaults but keep history)
 */
export async function clearDocumentAdjustments(
  documentId: string,
  keepHistory: boolean = true
): Promise<DocumentPreferences> {
  const prefs = await getOrCreateDocumentPreferences(documentId);

  const cleared: DocumentPreferences = {
    ...prefs,
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      // Preserve document goals - they should stay fixed for the document
      documentGoals: prefs.adjustments.documentGoals,
    },
    editHistory: keepHistory ? prefs.editHistory : [],
    updatedAt: new Date().toISOString(),
  };

  await saveDocumentPreferences(cleared);
  return cleared;
}

/**
 * Get summary statistics for document preferences
 */
export function getPreferencesSummary(prefs: DocumentPreferences): {
  hasAdjustments: boolean;
  adjustmentSummary: string[];
  editCount: number;
  acceptanceRate: number;
} {
  const adj = prefs.adjustments;
  const summary: string[] = [];

  if (adj.verbosityAdjust !== 0) {
    summary.push(
      `Verbosity: ${adj.verbosityAdjust > 0 ? '+' : ''}${adj.verbosityAdjust.toFixed(1)}`
    );
  }
  if (adj.formalityAdjust !== 0) {
    summary.push(
      `Formality: ${adj.formalityAdjust > 0 ? '+' : ''}${adj.formalityAdjust.toFixed(1)}`
    );
  }
  if (adj.hedgingAdjust !== 0) {
    summary.push(
      `Hedging: ${adj.hedgingAdjust > 0 ? '+' : ''}${adj.hedgingAdjust.toFixed(1)}`
    );
  }
  if (adj.additionalAvoidWords.length > 0) {
    summary.push(`${adj.additionalAvoidWords.length} additional words to avoid`);
  }
  if (Object.keys(adj.additionalPreferWords).length > 0) {
    summary.push(
      `${Object.keys(adj.additionalPreferWords).length} word preferences`
    );
  }
  if (adj.learnedRules.length > 0) {
    summary.push(`${adj.learnedRules.length} learned rules`);
  }

  const editCount = prefs.editHistory.length;
  const accepted = prefs.editHistory.filter((d) => d.decision === 'accepted').length;
  const partial = prefs.editHistory.filter((d) => d.decision === 'partial').length;
  const acceptanceRate = editCount > 0 ? (accepted + partial * 0.5) / editCount : 0;

  return {
    hasAdjustments: summary.length > 0,
    adjustmentSummary: summary,
    editCount,
    acceptanceRate,
  };
}
