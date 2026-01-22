import { NextRequest, NextResponse } from 'next/server';
import { loadPreferences } from '@/memory/preference-store';
import {
  getOrCreateDocumentPreferences,
  saveDocumentPreferences,
} from '@/memory/document-preferences';
import { getEditStats } from '@/agents/critique-agent';
import {
  learnFromDecision,
  analyzeEditPatterns,
  learnFromExplicitFeedback,
  learnFromDiff,
} from '@/agents/learning-agent';
import type { EditDecision, EditDecisionType, CritiqueAnalysis, FeedbackCategory } from '@/types';

/**
 * POST /api/document/edit-decision
 *
 * Records a user's decision on a suggested edit and triggers learning.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      documentId,
      cellIndex,
      originalText,
      suggestedEdit,
      finalText,
      decision,
      instruction,
      critiqueAnalysis,
      profileId,
      model,
      feedback, // Explicit feedback categories from user
    } = body as {
      documentId: string;
      cellIndex: number;
      originalText: string;
      suggestedEdit: string;
      finalText: string;
      decision: EditDecisionType;
      instruction?: string;
      critiqueAnalysis?: CritiqueAnalysis;
      profileId?: string;
      model?: string;
      feedback?: FeedbackCategory[];
    };

    // Validate required fields
    if (!documentId || typeof cellIndex !== 'number' || !decision) {
      return NextResponse.json(
        { error: 'documentId, cellIndex, and decision are required' },
        { status: 400 }
      );
    }

    if (!['accepted', 'rejected', 'partial'].includes(decision)) {
      return NextResponse.json(
        { error: 'decision must be one of: accepted, rejected, partial' },
        { status: 400 }
      );
    }

    // Load preferences and document preferences
    const store = await loadPreferences();
    const activeProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
      ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
      : undefined;

    // Get or create document preferences
    let documentPrefs = await getOrCreateDocumentPreferences(
      documentId,
      activeProfile?.id || null
    );

    // Create the edit decision record
    const editDecision: EditDecision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      cellIndex,
      originalText: originalText || '',
      suggestedEdit: suggestedEdit || '',
      finalText: finalText || '',
      decision,
      instruction,
      timestamp: new Date().toISOString(),
      critiqueAnalysis,
    };

    // Learn from the decision
    const learnedInsights: string[] = [];

    try {
      // 1. If explicit feedback provided, learn from it (highest signal)
      if (feedback && feedback.length > 0) {
        documentPrefs = learnFromExplicitFeedback({
          feedback,
          documentPreferences: documentPrefs,
          suggestedEdit: suggestedEdit || '',
          userVersion: finalText || '',
          instruction,
        });
        learnedInsights.push(`Learned from explicit feedback: ${feedback.join(', ')}`);
      }

      // 2. If REJECTION with user edits, learn from diff
      // IMPORTANT: Only learn from rejections, NOT accepts
      // Accepts are contextual - the word choice was right for THAT context
      // Rejections show what the user consistently DOESN'T want
      if (decision === 'rejected' && suggestedEdit && finalText && suggestedEdit !== finalText) {
        documentPrefs = learnFromDiff({
          suggestedEdit,
          userVersion: finalText,
          documentPreferences: documentPrefs,
        });
        learnedInsights.push('Learned from word-level diff analysis (rejection)');
      }

      // 3. Standard learning from decision (LLM-based inference)
      documentPrefs = await learnFromDecision({
        decision: editDecision,
        documentPreferences: documentPrefs,
        baseStyle: store.baseStyle,
        audienceProfile: activeProfile,
        model,
      });

      // Track what was learned
      const adj = documentPrefs.adjustments;
      if (adj.verbosityAdjust !== 0) {
        learnedInsights.push(
          `Verbosity preference: ${adj.verbosityAdjust > 0 ? 'more detailed' : 'more terse'}`
        );
      }
      if (adj.formalityAdjust !== 0) {
        learnedInsights.push(
          `Formality preference: ${adj.formalityAdjust > 0 ? 'more formal' : 'less formal'}`
        );
      }
      if (adj.hedgingAdjust !== 0) {
        learnedInsights.push(
          `Hedging preference: ${adj.hedgingAdjust > 0 ? 'more cautious' : 'more confident'}`
        );
      }
      if (adj.editExamples && adj.editExamples.length > 0) {
        learnedInsights.push(`Stored ${adj.editExamples.length} edit examples`);
      }
      if (adj.diffPatterns && adj.diffPatterns.length > 0) {
        const highConfPatterns = adj.diffPatterns.filter(p => p.confidence >= 0.7);
        if (highConfPatterns.length > 0) {
          learnedInsights.push(`Detected ${highConfPatterns.length} consistent patterns`);
        }
      }

      // Save the updated preferences (with decision added to history)
      await saveDocumentPreferences(documentPrefs);
    } catch (learnError) {
      console.error('Learning from decision failed:', learnError);
      // Still record the decision even if learning fails
      documentPrefs.editHistory.push(editDecision);
      documentPrefs.updatedAt = new Date().toISOString();
      await saveDocumentPreferences(documentPrefs);
    }

    // Run pattern analysis periodically (every 5 decisions)
    if (documentPrefs.editHistory.length % 5 === 0 && documentPrefs.editHistory.length >= 5) {
      try {
        const patterns = await analyzeEditPatterns({
          decisions: documentPrefs.editHistory,
          baseStyle: store.baseStyle,
          audienceProfile: activeProfile,
          model,
        });

        if (patterns.patterns.length > 0) {
          learnedInsights.push('Patterns detected: ' + patterns.patterns.join('; '));
        }

        // Apply suggested adjustments with dampening
        if (patterns.suggestedAdjustments) {
          const suggested = patterns.suggestedAdjustments;
          const adj = documentPrefs.adjustments;

          // NOTE: We no longer auto-adjust the style sliders (verbosity, formality, hedging).
          // These are user-controlled only to prevent style drift.
          // The sliders should only change through explicit user action on the UI sliders.

          if (suggested.additionalAvoidWords) {
            adj.additionalAvoidWords = [
              ...new Set([...adj.additionalAvoidWords, ...suggested.additionalAvoidWords]),
            ].slice(0, 50);
          }
          if (suggested.additionalFramingGuidance) {
            adj.additionalFramingGuidance = [
              ...adj.additionalFramingGuidance,
              ...suggested.additionalFramingGuidance.filter(
                (g) => !adj.additionalFramingGuidance.includes(g)
              ),
            ].slice(0, 20);
          }

          documentPrefs.updatedAt = new Date().toISOString();
          await saveDocumentPreferences(documentPrefs);
        }
      } catch (patternError) {
        console.error('Pattern analysis failed:', patternError);
      }
    }

    // Get edit statistics
    const stats = getEditStats(documentPrefs.editHistory);

    return NextResponse.json({
      success: true,
      decisionId: editDecision.id,
      updatedPreferences: {
        documentId: documentPrefs.documentId,
        baseProfileId: documentPrefs.baseProfileId,
        adjustments: documentPrefs.adjustments,
        editCount: stats.total,
        acceptanceRate: stats.acceptanceRate,
      },
      learnedInsights: learnedInsights.length > 0 ? learnedInsights : undefined,
    });
  } catch (error) {
    console.error('Edit decision error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record decision' },
      { status: 500 }
    );
  }
}

/**
 * Helper to clamp a number between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
