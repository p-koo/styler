import { NextResponse } from 'next/server';
import { createProvider, getDefaultProviderConfig } from '@/providers/base';

export async function GET() {
  try {
    const config = getDefaultProviderConfig();
    const provider = await createProvider(config);

    // Get list of available models from the provider
    const models = await provider.listModels();

    return NextResponse.json({
      models,
      currentProvider: config.type,
      currentModel: config.model,
    });
  } catch (error) {
    console.error('Failed to list models:', error);

    // Return a fallback list based on provider type
    const config = getDefaultProviderConfig();
    let fallbackModels: string[] = [];

    if (config.type === 'anthropic') {
      fallbackModels = [
        'claude-sonnet-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ];
    } else if (config.type === 'openai') {
      fallbackModels = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
      ];
    } else {
      fallbackModels = ['llama3.2', 'llama3.1', 'mistral'];
    }

    return NextResponse.json({
      models: fallbackModels,
      currentProvider: config.type,
      currentModel: config.model,
      error: 'Using fallback model list',
    });
  }
}
