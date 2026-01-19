/**
 * API endpoint for extracting document constraints from uploaded PDF or pasted text.
 * Uses the Constraint Extraction Agent to parse instructions (like R01 grant calls)
 * and convert them into structured document adjustments.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  extractConstraints,
  mergeConstraintsIntoAdjustments,
} from '@/agents/constraint-extraction-agent';
import {
  getOrCreateDocumentPreferences,
  saveDocumentPreferences,
} from '@/memory/document-preferences';

/**
 * POST /api/documents/[id]/extract-constraints
 * Extract constraints from provided text or PDF content
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { text, merge = true, model } = body;

    // Extract constraints using the agent
    const constraints = await extractConstraints(text, model);

    // If merge is true, merge into document preferences
    if (merge) {
      const prefs = await getOrCreateDocumentPreferences(documentId, null);

      const mergedAdjustments = mergeConstraintsIntoAdjustments(
        prefs.adjustments,
        constraints
      );

      const updatedPrefs = {
        ...prefs,
        adjustments: mergedAdjustments,
        updatedAt: new Date().toISOString(),
      };

      await saveDocumentPreferences(updatedPrefs);

      return NextResponse.json({
        success: true,
        extracted: constraints,
        merged: true,
        preferences: updatedPrefs,
      });
    }

    // Return extracted constraints without merging
    return NextResponse.json({
      success: true,
      extracted: constraints,
      merged: false,
    });
  } catch (error) {
    console.error('Constraint extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract constraints' },
      { status: 500 }
    );
  }
}
