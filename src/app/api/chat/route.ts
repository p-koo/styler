import { NextRequest, NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      context,
      contextMode,
      model,
    } = body as {
      messages: ChatMessage[];
      context: string;
      contextMode: 'general' | 'selection' | 'document';
      model?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages are required' },
        { status: 400 }
      );
    }

    console.log('[Chat API] Context mode:', contextMode);
    console.log('[Chat API] Context length:', context?.length || 0);
    console.log('[Chat API] Messages count:', messages.length);

    // Build the system prompt based on context mode
    let systemPrompt = `You are a helpful writing assistant. You provide feedback, answer questions, and offer suggestions to help improve the user's document.

IMPORTANT GUIDELINES:
1. Be concise and actionable in your responses
2. When giving feedback, be specific about what works and what could be improved
3. Consider the audience and goals described in the document profile
4. You are advisory only - you cannot directly edit the document
5. If asked to make changes, explain what changes would be beneficial and let the user implement them`;

    if (context) {
      systemPrompt += `\n\n--- CONTEXT ---\n${context}`;
    }

    // Add context mode specific instructions
    if (contextMode === 'selection') {
      systemPrompt += `\n\nThe user has selected specific sections of their document for discussion. Focus your feedback on the selected content while considering how it fits into the broader document.`;
    } else if (contextMode === 'document') {
      systemPrompt += `\n\nYou have access to the full document. Consider the overall structure, flow, and coherence when providing feedback.`;
    } else {
      systemPrompt += `\n\nYou're in general mode. Answer questions based on the document profile and general writing best practices.`;
    }

    // Build messages for the LLM
    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Get the provider and make the LLM call
    const providerConfig = getDefaultProviderConfig(model);
    const provider = await createProvider(providerConfig);

    const result = await provider.complete({
      messages: llmMessages,
      temperature: 0.7,
      maxTokens: 1000,
    });

    return NextResponse.json({
      response: result.content,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
