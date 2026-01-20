import { NextRequest, NextResponse } from 'next/server';
import { loadPreferences } from '@/memory/preference-store';
import { orchestrateEdit, type SyntaxMode } from '@/agents/orchestrator-agent';
import { convertToGenAlpha } from '@/agents/gen-alpha-agent';
import type { DocumentStructure } from '../analyze/route';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cells, cellIndex, instruction, profileId, documentStructure, model, documentId, syntaxMode } = body as {
      cells: string[];
      cellIndex: number;
      instruction?: string;
      profileId?: string;
      documentStructure?: DocumentStructure;
      model?: string;
      documentId?: string;
      syntaxMode?: SyntaxMode;
    };

    if (!cells || typeof cellIndex !== 'number') {
      return NextResponse.json(
        { error: 'cells array and cellIndex are required' },
        { status: 400 }
      );
    }

    const currentCell = cells[cellIndex];
    if (!currentCell) {
      return NextResponse.json(
        { error: 'Invalid cell index' },
        { status: 400 }
      );
    }

    // documentId is required for the orchestrator
    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required for edit orchestration' },
        { status: 400 }
      );
    }

    // Load preferences
    const store = await loadPreferences();
    const activeProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
      ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
      : undefined;

    // Use the orchestrator to generate the edit
    const result = await orchestrateEdit({
      cells,
      cellIndex,
      instruction,
      profileId,
      documentId,
      syntaxMode,
      documentStructure,
      model,
      baseStyle: store.baseStyle,
      audienceProfile: activeProfile,
    });

    // Check if document profile had any active adjustments
    const adj = result.documentPreferences.adjustments;
    const hasActiveDocumentProfile =
      adj.verbosityAdjust !== 0 ||
      adj.formalityAdjust !== 0 ||
      adj.hedgingAdjust !== 0 ||
      adj.additionalAvoidWords.length > 0 ||
      Object.keys(adj.additionalPreferWords).length > 0 ||
      adj.additionalFramingGuidance.length > 0 ||
      adj.learnedRules.length > 0;

    // Easter egg: Apply Gen Alpha mode if enabled
    let finalEditedText = result.editedText;
    let genAlphaApplied = false;
    if (adj.genAlphaMode) {
      try {
        finalEditedText = await convertToGenAlpha(result.editedText, model);
        genAlphaApplied = true;
      } catch (err) {
        console.error('Gen Alpha conversion failed (not very sigma):', err);
        // Fall back to regular edit if Gen Alpha fails
      }
    }

    return NextResponse.json({
      editedText: finalEditedText,
      originalText: result.originalText,
      cellIndex: result.cellIndex,
      critique: genAlphaApplied ? {
        alignmentScore: 0.69,
        predictedAcceptance: 0.42,
        issues: [{ type: 'brainrot', severity: 'major', description: 'Maximum skibidi achieved. No cap fr fr.' }],
        suggestions: ['This is bussin', 'Certified sigma moment', 'W edit no cap'],
      } : result.critique,
      iterations: result.iterations,
      convergenceHistory: result.convergenceHistory,
      documentPreferences: {
        adjustments: result.documentPreferences.adjustments,
        editCount: result.documentPreferences.editHistory.length,
        applied: hasActiveDocumentProfile,
      },
      genAlphaApplied,
    });
  } catch (error) {
    console.error('Document edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    );
  }
}
