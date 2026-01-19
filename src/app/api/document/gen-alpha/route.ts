import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

/**
 * POST /api/document/gen-alpha
 *
 * Converts text to Gen Alpha speak. No cap fr fr.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, model } = body as {
      text: string;
      model?: string;
    };

    if (!text) {
      return NextResponse.json(
        { error: 'text is required' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a Gen Alpha translator. Convert the given text into Gen Alpha speak.

RULES - YOU MUST FOLLOW ALL OF THESE:
- Replace "good/great/amazing" with "bussin", "goated", or "hits different"
- Replace "cool" with "fire", "valid", or "slay"
- Replace "suspicious/weird" with "sus" or "giving ohio"
- Replace "charisma/charm" with "rizz"
- Replace "really/very" with "lowkey" or "highkey"
- Replace "I agree/yes/okay" with "bet", "say less", or "no cap"
- Replace "for real/seriously" with "fr fr", "ong" (on god), or "no cap"
- Replace "bad/boring" with "mid", "L", or "NPC behavior"
- Replace "good/win" situations with "W"
- Replace "authentic/honest" with "based"
- Replace "attractive person" with "has rizz" or mention their "aura"
- Add "fr fr" or "no cap" at the end of important statements
- Add "skibidi" before random nouns occasionally
- Use "gyatt" as an exclamation of surprise
- Reference "sigma" for anyone acting independently or cool
- Say "that's so ohio" for anything weird
- Use "bussin" for anything positive
- Add "brainrot" when referring to excessive content
- Use "fanum tax" when something is taken
- Reference "mewing" or "looksmaxxing" for self-improvement
- Add random "💀" or "😭" vibes to the text (as words like "dead" or "crying")
- Use "ratio" when disagreeing
- Keep the core meaning but make it unhinged Gen Alpha

IMPORTANT:
- Go HARD. Make it extremely Gen Alpha. The more brainrot the better.
- Keep roughly the same length but transform ALL the language.
- This should be barely readable by anyone over 25.

Return ONLY the transformed text. No explanations.`;

    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Convert this to Gen Alpha speak:\n\n${text}` },
      ],
      temperature: 0.9, // High creativity for maximum brainrot
    });

    return NextResponse.json({
      originalText: text,
      genAlphaText: result.content.trim(),
    });
  } catch (error) {
    console.error('Gen Alpha conversion error:', error);
    return NextResponse.json(
      { error: 'Failed to convert to Gen Alpha speak fr fr' },
      { status: 500 }
    );
  }
}
