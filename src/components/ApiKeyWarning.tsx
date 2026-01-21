'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ApiKeyWarningProps {
  className?: string;
}

export default function ApiKeyWarning({ className = '' }: ApiKeyWarningProps) {
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkApiKey() {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          // Check if any API key is configured
          const hasKey = data.hasAnthropicKey || data.hasOpenaiKey || data.anthropicFromEnv || data.openaiFromEnv;
          setNeedsApiKey(!hasKey);
        }
      } catch (err) {
        console.error('Failed to check API config:', err);
      } finally {
        setLoading(false);
      }
    }
    checkApiKey();
  }, []);

  if (loading || !needsApiKey) {
    return null;
  }

  return (
    <div className={`bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <h3 className="font-medium text-amber-800 dark:text-amber-200">API Key Required</h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            To use Styler, you need to configure an API key for at least one LLM provider.
          </p>
          <div className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium mb-1">How to get an API key:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Anthropic (Claude):</strong> Visit <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-100">console.anthropic.com</a> → Settings → API Keys</li>
              <li><strong>OpenAI (GPT):</strong> Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-100">platform.openai.com</a> → API Keys</li>
            </ul>
          </div>
          <div className="mt-3">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Configure API Key
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
