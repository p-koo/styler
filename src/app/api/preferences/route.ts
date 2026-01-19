import { NextResponse } from 'next/server';
import { loadPreferences } from '@/memory/preference-store';

export async function GET() {
  try {
    const store = await loadPreferences();
    return NextResponse.json(store);
  } catch (error) {
    console.error('Error loading preferences:', error);
    return NextResponse.json(
      { error: 'Failed to load preferences' },
      { status: 500 }
    );
  }
}
