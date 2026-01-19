import { NextRequest, NextResponse } from 'next/server';
import { updateBaseStyle, loadPreferences } from '@/memory/preference-store';
import type { BaseStyle } from '@/types';

export async function PATCH(request: NextRequest) {
  try {
    const updates = await request.json() as Partial<BaseStyle>;
    const baseStyle = await updateBaseStyle(updates);

    return NextResponse.json({ baseStyle });
  } catch (error) {
    console.error('Error updating base style:', error);
    return NextResponse.json(
      { error: 'Failed to update base style' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const store = await loadPreferences();
    return NextResponse.json({ baseStyle: store.baseStyle });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load base style' },
      { status: 500 }
    );
  }
}
