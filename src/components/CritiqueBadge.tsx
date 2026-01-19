'use client';

import { useState } from 'react';
import type { CritiqueAnalysis, CritiqueIssue } from '@/types';

interface CritiqueBadgeProps {
  critique: CritiqueAnalysis;
  compact?: boolean;
}

/**
 * Displays alignment score and critique details for a suggested edit.
 */
export default function CritiqueBadge({ critique, compact = false }: CritiqueBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Determine color based on alignment score
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  // Get score label
  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  // Get severity color
  const getSeverityColor = (severity: CritiqueIssue['severity']) => {
    switch (severity) {
      case 'major':
        return 'text-red-600';
      case 'moderate':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  // Get issue type icon
  const getIssueIcon = (type: CritiqueIssue['type']) => {
    switch (type) {
      case 'verbosity':
        return '📏';
      case 'formality':
        return '🎩';
      case 'word_choice':
        return '📝';
      case 'structure':
        return '🏗️';
      case 'tone':
        return '🎭';
      case 'hedging':
        return '⚖️';
      default:
        return '•';
    }
  };

  const scorePercent = Math.round(critique.alignmentScore * 100);
  const acceptPercent = Math.round(critique.predictedAcceptance * 100);

  if (compact) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${getScoreColor(
          critique.alignmentScore
        )} hover:opacity-80 transition-opacity`}
        title={`Alignment: ${scorePercent}%, Predicted acceptance: ${acceptPercent}%`}
      >
        <span>{scorePercent}%</span>
        {critique.issues.length > 0 && (
          <span className="opacity-70">({critique.issues.length})</span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {/* Main badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border ${getScoreColor(
          critique.alignmentScore
        )} hover:opacity-80 transition-opacity`}
      >
        <span className="font-semibold">{scorePercent}%</span>
        <span className="text-xs opacity-80">
          {getScoreLabel(critique.alignmentScore)} alignment
        </span>
        {critique.issues.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/50 rounded text-xs">
            {critique.issues.length} {critique.issues.length === 1 ? 'issue' : 'issues'}
          </span>
        )}
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 bg-[var(--muted)]/50 rounded-lg text-sm space-y-3">
          {/* Scores */}
          <div className="flex gap-4">
            <div>
              <span className="text-xs text-[var(--muted-foreground)]">Alignment</span>
              <div className="font-semibold">{scorePercent}%</div>
            </div>
            <div>
              <span className="text-xs text-[var(--muted-foreground)]">Est. Accept</span>
              <div className="font-semibold">{acceptPercent}%</div>
            </div>
          </div>

          {/* Issues */}
          {critique.issues.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Issues Found
              </h4>
              <ul className="space-y-1">
                {critique.issues.map((issue, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 text-xs ${getSeverityColor(
                      issue.severity
                    )}`}
                  >
                    <span>{getIssueIcon(issue.type)}</span>
                    <span>
                      <span className="font-medium capitalize">{issue.type.replace('_', ' ')}</span>
                      {issue.severity !== 'minor' && (
                        <span className="ml-1 opacity-70">({issue.severity})</span>
                      )}
                      : {issue.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {critique.suggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Suggestions
              </h4>
              <ul className="space-y-1">
                {critique.suggestions.map((suggestion, i) => (
                  <li key={i} className="text-xs text-[var(--foreground)]/80">
                    • {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {critique.issues.length === 0 && critique.suggestions.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">
              No issues detected. Edit aligns well with your preferences.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline version for use within diff views
 */
export function CritiqueBadgeInline({ critique }: { critique: CritiqueAnalysis }) {
  const scorePercent = Math.round(critique.alignmentScore * 100);

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <span
      className={`text-xs font-medium ${getScoreColor(critique.alignmentScore)}`}
      title={`Alignment: ${scorePercent}%${
        critique.issues.length > 0
          ? `, ${critique.issues.length} issue${critique.issues.length > 1 ? 's' : ''}`
          : ''
      }`}
    >
      {scorePercent}%
    </span>
  );
}
