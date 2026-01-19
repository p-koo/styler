import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { upsertAudienceProfile } from '@/memory/preference-store';
import type { AudienceProfile } from '@/types';

const STYLE_ANALYSIS_PROMPT = `You are an expert at analyzing writing style and creating audience profile configurations.

Given a document sample, analyze its writing style and extract settings for an audience profile that would help reproduce this style.

Analyze:
1. Technical level and jargon usage
2. Sentence structure and complexity
3. Tone and formality
4. Voice (active vs passive)
5. Common phrases and terminology
6. Formatting patterns

The profile should include:
1. **jargonLevel**: "minimal" (accessible to general readers), "moderate" (some technical terms), or "heavy" (specialist audience)
2. **disciplineTerms**: Array of domain-specific terms found in the document
3. **emphasisPoints**: What aspects the writing emphasizes
4. **framingGuidance**: Array of guidance strings for how content is framed
5. **lengthGuidance**: { target: "concise" | "standard" | "comprehensive" }
6. **overrides**: Style settings including:
   - verbosity: "terse" | "moderate" | "detailed"
   - formalityLevel: 1-5 (1=casual, 5=very formal)
   - hedgingStyle: "confident" | "balanced" | "cautious"
   - activeVoicePreference: 0-1 (preference for active voice)

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
    "hedgingStyle": "confident" | "balanced" | "cautious",
    "activeVoicePreference": 0-1
  }
}`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Profile name is required' },
        { status: 400 }
      );
    }

    // Extract text from the file
    let documentText = '';
    const fileType = file.type || file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'application/pdf' || file.name.endsWith('.pdf')) {
      // Parse PDF
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfData = await pdfParse(buffer);
      documentText = pdfData.text;
    } else if (
      fileType === 'text/plain' ||
      fileType === 'text/markdown' ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md')
    ) {
      documentText = await file.text();
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      // For DOCX, we'll extract raw text (basic approach)
      // A more robust solution would use mammoth.js
      const text = await file.text();
      // Try to extract readable content from XML
      documentText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (documentText.length < 100) {
        return NextResponse.json(
          { error: 'Could not extract text from DOCX. Try converting to PDF or TXT first.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType}. Please upload PDF, TXT, or MD files.` },
        { status: 400 }
      );
    }

    if (!documentText || documentText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract enough text from the document' },
        { status: 400 }
      );
    }

    // Truncate to reasonable size for LLM analysis (first ~4000 chars)
    const sampleText = documentText.slice(0, 4000);

    // Analyze with LLM
    let profileSettings: Partial<AudienceProfile> = {
      jargonLevel: 'moderate',
      disciplineTerms: [],
      emphasisPoints: [],
      framingGuidance: [],
      lengthGuidance: { target: 'standard' },
      overrides: {},
    };

    try {
      const providerConfig = getDefaultProviderConfig();
      const provider = await createProvider(providerConfig);

      const result = await provider.complete({
        messages: [
          { role: 'system', content: STYLE_ANALYSIS_PROMPT },
          { role: 'user', content: `Analyze the writing style of this document and create a profile:\n\n${sampleText}` },
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
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      // Continue with default settings if parsing fails
    }

    // Create the full profile
    const now = new Date().toISOString();
    const profile: AudienceProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      description: description?.trim() || `Style extracted from ${file.name}`,
      source: 'document',
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
      extractedChars: documentText.length,
    });
  } catch (error) {
    console.error('Failed to analyze document:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze document' },
      { status: 500 }
    );
  }
}
