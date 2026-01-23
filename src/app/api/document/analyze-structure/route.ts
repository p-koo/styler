import { NextRequest, NextResponse } from 'next/server';
import { analyzeStructure, type CellWithMeta, type AnalysisOptions } from '@/agents/structure-agent';
import type { DocumentGoals } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      cells,
      selectedIndices,
      documentTitle,
      documentGoals,
      model,
      options,
    } = body as {
      cells: Array<{ index: number; content: string; type?: 'cell' | 'heading' }>;
      selectedIndices?: number[];
      documentTitle?: string;
      documentGoals?: DocumentGoals;
      model?: string;
      options?: AnalysisOptions;
    };

    if (!cells || !Array.isArray(cells) || cells.length === 0) {
      return NextResponse.json(
        { error: 'cells array is required' },
        { status: 400 }
      );
    }

    // Convert to CellWithMeta format
    const cellsWithMeta: CellWithMeta[] = cells.map((c, i) => ({
      index: c.index ?? i,
      content: c.content,
      type: c.type,
    }));

    const analysis = await analyzeStructure({
      cells: cellsWithMeta,
      selectedIndices,
      documentTitle,
      documentGoals,
      model,
      options,
    });

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Structure analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Structure analysis failed' },
      { status: 500 }
    );
  }
}
