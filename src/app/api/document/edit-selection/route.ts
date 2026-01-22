import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';
import { loadPreferences } from '@/memory/preference-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      selectedText,
      fullCellContent,
      startOffset,
      endOffset,
      instruction,
      profileId,
      model,
    } = body as {
      selectedText: string;
      fullCellContent: string;
      startOffset: number;
      endOffset: number;
      instruction: string;
      profileId?: string;
      model?: string;
    };

    if (!selectedText || !instruction) {
      return NextResponse.json(
        { error: 'selectedText and instruction are required' },
        { status: 400 }
      );
    }

    // Load preferences for profile context
    const store = await loadPreferences();
    const activeProfile = profileId
      ? store.audienceProfiles.find((p) => p.id === profileId)
      : store.activeProfileId
        ? store.audienceProfiles.find((p) => p.id === store.activeProfileId)
        : undefined;

    // Build context about the surrounding text
    const textBefore = fullCellContent.slice(0, startOffset);
    const textAfter = fullCellContent.slice(endOffset);

    // Build the system prompt
    let systemPrompt = `You are a precise text editor. Your task is to edit ONLY the selected text according to the user's instruction.

IMPORTANT RULES:
1. Output ONLY the edited version of the selected text - nothing else
2. Do not include any explanations, commentary, or markdown formatting
3. Do not include the surrounding text - only the edited selection
4. Maintain the same general length unless the instruction specifically asks for expansion or compression
5. Preserve the tone and style of the surrounding text`;

    // Add profile context if available
    if (activeProfile) {
      systemPrompt += `\n\nAudience Profile: ${activeProfile.name}`;
      if (activeProfile.description) {
        systemPrompt += `\n- Description: ${activeProfile.description}`;
      }
      if (activeProfile.jargonLevel) {
        systemPrompt += `\n- Jargon Level: ${activeProfile.jargonLevel}`;
      }
      if (activeProfile.framingGuidance && activeProfile.framingGuidance.length > 0) {
        systemPrompt += `\n- Framing: ${activeProfile.framingGuidance.join(', ')}`;
      }
    }

    // Build the user message with context
    let userMessage = `INSTRUCTION: ${instruction}

CONTEXT (for reference only, do NOT include in your response):`;

    if (textBefore) {
      userMessage += `\n\nText before selection:\n"${textBefore.slice(-200)}"${textBefore.length > 200 ? ' [truncated]' : ''}`;
    }

    userMessage += `\n\nSELECTED TEXT TO EDIT:\n"${selectedText}"`;

    if (textAfter) {
      userMessage += `\n\nText after selection:\n"${textAfter.slice(0, 200)}"${textAfter.length > 200 ? ' [truncated]' : ''}`;
    }

    userMessage += `\n\nProvide ONLY the edited version of the selected text:`;

    // Get the provider and make the LLM call
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3, // Lower temperature for more precise edits
      maxTokens: Math.max(500, selectedText.length * 3), // Allow some expansion
    });

    // Clean up the response - remove any quotes or extra whitespace
    let editedText = result.content.trim();

    // Remove surrounding quotes if present
    if ((editedText.startsWith('"') && editedText.endsWith('"')) ||
        (editedText.startsWith("'") && editedText.endsWith("'"))) {
      editedText = editedText.slice(1, -1);
    }

    // Construct the new full cell content
    const newCellContent = textBefore + editedText + textAfter;

    return NextResponse.json({
      editedSelection: editedText,
      originalSelection: selectedText,
      newCellContent,
      startOffset,
      endOffset: startOffset + editedText.length,
    });
  } catch (error) {
    console.error('Selection edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Edit failed' },
      { status: 500 }
    );
  }
}
