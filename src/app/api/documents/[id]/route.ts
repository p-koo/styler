import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SavedDocument } from '../route';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DOCUMENTS_DIR = path.join(BASE_PATH, 'documents');

// GET /api/documents/[id] - Get a single document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(DOCUMENTS_DIR, `${id}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const document = JSON.parse(content) as SavedDocument;
      return NextResponse.json({ document });
    } catch {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Failed to get document:', error);
    return NextResponse.json(
      { error: 'Failed to get document' },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id] - Delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(DOCUMENTS_DIR, `${id}.json`);

    try {
      await fs.unlink(filePath);
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Failed to delete document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
