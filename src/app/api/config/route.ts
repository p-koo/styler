/**
 * Config API
 *
 * GET - Retrieve current configuration (API keys masked)
 * PATCH - Update configuration
 */

import { NextResponse } from 'next/server';
import { loadConfig, saveConfig, maskApiKey, type AppConfig } from '@/memory/config-store';

// Common models for each provider
const AVAILABLE_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
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
  try {
    const config = loadConfig();

    // Determine active provider based on available keys
    const provider = (config.anthropicApiKey || process.env.ANTHROPIC_API_KEY)
      ? 'anthropic'
      : (config.openaiApiKey || process.env.OPENAI_API_KEY)
      ? 'openai'
      : 'ollama';

    const currentModel =
      provider === 'anthropic'
        ? process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
        : provider === 'openai'
        ? process.env.OPENAI_MODEL || 'gpt-4o'
        : process.env.OLLAMA_MODEL || 'llama3.2';

    // Return config with masked API keys for security
    const safeConfig = {
      // Model info (existing functionality)
      provider,
      currentModel,
      availableModels: AVAILABLE_MODELS[provider],
      allModels: AVAILABLE_MODELS,

      // Settings
      maxRefinementLoops: config.maxRefinementLoops,
      alignmentThreshold: config.alignmentThreshold,
      ollamaBaseUrl: config.ollamaBaseUrl,
      defaultProvider: config.defaultProvider,

      // Masked API keys
      anthropicApiKey: maskApiKey(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
      openaiApiKey: maskApiKey(config.openaiApiKey || process.env.OPENAI_API_KEY),

      // Flags to indicate if keys are set
      hasAnthropicKey: !!config.anthropicApiKey || !!process.env.ANTHROPIC_API_KEY,
      hasOpenaiKey: !!config.openaiApiKey || !!process.env.OPENAI_API_KEY,
      hasOllamaUrl: !!config.ollamaBaseUrl,

      // Flags for env-based keys (read-only)
      anthropicFromEnv: !!process.env.ANTHROPIC_API_KEY,
      openaiFromEnv: !!process.env.OPENAI_API_KEY,

      updatedAt: config.updatedAt,
    };

    return NextResponse.json(safeConfig);
  } catch (error) {
    console.error('Error loading config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const updates = await request.json() as Partial<AppConfig>;

    // Validate numeric fields
    if (updates.maxRefinementLoops !== undefined) {
      const loops = Number(updates.maxRefinementLoops);
      if (isNaN(loops) || loops < 1 || loops > 5) {
        return NextResponse.json(
          { error: 'maxRefinementLoops must be between 1 and 5' },
          { status: 400 }
        );
      }
      updates.maxRefinementLoops = loops;
    }

    if (updates.alignmentThreshold !== undefined) {
      const threshold = Number(updates.alignmentThreshold);
      if (isNaN(threshold) || threshold < 0.5 || threshold > 1.0) {
        return NextResponse.json(
          { error: 'alignmentThreshold must be between 0.5 and 1.0' },
          { status: 400 }
        );
      }
      updates.alignmentThreshold = threshold;
    }

    // Don't allow overwriting env-based keys with empty values
    if (updates.anthropicApiKey === '' && process.env.ANTHROPIC_API_KEY) {
      delete updates.anthropicApiKey;
    }
    if (updates.openaiApiKey === '' && process.env.OPENAI_API_KEY) {
      delete updates.openaiApiKey;
    }

    const saved = saveConfig(updates);

    // Return with masked keys
    return NextResponse.json({
      success: true,
      maxRefinementLoops: saved.maxRefinementLoops,
      alignmentThreshold: saved.alignmentThreshold,
      ollamaBaseUrl: saved.ollamaBaseUrl,
      anthropicApiKey: maskApiKey(saved.anthropicApiKey),
      openaiApiKey: maskApiKey(saved.openaiApiKey),
      hasAnthropicKey: !!saved.anthropicApiKey || !!process.env.ANTHROPIC_API_KEY,
      hasOpenaiKey: !!saved.openaiApiKey || !!process.env.OPENAI_API_KEY,
      hasOllamaUrl: !!saved.ollamaBaseUrl,
    });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
