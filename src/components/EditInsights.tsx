'use client';

import { useState } from 'react';

// Types matching orchestrator
interface AgentTraceEntry {
  agent: 'intent' | 'prompt' | 'llm' | 'critique';
  timestamp: number;
  durationMs: number;
  summary: string;
  details?: Record<string, unknown>;
}

interface ConvergenceEntry {
  attempt: number;
  alignmentScore: number;
  adjustmentsMade: string[];
}

interface EditInsightsProps {
  convergenceHistory: ConvergenceEntry[];
  agentTrace: AgentTraceEntry[];
  iterations: number;
}

// Agent display names and colors
const AGENT_CONFIG: Record<AgentTraceEntry['agent'], { name: string; color: string; bgColor: string; icon: string }> = {
  intent: { name: 'Intent', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: '🎯' },
  prompt: { name: 'Prompt', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: '📝' },
  llm: { name: 'LLM', color: 'text-green-600', bgColor: 'bg-green-100', icon: '🤖' },
  critique: { name: 'Critique', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: '⚖️' },
};

/**
 * Visual display of edit alignment scores and agent activity
 */
export default function EditInsights({ convergenceHistory, agentTrace, iterations }: EditInsightsProps) {
  const [expanded, setExpanded] = useState(false);

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Calculate total duration
  const totalDuration = agentTrace.reduce((sum, t) => sum + t.durationMs, 0);

  // Group trace by attempt
  const traceByAttempt: Map<number, AgentTraceEntry[]> = new Map();
  for (const entry of agentTrace) {
    const attempt = (entry.details?.attempt as number) || 1;
    if (!traceByAttempt.has(attempt)) {
      traceByAttempt.set(attempt, []);
    }
    traceByAttempt.get(attempt)!.push(entry);
  }

  // Intent is not per-attempt, add it to attempt 0 for display
  const intentTrace = agentTrace.find(t => t.agent === 'intent');

  return (
    <div className="space-y-2">
      {/* Compact summary - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors w-full"
      >
        {/* Score progression mini-viz */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide opacity-70">Score:</span>
          <div className="flex items-center gap-0.5">
            {convergenceHistory.map((entry, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${getScoreColor(entry.alignmentScore)} flex items-center justify-center`}
                title={`Attempt ${entry.attempt}: ${Math.round(entry.alignmentScore * 100)}%`}
              >
                <span className="text-[8px] text-white font-bold">
                  {Math.round(entry.alignmentScore * 10)}
                </span>
              </div>
            ))}
          </div>
          {convergenceHistory.length > 0 && (
            <span className="font-medium">
              {Math.round(convergenceHistory[convergenceHistory.length - 1].alignmentScore * 100)}%
            </span>
          )}
        </div>

        {/* Iteration count */}
        {iterations > 1 && (
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">
            {iterations} iterations
          </span>
        )}

        {/* Duration */}
        <span className="text-[10px] opacity-70">
          {(totalDuration / 1000).toFixed(1)}s
        </span>

        {/* Expand indicator */}
        <span className="ml-auto opacity-50">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 bg-[var(--muted)]/30 rounded-lg space-y-4 text-sm">
          {/* Score Progression Chart */}
          {convergenceHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">
                Alignment Score Progression
              </h4>
              <div className="flex items-end gap-2 h-16">
                {convergenceHistory.map((entry, i) => {
                  const heightPercent = entry.alignmentScore * 100;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 max-w-[60px]">
                      <span className="text-[10px] text-[var(--muted-foreground)] mb-1">
                        {Math.round(entry.alignmentScore * 100)}%
                      </span>
                      <div
                        className={`w-full rounded-t ${getScoreColor(entry.alignmentScore)} transition-all`}
                        style={{ height: `${heightPercent * 0.5}px` }}
                      />
                      <span className="text-[10px] text-[var(--muted-foreground)] mt-1">
                        #{entry.attempt}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Show adjustments made */}
              {convergenceHistory.some(h => h.adjustmentsMade.length > 0) && (
                <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                  {convergenceHistory.map((entry, i) => (
                    entry.adjustmentsMade.length > 0 && entry.adjustmentsMade[0] !== 'Alignment threshold met' && (
                      <div key={i}>
                        <span className="font-medium">#{entry.attempt}:</span>{' '}
                        {entry.adjustmentsMade.join(', ')}
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent Timeline */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">
              Agent Activity Timeline
            </h4>
            <div className="space-y-1.5">
              {/* Intent Agent (runs once at start) */}
              {intentTrace && (
                <AgentTimelineEntry entry={intentTrace} totalDuration={totalDuration} />
              )}

              {/* Per-attempt agents */}
              {Array.from(traceByAttempt.entries()).map(([attempt, entries]) => (
                <div key={attempt} className="space-y-1">
                  {attempt > 0 && iterations > 1 && (
                    <div className="text-[10px] text-[var(--muted-foreground)] font-medium mt-2">
                      Attempt {attempt}
                    </div>
                  )}
                  {entries
                    .filter(e => e.agent !== 'intent') // Intent shown separately
                    .map((entry, i) => (
                      <AgentTimelineEntry key={i} entry={entry} totalDuration={totalDuration} />
                    ))}
                </div>
              ))}
            </div>
          </div>

          {/* Total time */}
          <div className="text-[10px] text-[var(--muted-foreground)] pt-2 border-t border-[var(--border)]">
            Total processing time: {(totalDuration / 1000).toFixed(2)}s
          </div>
        </div>
      )}
    </div>
  );
}

function AgentTimelineEntry({ entry, totalDuration }: { entry: AgentTraceEntry; totalDuration: number }) {
  const config = AGENT_CONFIG[entry.agent];
  const widthPercent = Math.max(5, (entry.durationMs / totalDuration) * 100);

  return (
    <div className="flex items-center gap-2">
      {/* Agent label */}
      <div className={`flex items-center gap-1 w-20 flex-shrink-0 ${config.color}`}>
        <span>{config.icon}</span>
        <span className="text-[10px] font-medium">{config.name}</span>
      </div>

      {/* Duration bar */}
      <div className="flex-1 h-5 bg-[var(--muted)] rounded overflow-hidden relative">
        <div
          className={`h-full ${config.bgColor} flex items-center px-1.5`}
          style={{ width: `${widthPercent}%` }}
        >
          <span className="text-[9px] text-[var(--foreground)] truncate">
            {entry.summary}
          </span>
        </div>
      </div>

      {/* Duration */}
      <span className="text-[10px] text-[var(--muted-foreground)] w-12 text-right flex-shrink-0">
        {entry.durationMs < 1000
          ? `${entry.durationMs}ms`
          : `${(entry.durationMs / 1000).toFixed(1)}s`}
      </span>
    </div>
  );
}

/**
 * Compact inline version for use in badges
 */
export function ScoreProgressionInline({ convergenceHistory }: { convergenceHistory: ConvergenceEntry[] }) {
  if (convergenceHistory.length === 0) return null;

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-0.5">
      {convergenceHistory.map((entry, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-sm ${getScoreColor(entry.alignmentScore)}`}
          title={`Attempt ${entry.attempt}: ${Math.round(entry.alignmentScore * 100)}%`}
        />
      ))}
    </div>
  );
}
