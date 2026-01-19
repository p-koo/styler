/**
 * Anthropic Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ProviderConfig } from '@/types';
import { LLMProvider, CompletionOptions, CompletionResult } from './base';

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    // Extract system message
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter(
      (m) => m.role !== 'system'
    );

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      stop_sequences: options.stopSequences,
    });

    const textContent = response.content.find((c) => c.type === 'text');

    return {
      content: textContent?.type === 'text' ? textContent.text : '',
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async streamComplete(
    options: CompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResult> {
    // Extract system message
    const systemMessage = options.messages.find((m) => m.role === 'system');
    const nonSystemMessages = options.messages.filter(
      (m) => m.role !== 'system'
    );

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      stop_sequences: options.stopSequences,
    });

    let content = '';
    let finishReason: 'stop' | 'length' | 'error' = 'stop';

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const text = event.delta.text;
        content += text;
        onChunk(text);
      }

      if (event.type === 'message_stop') {
        finishReason = 'stop';
      }
    }

    return { content, finishReason };
  }

  async listModels(): Promise<string[]> {
    // Anthropic doesn't have a list models endpoint
    // Return known models
    return [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
    ];
  }
}
