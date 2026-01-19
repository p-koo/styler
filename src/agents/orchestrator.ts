/**
 * Orchestrator
 *
 * Main coordination logic that routes requests through agents and manages
 * the conversation flow.
 */

import type {
  ChatMessage,
  ChatSession,
  ProviderType,
  ProviderConfig,
} from '@/types';
import { createProvider, getDefaultProviderConfig, LLMProvider } from '@/providers/base';
import { buildMessages, getCompiledSystemPrompt } from './prompt-agent';
import { loadPreferences, setActiveProfile } from '@/memory/preference-store';

// In-memory session storage (could be persisted later)
const sessions = new Map<string, ChatSession>();

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create or get a chat session
 */
export function getOrCreateSession(
  sessionId?: string,
  provider?: ProviderType
): ChatSession {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const newSession: ChatSession = {
    id: sessionId || generateId(),
    messages: [],
    activeProfileId: null,
    provider: provider || 'openai',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  sessions.set(newSession.id, newSession);
  return newSession;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): ChatSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Process a chat message
 */
export async function processMessage(
  message: string,
  options: {
    sessionId?: string;
    profileId?: string;
    provider?: ProviderType;
    providerConfig?: ProviderConfig;
    stream?: boolean;
    onChunk?: (chunk: string) => void;
  } = {}
): Promise<{
  response: ChatMessage;
  session: ChatSession;
  synthesizedPrompt: string;
}> {
  // Get or create session
  const session = getOrCreateSession(options.sessionId, options.provider);

  // Set active profile if specified
  if (options.profileId !== undefined) {
    await setActiveProfile(options.profileId);
    session.activeProfileId = options.profileId;
  }

  // Create user message
  const userMessage: ChatMessage = {
    id: generateId(),
    role: 'user',
    content: message,
    timestamp: new Date(),
  };

  session.messages.push(userMessage);

  // Build conversation history (exclude system messages)
  const history = session.messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1) // Exclude the message we just added
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Build messages with system prompt
  const messages = await buildMessages(message, history);
  const synthesizedPrompt = messages[0].content; // System prompt

  // Get provider
  const providerConfig = options.providerConfig || getDefaultProviderConfig();
  if (options.provider) {
    providerConfig.type = options.provider;
  }

  const provider = await createProvider(providerConfig);

  // Call LLM
  let responseContent: string;

  if (options.stream && options.onChunk) {
    const result = await provider.streamComplete(
      { messages },
      options.onChunk
    );
    responseContent = result.content;
  } else {
    const result = await provider.complete({ messages });
    responseContent = result.content;
  }

  // Create assistant message
  const assistantMessage: ChatMessage = {
    id: generateId(),
    role: 'assistant',
    content: responseContent,
    timestamp: new Date(),
    synthesizedPrompt,
    profileUsed: session.activeProfileId || undefined,
  };

  session.messages.push(assistantMessage);
  session.updatedAt = new Date();

  return {
    response: assistantMessage,
    session,
    synthesizedPrompt,
  };
}

/**
 * Switch active profile for a session
 */
export async function switchProfile(
  sessionId: string,
  profileId: string | null
): Promise<ChatSession> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  await setActiveProfile(profileId);
  session.activeProfileId = profileId;
  session.updatedAt = new Date();

  return session;
}

/**
 * Get the current system prompt (for transparency)
 */
export async function getCurrentSystemPrompt(): Promise<string> {
  return getCompiledSystemPrompt();
}

/**
 * Clear a session
 */
export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get all active sessions
 */
export function getAllSessions(): ChatSession[] {
  return Array.from(sessions.values());
}

/**
 * Process message with available provider (tries in order: configured > openai > anthropic > ollama)
 */
export async function processWithBestProvider(
  message: string,
  options: {
    sessionId?: string;
    profileId?: string;
    stream?: boolean;
    onChunk?: (chunk: string) => void;
  } = {}
): Promise<{
  response: ChatMessage;
  session: ChatSession;
  synthesizedPrompt: string;
  providerUsed: ProviderType;
}> {
  // Determine which provider to use based on available API keys
  let providerConfig = getDefaultProviderConfig();
  let providerUsed = providerConfig.type;

  try {
    const result = await processMessage(message, {
      ...options,
      providerConfig,
    });

    return {
      ...result,
      providerUsed,
    };
  } catch (err) {
    // If configured provider fails, try others
    const fallbackOrder: ProviderType[] = ['openai', 'anthropic', 'ollama'];
    const remaining = fallbackOrder.filter((p) => p !== providerUsed);

    for (const provider of remaining) {
      try {
        const config = getProviderConfigFor(provider);
        if (!config) continue;

        const result = await processMessage(message, {
          ...options,
          providerConfig: config,
        });

        return {
          ...result,
          providerUsed: provider,
        };
      } catch {
        continue;
      }
    }

    throw err;
  }
}

/**
 * Get provider config for a specific provider type
 */
function getProviderConfigFor(type: ProviderType): ProviderConfig | null {
  switch (type) {
    case 'openai':
      if (process.env.OPENAI_API_KEY) {
        return {
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4o',
        };
      }
      break;
    case 'anthropic':
      if (process.env.ANTHROPIC_API_KEY) {
        return {
          type: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        };
      }
      break;
    case 'ollama':
      return {
        type: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama3.2',
      };
  }

  return null;
}
