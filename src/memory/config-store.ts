/**
 * Config Store
 *
 * Manages application configuration including API keys and advanced settings.
 * Stored in data/config.json (gitignored for security).
 */

import fs from 'fs';
import path from 'path';

// Use USER_DATA_PATH (from Electron) if available, otherwise use cwd
const BASE_PATH = process.env.USER_DATA_PATH || process.cwd();
const DATA_DIR = path.join(BASE_PATH, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export interface AppConfig {
  // API Keys
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;

  // Default provider
  defaultProvider?: 'anthropic' | 'openai' | 'ollama';

  // Advanced settings
  maxRefinementLoops: number;      // 1-5, default 3
  alignmentThreshold: number;       // 0.5-1.0, default 0.8

  // Timestamps
  updatedAt?: string;
}

const DEFAULT_CONFIG: AppConfig = {
  maxRefinementLoops: 3,
  alignmentThreshold: 0.8,
  ollamaBaseUrl: 'http://localhost:11434',
};

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file
 */
export function loadConfig(): AppConfig {
  ensureDataDir();

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const stored = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...stored };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  // Fall back to environment variables for backwards compatibility
  return {
    ...DEFAULT_CONFIG,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_CONFIG.ollamaBaseUrl,
  };
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<AppConfig>): AppConfig {
  ensureDataDir();

  const current = loadConfig();
  const updated: AppConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Get a specific config value with environment variable fallback
 */
export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  const config = loadConfig();

  // Environment variables take precedence for API keys (for CI/deployment)
  if (key === 'anthropicApiKey' && process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY as AppConfig[K];
  }
  if (key === 'openaiApiKey' && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY as AppConfig[K];
  }
  if (key === 'ollamaBaseUrl' && process.env.OLLAMA_BASE_URL) {
    return process.env.OLLAMA_BASE_URL as AppConfig[K];
  }

  return config[key];
}

/**
 * Check if any API key is configured
 */
export function hasAnyApiKey(): boolean {
  const config = loadConfig();
  return !!(
    config.anthropicApiKey ||
    config.openaiApiKey ||
    config.ollamaBaseUrl ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

/**
 * Get masked API key for display (shows last 4 chars)
 */
export function maskApiKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return '••••••••' + key.slice(-4);
}
