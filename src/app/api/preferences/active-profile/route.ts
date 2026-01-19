import { NextRequest, NextResponse } from 'next/server';
import { setActiveProfile, loadPreferences } from '@/memory/preference-store';

export async function POST(request: NextRequest) {
  try {
    const { profileId } = await request.json();
    const store = await setActiveProfile(profileId || null);

    return NextResponse.json({
      activeProfileId: store.activeProfileId,
    });
  } catch (error) {
    console.error('Error setting active profile:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set profile' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const store = await loadPreferences();
    return NextResponse.json({
      activeProfileId: store.activeProfileId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get active profile' },
      { status: 500 }
    );
  }
}
