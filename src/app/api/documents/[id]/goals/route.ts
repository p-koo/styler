import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { synthesizeGoals } from '@/agents/intent-agent';
import {
  getOrCreateDocumentPreferences,
  saveDocumentPreferences,
} from '@/memory/document-preferences';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DOCUMENTS_DIR = path.join(BASE_PATH, 'documents');

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/documents/[id]/goals
 * Analyzes the document and synthesizes its goals
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Parse request body
    let model: string | undefined;
    let clientContent: string | undefined;
    let clientTitle: string | undefined;
    try {
      const body = await request.json();
      model = body.model;
      clientContent = body.content;
      clientTitle = body.title;
    } catch {
      // No body or invalid JSON is fine
    }

    // Load the document from filesystem or use client-provided content
    let documentContent = clientContent || '';
    let documentTitle = clientTitle || 'Untitled';
    let documentType = '';

    // Try to load from filesystem if no client content provided
    if (!documentContent) {
      const filePath = path.join(DOCUMENTS_DIR, `${id}.json`);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const doc = JSON.parse(content);
        documentTitle = doc.title || 'Untitled';
        documentType = doc.structure?.documentType || '';

        // Combine all cells into document content
        if (doc.cells && Array.isArray(doc.cells)) {
          documentContent = doc.cells.map((c: { content: string }) => c.content).join('\n\n');
        }
      } catch {
        return NextResponse.json(
          { error: 'Document not found. Please save the document first or provide content.' },
          { status: 404 }
        );
      }
    }

    if (!documentContent || documentContent.trim().length < 50) {
      return NextResponse.json(
        { error: 'Document content is too short to analyze' },
        { status: 400 }
      );
    }

    // Get existing preferences
    const prefs = await getOrCreateDocumentPreferences(id, null);
    const existingGoals = prefs.adjustments.documentGoals;

    // Synthesize goals
    const goals = await synthesizeGoals({
      documentTitle,
      documentContent,
      documentType: documentType || undefined,
      existingGoals,
      model,
    });

    // Save to preferences
    prefs.adjustments.documentGoals = goals;
    prefs.updatedAt = new Date().toISOString();
    await saveDocumentPreferences(prefs);

    return NextResponse.json({
      success: true,
      goals,
    });
  } catch (error) {
    console.error('Goals synthesis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to synthesize goals' },
      { status: 500 }
    );
  }
}
