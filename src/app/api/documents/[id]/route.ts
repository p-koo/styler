import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { SavedDocument } from '../route';
import { deleteDocumentPreferences } from '@/memory/document-preferences';

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

// DELETE /api/documents/[id] - Delete a document and all associated data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(DOCUMENTS_DIR, `${id}.json`);

    try {
      await fs.unlink(filePath);
      // Also delete document preferences (history, adjustments, etc.)
      await deleteDocumentPreferences(id);
      // Remove from document order
      await removeFromDocumentOrder(id);
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

// Helper to remove document from order file
async function removeFromDocumentOrder(id: string): Promise<void> {
  const orderFile = path.join(DOCUMENTS_DIR, 'document-order.json');
  try {
    const content = await fs.readFile(orderFile, 'utf-8');
    const order = JSON.parse(content);
    if (order.documentIds && Array.isArray(order.documentIds)) {
      order.documentIds = order.documentIds.filter((docId: string) => docId !== id);
      order.updatedAt = new Date().toISOString();
      await fs.writeFile(orderFile, JSON.stringify(order, null, 2), 'utf-8');
    }
  } catch {
    // Order file doesn't exist or is invalid - ignore
  }
}
