import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DOCUMENTS_DIR = path.join(BASE_PATH, 'documents');

// Ensure documents directory exists
async function ensureDir() {
  try {
    await fs.access(DOCUMENTS_DIR);
  } catch {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  }
}

export interface SavedDocument {
  id: string;
  title: string;
  cells: Array<{
    id: string;
    index: number;
    content: string;
    type?: 'cell' | 'heading';
  }>;
  structure?: {
    title: string;
    documentType: string;
    sections: Array<{
      id: string;
      name: string;
      type: string;
      startCell: number;
      endCell: number;
      purpose: string;
    }>;
    keyTerms: string[];
    mainArgument: string;
  };
  selectedProfileId?: string | null;  // Remember which profile was selected for this document
  syntaxMode?: 'plain' | 'markdown' | 'latex';  // Syntax highlighting mode
  // Separate custom instructions for each edit mode
  stylerInstruction?: string;  // Custom instruction for Styler Edit (single-cell)
  vibeGuidance?: string;       // Custom guidance for Vibe Edit (document-level)
  vibeSelectedPresets?: string[]; // Selected vibe presets
  createdAt: string;
  updatedAt: string;
}

// GET /api/documents - List all documents
export async function GET() {
  try {
    await ensureDir();

    const files = await fs.readdir(DOCUMENTS_DIR);
    // Filter for document JSON files, excluding preferences files
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.prefs.json'));

    const documents: Array<{
      id: string;
      title: string;
      cellCount: number;
      updatedAt: string;
    }> = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(DOCUMENTS_DIR, file), 'utf-8');
        const doc = JSON.parse(content) as SavedDocument;
        documents.push({
          id: doc.id,
          title: doc.title,
          cellCount: doc.cells?.length || 0,
          updatedAt: doc.updatedAt || doc.createdAt,
        });
      } catch (e) {
        // Skip invalid files
        console.error(`Failed to read document ${file}:`, e);
      }
    }

    // Sort by updatedAt, most recent first
    documents.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Failed to list documents:', error);
    return NextResponse.json(
      { error: 'Failed to list documents' },
      { status: 500 }
    );
  }
}

// POST /api/documents - Save a document
export async function POST(request: NextRequest) {
  try {
    await ensureDir();

    const body = await request.json();
    const { id, title, cells, structure, selectedProfileId, syntaxMode, stylerInstruction, vibeGuidance, vibeSelectedPresets } = body;

    if (!id || !title) {
      return NextResponse.json(
        { error: 'id and title are required' },
        { status: 400 }
      );
    }

    const filePath = path.join(DOCUMENTS_DIR, `${id}.json`);

    // Check if document exists to preserve createdAt
    let createdAt = new Date().toISOString();
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const existingDoc = JSON.parse(existing) as SavedDocument;
      createdAt = existingDoc.createdAt || createdAt;
    } catch {
      // New document
    }

    const document: SavedDocument = {
      id,
      title,
      cells: cells || [],
      structure,
      selectedProfileId: selectedProfileId ?? null,
      syntaxMode: syntaxMode || 'plain',
      stylerInstruction: stylerInstruction || '',
      vibeGuidance: vibeGuidance || '',
      vibeSelectedPresets: vibeSelectedPresets || [],
      createdAt,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(filePath, JSON.stringify(document, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
      }
    });
  } catch (error) {
    console.error('Failed to save document:', error);
    return NextResponse.json(
      { error: 'Failed to save document' },
      { status: 500 }
    );
  }
}
