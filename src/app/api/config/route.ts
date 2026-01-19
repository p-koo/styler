import { NextRequest, NextResponse } from 'next/server';

// Common models for each provider
const AVAILABLE_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-5.1',
    'o1',
    'o1-mini',
    'o1-preview',
    'o3-mini',
  ],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ],
  ollama: [
    'llama3.2',
    'llama3.1',
    'mistral',
    'mixtral',
    'codellama',
    'phi3',
  ],
};

export async function GET() {
  // Return current configuration and available models
  const provider = process.env.OPENAI_API_KEY
    ? 'openai'
    : process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : 'ollama';

  const currentModel =
    provider === 'openai'
      ? process.env.OPENAI_MODEL || 'gpt-4o'
      : provider === 'anthropic'
      ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
      : process.env.OLLAMA_MODEL || 'llama3.2';

  return NextResponse.json({
    provider,
    currentModel,
    availableModels: AVAILABLE_MODELS[provider],
    allModels: AVAILABLE_MODELS,
  });
}
