import { NextRequest, NextResponse } from 'next/server';
import { processMessage } from '@/agents/orchestrator';
import type { ProviderType } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, profileId, provider, sessionId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const result = await processMessage(message, {
      sessionId,
      profileId,
      provider: provider as ProviderType | undefined,
    });

    return NextResponse.json({
      message: result.response,
      sessionId: result.session.id,
      synthesizedPrompt: result.synthesizedPrompt,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
