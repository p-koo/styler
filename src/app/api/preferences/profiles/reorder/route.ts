import { NextRequest, NextResponse } from 'next/server';
import { loadPreferences, savePreferences } from '@/memory/preference-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileIds } = body as { profileIds: string[] };

    if (!profileIds || !Array.isArray(profileIds)) {
      return NextResponse.json(
        { error: 'profileIds array is required' },
        { status: 400 }
      );
    }

    const store = await loadPreferences();

    // Create a map of profiles by ID for quick lookup
    const profileMap = new Map(store.audienceProfiles.map(p => [p.id, p]));

    // Reorder profiles based on the provided order
    const reorderedProfiles = profileIds
      .map(id => profileMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    // Add any profiles that weren't in the reorder list (shouldn't happen, but just in case)
    const reorderedIds = new Set(profileIds);
    const remainingProfiles = store.audienceProfiles.filter(p => !reorderedIds.has(p.id));

    store.audienceProfiles = [...reorderedProfiles, ...remainingProfiles];

    await savePreferences(store);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reorder profiles:', error);
    return NextResponse.json(
      { error: 'Failed to reorder profiles' },
      { status: 500 }
    );
  }
}
