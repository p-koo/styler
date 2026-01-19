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
import type { DocumentAdjustments } from '@/types';

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
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { adjustments, baseProfileId } = body as {
      adjustments?: Partial<DocumentAdjustments>;
      baseProfileId?: string | null;
    };

    // Get or create preferences first
    let prefs = await getOrCreateDocumentPreferences(id, baseProfileId ?? null);

    // Update adjustments if provided
    if (adjustments) {
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
