import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DOCUMENTS_DIR = path.join(BASE_PATH, 'documents');
const ORDER_FILE = path.join(DOCUMENTS_DIR, 'document-order.json');

// Ensure documents directory exists
async function ensureDir() {
  try {
    await fs.access(DOCUMENTS_DIR);
  } catch {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  }
}

// GET /api/documents/order - Get document order
export async function GET() {
  try {
    await ensureDir();

    try {
      const content = await fs.readFile(ORDER_FILE, 'utf-8');
      const order = JSON.parse(content);
      return NextResponse.json({ order: order.documentIds || [] });
    } catch {
      // No order file yet
      return NextResponse.json({ order: [] });
    }
  } catch (error) {
    console.error('Failed to get document order:', error);
    return NextResponse.json(
      { error: 'Failed to get document order' },
      { status: 500 }
    );
  }
}

// POST /api/documents/order - Save document order
export async function POST(request: NextRequest) {
  try {
    await ensureDir();

    const body = await request.json();
    const { documentIds } = body;

    if (!Array.isArray(documentIds)) {
      return NextResponse.json(
        { error: 'documentIds must be an array' },
        { status: 400 }
      );
    }

    await fs.writeFile(
      ORDER_FILE,
      JSON.stringify({ documentIds, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save document order:', error);
    return NextResponse.json(
      { error: 'Failed to save document order' },
      { status: 500 }
    );
  }
}
