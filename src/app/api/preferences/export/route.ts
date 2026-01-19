import { NextResponse } from 'next/server';
import { loadPreferences } from '@/memory/preference-store';

export async function GET() {
  try {
    const store = await loadPreferences();
    return NextResponse.json(store);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to export preferences' },
      { status: 500 }
    );
  }
}
