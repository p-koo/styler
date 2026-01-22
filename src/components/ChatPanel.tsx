'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { AudienceProfile } from '@/types';

type ContextMode = 'general' | 'selection';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  profile: AudienceProfile | null;
  selectedCellsContent: string[];
  selectedCellIndices: number[];
  documentTitle: string;
}

// Store messages per document (persists across panel open/close within session)
const messagesByDocument = new Map<string, Message[]>();

export default function ChatPanel({
  isOpen,
  onClose,
  documentId,
  profile,
  selectedCellsContent,
  selectedCellIndices,
  documentTitle,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [contextMode, setContextMode] = useState<ContextMode>('general');
  const [userOverrodeMode, setUserOverrodeMode] = useState(false);
  const [alignmentProfileType, setAlignmentProfileType] = useState<'document' | 'audience'>('document');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentDocIdRef = useRef<string | null>(null);

  // Save messages when they change
  useEffect(() => {
    if (documentId && messages.length > 0) {
      messagesByDocument.set(documentId, messages);
    }
  }, [documentId, messages]);

  // Load messages when document changes
  useEffect(() => {
    if (documentId !== currentDocIdRef.current) {
      currentDocIdRef.current = documentId;
      if (documentId) {
        const savedMessages = messagesByDocument.get(documentId) || [];
        setMessages(savedMessages);
      } else {
        setMessages([]);
      }
      // Reset mode override when switching documents
      setUserOverrodeMode(false);
      setContextMode('general');
    }
  }, [documentId]);

  // Auto-switch to selection mode when cells are selected (only if user hasn't manually chosen)
  useEffect(() => {
    if (userOverrodeMode) return;

    // Only auto-switch TO selection mode when cells get selected, not away from it
    if (selectedCellsContent.length > 0 && contextMode === 'general') {
      setContextMode('selection');
    }
  }, [selectedCellsContent.length, contextMode, userOverrodeMode]);

  // Handle manual mode change
  const handleModeChange = (mode: ContextMode) => {
    setUserOverrodeMode(true);
    setContextMode(mode);
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const buildContext = useCallback(() => {
    const parts: string[] = [];

    // Always include profile if available
    if (profile) {
      parts.push(`Document Profile:
- Audience: ${profile.description}
- Jargon Level: ${profile.jargonLevel}/5
- Framing Guidance: ${profile.framingGuidance}`);
    }

    if (documentTitle) {
      parts.push(`Document Title: "${documentTitle}"`);
    }

    // Add selected content for Document Chat mode
    if (contextMode === 'selection' && selectedCellsContent.length > 0) {
      const selectionContent = selectedCellsContent.map((c, i) => `[Section ${selectedCellIndices[i] + 1}] ${c}`).join('\n\n');
      const truncatedSelection = selectionContent.length > 4000
        ? selectionContent.slice(0, 4000) + '\n\n[... selection truncated ...]'
        : selectionContent;
      parts.push(`Selected Content (${selectedCellsContent.length} section${selectedCellsContent.length > 1 ? 's' : ''}):\n${truncatedSelection}`);
    }

    return parts.join('\n\n---\n\n');
  }, [profile, documentTitle, contextMode, selectedCellsContent, selectedCellIndices]);

  // Request alignment analysis for selected cells
  const handleAnalyzeAlignment = async () => {
    if (selectedCellsContent.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);

    const profileTypeLabel = alignmentProfileType === 'document' ? 'Document Profile' : 'Audience Profile only';

    // Add a user message indicating the analysis request
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Analyze alignment for ${selectedCellsContent.length} selected section${selectedCellsContent.length > 1 ? 's' : ''} (${selectedCellIndices.map(i => i + 1).join(', ')}) against ${profileTypeLabel}`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/document/analyze-alignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: selectedCellsContent.join('\n\n'),
          profileId: profile?.id,
          documentId: alignmentProfileType === 'document' ? documentId : undefined, // Only include doc profile if selected
          profileType: alignmentProfileType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();

      // Format the analysis as a message
      const analysisContent = formatAnalysisResult(data);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: analysisContent,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Alignment analysis error:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error analyzing alignment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Format analysis result into readable text
  const formatAnalysisResult = (data: {
    alignmentScore: number;
    analysis: string;
    suggestions: string[];
    profilesUsed: { base?: string; audience?: string; document?: string; mode?: string };
  }) => {
    const scorePercent = Math.round(data.alignmentScore * 100);
    const scoreEmoji = scorePercent >= 80 ? '✅' : scorePercent >= 60 ? '⚠️' : '❌';

    let result = `**Alignment Score: ${scoreEmoji} ${scorePercent}%**\n\n`;

    // Show which profiles were used
    const profiles = [];
    if (data.profilesUsed.mode) profiles.push(`Mode: ${data.profilesUsed.mode}`);
    if (data.profilesUsed.base) profiles.push(`Base: ${data.profilesUsed.base}`);
    if (data.profilesUsed.audience) profiles.push(`Audience: ${data.profilesUsed.audience}`);
    if (data.profilesUsed.document) profiles.push(`Document adjustments: applied`);
    if (profiles.length > 0) {
      result += `*${profiles.join(' | ')}*\n\n`;
    }

    result += `**Analysis:**\n${data.analysis}\n\n`;

    if (data.suggestions && data.suggestions.length > 0) {
      result += `**Suggestions:**\n${data.suggestions.map(s => `• ${s}`).join('\n')}`;
    }

    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildContext();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          context,
          contextMode,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);

      let errorContent = 'Sorry, I encountered an error. Please try again.';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorContent = 'Request timed out. Please try again with a shorter message.';
        } else if (error.message.includes('API key')) {
          errorContent = 'API key error. Please check your settings.';
        } else if (error.message) {
          errorContent = `Error: ${error.message}`;
        }
      }

      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorContent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setUserOverrodeMode(false);
    if (documentId) {
      messagesByDocument.delete(documentId);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-96 border-l border-[var(--border)] bg-[var(--background)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="font-semibold">Chat Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="text-xs px-2 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded"
            title="Clear chat"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-xl leading-none hover:text-[var(--foreground)] text-[var(--muted-foreground)]"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Context Mode Selector */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/50">
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => handleModeChange('general')}
            className={`px-2 py-1 rounded ${
              contextMode === 'general'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'hover:bg-[var(--muted)]'
            }`}
          >
            General Chat
          </button>
          <button
            onClick={() => handleModeChange('selection')}
            className={`px-2 py-1 rounded ${
              contextMode === 'selection'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'hover:bg-[var(--muted)]'
            }`}
          >
            Document Chat {selectedCellsContent.length > 0 && `(${selectedCellsContent.length})`}
          </button>
        </div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">
          {contextMode === 'general' && 'General writing questions using your audience profile'}
          {contextMode === 'selection' && selectedCellsContent.length > 0 && `Chat about ${selectedCellsContent.length} selected section${selectedCellsContent.length > 1 ? 's' : ''}`}
          {contextMode === 'selection' && selectedCellsContent.length === 0 && (
            <span className="text-amber-600">Select cells in the document to chat about them</span>
          )}
        </div>

        {/* Alignment Score Section */}
        {contextMode === 'selection' && selectedCellsContent.length > 0 && (
          <div className="mt-2 space-y-2">
            {/* Profile Type Toggle */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[var(--muted-foreground)]">Compare against:</span>
              <button
                onClick={() => setAlignmentProfileType('document')}
                className={`px-2 py-0.5 rounded ${
                  alignmentProfileType === 'document'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[var(--muted)] hover:bg-[var(--muted)]/80'
                }`}
              >
                Document
              </button>
              <button
                onClick={() => setAlignmentProfileType('audience')}
                className={`px-2 py-0.5 rounded ${
                  alignmentProfileType === 'audience'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[var(--muted)] hover:bg-[var(--muted)]/80'
                }`}
              >
                Audience Only
              </button>
            </div>
            <button
              onClick={handleAnalyzeAlignment}
              disabled={isAnalyzing || isLoading}
              className="w-full px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  📊 Get Alignment Score
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-[var(--muted-foreground)] text-sm mt-8">
            {contextMode === 'general' ? (
              <>
                <p className="mb-2">Ask general writing questions.</p>
                <p className="text-xs">Your audience profile provides context for answers.</p>
                <p className="text-xs mt-2">Examples:</p>
                <ul className="text-xs mt-1 space-y-1">
                  <li>&ldquo;How do I write for this audience?&rdquo;</li>
                  <li>&ldquo;What tone should I use?&rdquo;</li>
                  <li>&ldquo;How technical can I be?&rdquo;</li>
                </ul>
              </>
            ) : selectedCellsContent.length === 0 ? (
              <>
                <p className="mb-2">No cells selected</p>
                <p className="text-xs">Click on cells in your document to select them, then ask questions or get alignment feedback.</p>
                <p className="text-xs mt-2 text-amber-600">Tip: Shift+click to select multiple cells</p>
              </>
            ) : (
              <>
                <p className="mb-2">Ask about your selected content.</p>
                <p className="text-xs">Examples:</p>
                <ul className="text-xs mt-1 space-y-1">
                  <li>&ldquo;Is this section clear?&rdquo;</li>
                  <li>&ldquo;How can I improve this?&rdquo;</li>
                  <li>&ldquo;Is the tone appropriate?&rdquo;</li>
                </ul>
                <p className="mt-4 text-xs text-indigo-500">
                  💡 Use &ldquo;Get Alignment Score&rdquo; above to check profile alignment.
                </p>
              </>
            )}
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                message.role === 'user'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'bg-[var(--muted)] text-[var(--foreground)]'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[var(--muted)] px-3 py-2 rounded-lg">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[var(--muted-foreground)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--border)]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading || isAnalyzing}
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--background)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || isAnalyzing}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}
