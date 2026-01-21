import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { upsertAudienceProfile, loadPreferences } from '@/memory/preference-store';
import type { AudienceProfile } from '@/types';

interface CreateProfileRequest {
  name: string;
  description: string;
  sampleText?: string; // The pasted preference/style guide
  model?: string;
  importedProfile?: AudienceProfile; // Pre-built profile from JSON import
}

const PROFILE_OPTIMIZATION_PROMPT = `You are an expert at analyzing writing style preferences and creating audience profile configurations.

Given a sample text that describes writing preferences for a specific audience or publication, extract and optimize the settings for an audience profile.

The profile should include:
1. **jargonLevel**: "minimal" (accessible to general readers), "moderate" (some technical terms), or "heavy" (specialist audience)
2. **disciplineTerms**: Array of domain-specific terms that should be used
3. **emphasisPoints**: What aspects to emphasize (e.g., "broader impacts", "clinical relevance", "statistical rigor")
4. **framingGuidance**: Array of guidance strings for how to frame content
5. **lengthGuidance**: { target: "concise" | "standard" | "comprehensive", maxWords?: number }
6. **overrides**: Partial style overrides including:
   - verbosity: "terse" | "moderate" | "detailed"
   - formalityLevel: 1-5 (1=casual, 5=very formal)
   - hedgingStyle: "confident" | "balanced" | "cautious"
   - activeVoicePreference: 0-1 (preference for active voice)
   - formatBans: string[] (formats to avoid)
   - avoidWords: string[] (words/phrases to avoid)

Respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "jargonLevel": "minimal" | "moderate" | "heavy",
  "disciplineTerms": ["term1", "term2"],
  "emphasisPoints": ["point1", "point2"],
  "framingGuidance": ["guidance1", "guidance2"],
  "lengthGuidance": { "target": "concise" | "standard" | "comprehensive" },
  "overrides": {
    "verbosity": "terse" | "moderate" | "detailed",
    "formalityLevel": 1-5,
    "hedgingStyle": "confident" | "balanced" | "cautious"
  }
}`;

// POST /api/preferences/profiles - Create a new profile with LLM optimization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateProfileRequest;
    const { name, description, sampleText, model, importedProfile } = body;

    // Handle importing a pre-built profile
    if (importedProfile) {
      const profile: AudienceProfile = {
        ...importedProfile,
        // Ensure required fields
        id: importedProfile.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: importedProfile.name || name || 'Imported Profile',
        description: importedProfile.description || description || '',
        source: 'manual',
        jargonLevel: importedProfile.jargonLevel || 'moderate',
        disciplineTerms: importedProfile.disciplineTerms || [],
        emphasisPoints: importedProfile.emphasisPoints || [],
        framingGuidance: importedProfile.framingGuidance || [],
        overrides: importedProfile.overrides || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await upsertAudienceProfile(profile);

      return NextResponse.json({
        profile,
        imported: true,
      });
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }

    let profileSettings: Partial<AudienceProfile> = {
      jargonLevel: 'moderate',
      disciplineTerms: [],
      emphasisPoints: [],
      framingGuidance: [],
      lengthGuidance: { target: 'standard' },
      overrides: {},
    };

    // If sample text provided, use LLM to optimize
    if (sampleText?.trim()) {
      try {
        const providerConfig = getDefaultProviderConfig(model);
        const provider = await createProvider(providerConfig);

        const result = await provider.complete({
          messages: [
            { role: 'system', content: PROFILE_OPTIMIZATION_PROMPT },
            { role: 'user', content: `Analyze this writing preference description and create an optimized profile:\n\n${sampleText}` },
          ],
          temperature: 0.3,
        });

        // Parse the JSON response
        let jsonStr = result.content.trim();

        // Remove markdown code blocks if present
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(jsonStr);

        // Validate and merge parsed settings
        if (parsed.jargonLevel && ['minimal', 'moderate', 'heavy'].includes(parsed.jargonLevel)) {
          profileSettings.jargonLevel = parsed.jargonLevel;
        }
        if (Array.isArray(parsed.disciplineTerms)) {
          profileSettings.disciplineTerms = parsed.disciplineTerms.filter((t: unknown) => typeof t === 'string');
        }
        if (Array.isArray(parsed.emphasisPoints)) {
          profileSettings.emphasisPoints = parsed.emphasisPoints.filter((t: unknown) => typeof t === 'string');
        }
        if (Array.isArray(parsed.framingGuidance)) {
          profileSettings.framingGuidance = parsed.framingGuidance.filter((t: unknown) => typeof t === 'string');
        }
        if (parsed.lengthGuidance?.target) {
          profileSettings.lengthGuidance = {
            target: parsed.lengthGuidance.target,
            maxWords: parsed.lengthGuidance.maxWords,
          };
        }
        if (parsed.overrides && typeof parsed.overrides === 'object') {
          profileSettings.overrides = {};
          if (parsed.overrides.verbosity && ['terse', 'moderate', 'detailed'].includes(parsed.overrides.verbosity)) {
            profileSettings.overrides.verbosity = parsed.overrides.verbosity;
          }
          if (typeof parsed.overrides.formalityLevel === 'number') {
            profileSettings.overrides.formalityLevel = Math.min(5, Math.max(1, parsed.overrides.formalityLevel));
          }
          if (parsed.overrides.hedgingStyle && ['confident', 'balanced', 'cautious'].includes(parsed.overrides.hedgingStyle)) {
            profileSettings.overrides.hedgingStyle = parsed.overrides.hedgingStyle;
          }
          if (typeof parsed.overrides.activeVoicePreference === 'number') {
            profileSettings.overrides.activeVoicePreference = Math.min(1, Math.max(0, parsed.overrides.activeVoicePreference));
          }
          if (Array.isArray(parsed.overrides.formatBans)) {
            profileSettings.overrides.formatBans = parsed.overrides.formatBans.filter((t: unknown) => typeof t === 'string');
          }
          if (Array.isArray(parsed.overrides.avoidWords)) {
            profileSettings.overrides.avoidWords = parsed.overrides.avoidWords.filter((t: unknown) => typeof t === 'string');
          }
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError);
        // Continue with default settings if parsing fails
      }
    }

    // Create the full profile
    const now = new Date().toISOString();
    const profile: AudienceProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      description: description?.trim() || '',
      source: 'manual',
      jargonLevel: profileSettings.jargonLevel as 'minimal' | 'moderate' | 'heavy',
      disciplineTerms: profileSettings.disciplineTerms || [],
      emphasisPoints: profileSettings.emphasisPoints || [],
      framingGuidance: profileSettings.framingGuidance || [],
      lengthGuidance: profileSettings.lengthGuidance,
      overrides: profileSettings.overrides || {},
      createdAt: now,
      updatedAt: now,
    };

    // Save the profile
    await upsertAudienceProfile(profile);

    return NextResponse.json({
      profile,
      optimized: !!sampleText?.trim(),
    });
  } catch (error) {
    console.error('Failed to create profile:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create profile' },
      { status: 500 }
    );
  }
}

// GET /api/preferences/profiles - List all profiles
export async function GET() {
  try {
    const store = await loadPreferences();
    return NextResponse.json({ profiles: store.audienceProfiles });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load profiles' },
      { status: 500 }
    );
  }
}
