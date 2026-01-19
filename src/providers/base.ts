/**
 * Provider Base Interface
 *
 * Abstract interface for LLM providers (OpenAI, Anthropic, Ollama).
 */

import type { ProviderConfig, ChatMessage } from '@/types';

export interface CompletionOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface CompletionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'error';
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export abstract class LLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract complete(options: CompletionOptions): Promise<CompletionResult>;

  abstract streamComplete(
    options: CompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResult>;

  abstract listModels(): Promise<string[]>;

  get name(): string {
    return this.config.type;
  }

  get model(): string {
    return this.config.model;
  }
}

/**
 * Create a provider instance based on config
 */
export async function createProvider(
  config: ProviderConfig
): Promise<LLMProvider> {
  switch (config.type) {
    case 'openai': {
      const { OpenAIProvider } = await import('./openai');
      return new OpenAIProvider(config);
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic');
      return new AnthropicProvider(config);
    }
    case 'ollama': {
      const { OllamaProvider } = await import('./ollama');
      return new OllamaProvider(config);
    }
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Get default provider config from environment
 * @param modelOverride - Optional model to use instead of the default
 */
export function getDefaultProviderConfig(modelOverride?: string): ProviderConfig {
  // Check for API keys in environment
  if (process.env.OPENAI_API_KEY) {
    return {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: modelOverride || process.env.OPENAI_MODEL || 'gpt-4o',
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: modelOverride || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    };
  }

  // Fall back to Ollama
  return {
    type: 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: modelOverride || process.env.OLLAMA_MODEL || 'llama3.2',
  };
}
