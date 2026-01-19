import { NextResponse } from 'next/server';
import { getCompiledSystemPrompt } from '@/agents/prompt-agent';

export async function GET() {
  try {
    const systemPrompt = await getCompiledSystemPrompt();
    return NextResponse.json({ systemPrompt });
  } catch (error) {
    console.error('Error getting system prompt:', error);
    return NextResponse.json(
      { error: 'Failed to get system prompt' },
      { status: 500 }
    );
  }
}
