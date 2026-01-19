/**
 * OpenAI Provider
 */

import OpenAI from 'openai';
import type { ProviderConfig } from '@/types';
import { LLMProvider, CompletionOptions, CompletionResult } from './base';

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);

    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  // Check if model uses max_completion_tokens instead of max_tokens
  // o1, o3, and gpt-5+ models use the new parameter
  private usesCompletionTokens(): boolean {
    const model = this.config.model.toLowerCase();
    return (
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('gpt-5') ||
      model.startsWith('gpt-6')
    );
  }

  // Check if model is a reasoning model that doesn't support temperature
  private isReasoningModel(): boolean {
    const model = this.config.model.toLowerCase();
    return model.startsWith('o1') || model.startsWith('o3');
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const maxTokens = options.maxTokens || this.config.maxTokens || 4096;
    const usesNewParam = this.usesCompletionTokens();
    const isReasoning = this.isReasoningModel();

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: options.messages,
      ...(usesNewParam
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      // Reasoning models (o1/o3) don't support temperature
      ...(isReasoning ? {} : { temperature: options.temperature ?? this.config.temperature ?? 0.7 }),
      stop: options.stopSequences,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content || '',
      finishReason: choice.finish_reason === 'stop' ? 'stop' : 'length',
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async streamComplete(
    options: CompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResult> {
    const maxTokens = options.maxTokens || this.config.maxTokens || 4096;
    const usesNewParam = this.usesCompletionTokens();
    const isReasoning = this.isReasoningModel();

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: options.messages,
      ...(usesNewParam
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
      ...(isReasoning ? {} : { temperature: options.temperature ?? this.config.temperature ?? 0.7 }),
      stop: options.stopSequences,
      stream: true,
    });

    let content = '';
    let finishReason: 'stop' | 'length' | 'error' = 'stop';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        content += delta;
        onChunk(delta);
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason =
          chunk.choices[0].finish_reason === 'stop' ? 'stop' : 'length';
      }
    }

    return { content, finishReason };
  }

  async listModels(): Promise<string[]> {
    const response = await this.client.models.list();
    return response.data
      .filter((m) => m.id.includes('gpt'))
      .map((m) => m.id)
      .sort();
  }
}
