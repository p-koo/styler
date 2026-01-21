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

interface CritiqueIssue {
  type: string;
  severity: 'minor' | 'moderate' | 'major';
  description: string;
}

interface CritiqueAnalysis {
  alignmentScore: number;
  predictedAcceptance: number;
  issues: CritiqueIssue[];
  suggestions: string[];
}

interface EditInsightsProps {
  convergenceHistory: ConvergenceEntry[];
  agentTrace: AgentTraceEntry[];
  iterations: number;
  critique?: CritiqueAnalysis;
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
export default function EditInsights({ convergenceHistory, agentTrace, iterations, critique }: EditInsightsProps) {
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
    <div className="space-y-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Compact summary - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors w-full"
      >
        {/* Score progression mini-viz */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide font-medium">Alignment:</span>
          <div className="flex items-center gap-1">
            {convergenceHistory.map((entry, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded ${getScoreColor(entry.alignmentScore)} flex items-center justify-center shadow-sm`}
                title={`Attempt ${entry.attempt}: ${Math.round(entry.alignmentScore * 100)}%`}
              >
                <span className="text-[10px] text-white font-bold">
                  {Math.round(entry.alignmentScore * 10)}
                </span>
              </div>
            ))}
          </div>
          {convergenceHistory.length > 0 && (
            <span className="font-semibold text-sm">
              {Math.round(convergenceHistory[convergenceHistory.length - 1].alignmentScore * 100)}%
            </span>
          )}
        </div>

        {/* Iteration count */}
        {iterations > 1 && (
          <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-[10px] font-medium">
            {iterations} iterations
          </span>
        )}

        {/* Duration */}
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {(totalDuration / 1000).toFixed(1)}s
        </span>

        {/* Expand indicator */}
        <span className="ml-auto text-slate-400 dark:text-slate-500">{expanded ? '▲ Hide details' : '▼ Show agents'}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 bg-white dark:bg-slate-900 rounded-lg space-y-4 text-sm border border-slate-200 dark:border-slate-700">
          {/* Score Progression Chart */}
          {convergenceHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Alignment Score Progression
              </h4>
              <div className="flex items-end gap-2 h-16">
                {convergenceHistory.map((entry, i) => {
                  const heightPercent = entry.alignmentScore * 100;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 max-w-[60px]">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 mb-1 font-medium">
                        {Math.round(entry.alignmentScore * 100)}%
                      </span>
                      <div
                        className={`w-full rounded-t ${getScoreColor(entry.alignmentScore)} transition-all shadow-sm`}
                        style={{ height: `${Math.max(heightPercent * 0.5, 8)}px` }}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                        #{entry.attempt}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Show adjustments made */}
              {convergenceHistory.some(h => h.adjustmentsMade.length > 0) && (
                <div className="mt-2 text-[10px] text-slate-600 dark:text-slate-400">
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
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
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
                    <div className="text-[10px] text-slate-600 dark:text-slate-400 font-medium mt-2">
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

          {/* Alignment Rationale */}
          {critique && (critique.issues.length > 0 || critique.suggestions.length > 0) && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Alignment Rationale
              </h4>

              {/* Issues */}
              {critique.issues.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Issues Found</span>
                  <ul className="mt-1 space-y-1">
                    {critique.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px]">
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          issue.severity === 'major'
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            : issue.severity === 'moderate'
                              ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {issue.type.replace('_', ' ')}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400">{issue.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {critique.suggestions.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Suggestions</span>
                  <ul className="mt-1 space-y-1">
                    {critique.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                        <span className="text-green-500">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {critique.issues.length === 0 && critique.suggestions.length === 0 && (
                <p className="text-[11px] text-green-600 dark:text-green-400">
                  No issues detected. Edit aligns well with your preferences.
                </p>
              )}
            </div>
          )}

          {/* Total time */}
          <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
            Total processing time: {(totalDuration / 1000).toFixed(2)}s
          </div>
        </div>
      )}
    </div>
  );
}

function AgentTimelineEntry({ entry, totalDuration }: { entry: AgentTraceEntry; totalDuration: number }) {
  const config = AGENT_CONFIG[entry.agent];
  const widthPercent = Math.max(20, (entry.durationMs / totalDuration) * 100);

  return (
    <div className="flex items-center gap-2">
      {/* Agent label */}
      <div className={`flex items-center gap-1.5 w-20 flex-shrink-0 ${config.color}`}>
        <span className="text-sm">{config.icon}</span>
        <span className="text-[11px] font-semibold">{config.name}</span>
      </div>

      {/* Duration bar */}
      <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden relative">
        <div
          className={`h-full ${config.bgColor} dark:opacity-80 flex items-center px-2`}
          style={{ width: `${widthPercent}%` }}
        >
          <span className="text-[10px] text-slate-700 dark:text-slate-200 truncate font-medium">
            {entry.summary}
          </span>
        </div>
      </div>

      {/* Duration */}
      <span className="text-[11px] text-slate-600 dark:text-slate-400 w-14 text-right flex-shrink-0 font-medium">
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
