/**
 * API endpoint for quick feedback on edits.
 * Directly adjusts document-specific preferences based on user feedback.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateDocumentPreferences,
  saveDocumentPreferences,
} from '@/memory/document-preferences';

type FeedbackType = 'too_long' | 'too_short' | 'too_formal' | 'too_casual' | 'too_hedged' | 'too_bold';

// How much to adjust per feedback
const ADJUSTMENT_AMOUNT = 0.5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const body = await request.json();
    const { feedback } = body as { feedback: FeedbackType };

    if (!feedback) {
      return NextResponse.json(
        { error: 'feedback is required' },
        { status: 400 }
      );
    }

    const prefs = await getOrCreateDocumentPreferences(documentId, null);
    const adj = { ...prefs.adjustments };

    // Apply adjustment based on feedback
    switch (feedback) {
      case 'too_long':
        // Make it more concise: decrease verbosity
        adj.verbosityAdjust = Math.max(-2, adj.verbosityAdjust - ADJUSTMENT_AMOUNT);
        break;
      case 'too_short':
        // Make it more detailed: increase verbosity
        adj.verbosityAdjust = Math.min(2, adj.verbosityAdjust + ADJUSTMENT_AMOUNT);
        break;
      case 'too_formal':
        // Make it more casual: decrease formality
        adj.formalityAdjust = Math.max(-2, adj.formalityAdjust - ADJUSTMENT_AMOUNT);
        break;
      case 'too_casual':
        // Make it more formal: increase formality
        adj.formalityAdjust = Math.min(2, adj.formalityAdjust + ADJUSTMENT_AMOUNT);
        break;
      case 'too_hedged':
        // Make it more confident: decrease hedging
        adj.hedgingAdjust = Math.max(-2, adj.hedgingAdjust - ADJUSTMENT_AMOUNT);
        break;
      case 'too_bold':
        // Make it more cautious: increase hedging
        adj.hedgingAdjust = Math.min(2, adj.hedgingAdjust + ADJUSTMENT_AMOUNT);
        break;
    }

    const updatedPrefs = {
      ...prefs,
      adjustments: adj,
      updatedAt: new Date().toISOString(),
    };

    await saveDocumentPreferences(updatedPrefs);

    return NextResponse.json({
      success: true,
      feedback,
      adjustments: adj,
      message: getFeedbackMessage(feedback, adj),
    });
  } catch (error) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply feedback' },
      { status: 500 }
    );
  }
}

function getFeedbackMessage(feedback: FeedbackType, adj: { verbosityAdjust: number; formalityAdjust: number; hedgingAdjust: number }): string {
  switch (feedback) {
    case 'too_long':
      return `Verbosity decreased to ${adj.verbosityAdjust.toFixed(1)}. Future edits will be more concise.`;
    case 'too_short':
      return `Verbosity increased to ${adj.verbosityAdjust.toFixed(1)}. Future edits will be more detailed.`;
    case 'too_formal':
      return `Formality decreased to ${adj.formalityAdjust.toFixed(1)}. Future edits will be more casual.`;
    case 'too_casual':
      return `Formality increased to ${adj.formalityAdjust.toFixed(1)}. Future edits will be more formal.`;
    case 'too_hedged':
      return `Hedging decreased to ${adj.hedgingAdjust.toFixed(1)}. Future edits will be more confident.`;
    case 'too_bold':
      return `Hedging increased to ${adj.hedgingAdjust.toFixed(1)}. Future edits will be more cautious.`;
  }
}
