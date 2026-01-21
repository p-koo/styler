import { NextRequest, NextResponse } from 'next/server';
import {
  loadDocumentPreferences,
  getOrCreateDocumentPreferences,
  updateDocumentAdjustments,
  mergeToProfile,
  clearDocumentAdjustments,
  getPreferencesSummary,
} from '@/memory/document-preferences';
import { getEditStats } from '@/agents/critique-agent';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import type { DocumentAdjustments, LearnedRule } from '@/types';

const CONSOLIDATION_THRESHOLD = 5;

/**
 * Auto-consolidate guidance items if they exceed threshold
 */
async function autoConsolidateGuidance(items: string[]): Promise<string[]> {
  if (items.length <= CONSOLIDATION_THRESHOLD) return items;

  try {
    const provider = await createProvider(getDefaultProviderConfig());
    const prompt = `Consolidate these writing guidance items into ${Math.min(4, Math.ceil(items.length / 2))} clear, comprehensive directives. Preserve all meaning.

Items:
${items.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Return ONLY a JSON array of consolidated strings, nothing else.`;

    const result = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      temperature: 0.3,
    });

    let content = result.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    const consolidated = JSON.parse(content);
    if (Array.isArray(consolidated) && consolidated.length > 0) {
      console.log(`[Auto-consolidate] Guidance: ${items.length} → ${consolidated.length} items`);
      return consolidated;
    }
  } catch (err) {
    console.error('Auto-consolidate guidance failed:', err);
  }
  return items;
}

/**
 * Auto-consolidate rules if they exceed threshold
 */
async function autoConsolidateRules(rules: LearnedRule[]): Promise<LearnedRule[]> {
  if (rules.length <= CONSOLIDATION_THRESHOLD) return rules;

  try {
    const provider = await createProvider(getDefaultProviderConfig());
    const prompt = `Consolidate these writing rules into ${Math.min(4, Math.ceil(rules.length / 2))} clear, comprehensive rules. Preserve all meaning.

Rules:
${rules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n')}

Return ONLY a JSON array of rule strings, nothing else.`;

    const result = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      temperature: 0.3,
    });

    let content = result.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }
    const consolidated = JSON.parse(content);
    if (Array.isArray(consolidated) && consolidated.length > 0) {
      console.log(`[Auto-consolidate] Rules: ${rules.length} → ${consolidated.length} items`);
      return consolidated.map((rule: string) => ({
        rule,
        source: 'inferred' as const,
        confidence: 0.9,
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (err) {
    console.error('Auto-consolidate rules failed:', err);
  }
  return rules;
}

/**
 * GET /api/documents/[id]/preferences
 *
 * Returns the document-specific preferences for a document.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const prefs = await loadDocumentPreferences(id);
    if (!prefs) {
      return NextResponse.json({
        exists: false,
        documentId: id,
        preferences: null,
      });
    }

    const summary = getPreferencesSummary(prefs);
    const stats = getEditStats(prefs.editHistory);

    return NextResponse.json({
      exists: true,
      documentId: id,
      preferences: prefs,
      summary,
      stats,
    });
  } catch (error) {
    console.error('Failed to get document preferences:', error);
    return NextResponse.json(
      { error: 'Failed to get document preferences' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/documents/[id]/preferences
 *
 * Updates the document-specific preferences.
 * Auto-consolidates guidance/rules if they exceed threshold.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    let { adjustments, baseProfileId } = body as {
      adjustments?: Partial<DocumentAdjustments>;
      baseProfileId?: string | null;
    };

    // Get or create preferences first
    let prefs = await getOrCreateDocumentPreferences(id, baseProfileId ?? null);

    // Update adjustments if provided
    if (adjustments) {
      // Check if we need to auto-consolidate guidance
      const newGuidance = adjustments.additionalFramingGuidance;
      if (newGuidance && newGuidance.length > CONSOLIDATION_THRESHOLD) {
        adjustments.additionalFramingGuidance = await autoConsolidateGuidance(newGuidance);
      }

      // Check if we need to auto-consolidate rules
      const newRules = adjustments.learnedRules;
      if (newRules && newRules.length > CONSOLIDATION_THRESHOLD) {
        adjustments.learnedRules = await autoConsolidateRules(newRules);
      }

      prefs = await updateDocumentAdjustments(id, adjustments);
    }

    const summary = getPreferencesSummary(prefs);
    const stats = getEditStats(prefs.editHistory);

    return NextResponse.json({
      success: true,
      preferences: prefs,
      summary,
      stats,
    });
  } catch (error) {
    console.error('Failed to update document preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update document preferences' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/documents/[id]/preferences
 *
 * Clears the document-specific preferences (resets adjustments).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const keepHistory = url.searchParams.get('keepHistory') !== 'false';

    const prefs = await clearDocumentAdjustments(id, keepHistory);
    const summary = getPreferencesSummary(prefs);
    const stats = getEditStats(prefs.editHistory);

    return NextResponse.json({
      success: true,
      preferences: prefs,
      summary,
      stats,
    });
  } catch (error) {
    console.error('Failed to clear document preferences:', error);
    return NextResponse.json(
      { error: 'Failed to clear document preferences' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[id]/preferences/merge
 *
 * Merges document preferences into a global profile.
 * This is a separate endpoint for clarity.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { targetProfileId, newProfileName, clearAfterMerge } = body as {
      targetProfileId: string | 'new';
      newProfileName?: string;
      clearAfterMerge?: boolean;
    };

    if (!targetProfileId) {
      return NextResponse.json(
        { error: 'targetProfileId is required' },
        { status: 400 }
      );
    }

    if (targetProfileId === 'new' && !newProfileName) {
      return NextResponse.json(
        { error: 'newProfileName is required when creating a new profile' },
        { status: 400 }
      );
    }

    // Load document preferences
    const prefs = await loadDocumentPreferences(id);
    if (!prefs) {
      return NextResponse.json(
        { error: 'Document preferences not found' },
        { status: 404 }
      );
    }

    // Check if there's anything to merge
    const summary = getPreferencesSummary(prefs);
    if (!summary.hasAdjustments) {
      return NextResponse.json(
        { error: 'No adjustments to merge' },
        { status: 400 }
      );
    }

    // Merge to profile
    const profile = await mergeToProfile(prefs, targetProfileId, newProfileName);

    // Optionally clear document preferences after merge
    if (clearAfterMerge) {
      await clearDocumentAdjustments(id, true);
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
      },
      mergedAdjustments: summary.adjustmentSummary,
    });
  } catch (error) {
    console.error('Failed to merge document preferences:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to merge preferences' },
      { status: 500 }
    );
  }
}
