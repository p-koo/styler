import { NextRequest, NextResponse } from 'next/server';
import { importPreferences } from '@/memory/preference-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const store = await importPreferences(body);

    return NextResponse.json({
      success: true,
      profileCount: store.audienceProfiles.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import preferences' },
      { status: 500 }
    );
  }
}
