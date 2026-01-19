'use client';

import { useState, useEffect } from 'react';

interface AgentVisualizationProps {
  isActive: boolean;
  currentIteration?: number;
  maxIterations?: number;
}

type AgentState = 'idle' | 'prompt' | 'llm' | 'critique' | 'refining';

const AGENT_CYCLE_MS = 1500; // Time per agent phase

export default function AgentVisualization({
  isActive,
  currentIteration = 1,
  maxIterations = 3,
}: AgentVisualizationProps) {
  const [activeAgent, setActiveAgent] = useState<AgentState>('idle');
  const [iteration, setIteration] = useState(1);

  useEffect(() => {
    if (!isActive) {
      setActiveAgent('idle');
      setIteration(1);
      return;
    }

    // Cycle through agents while active
    const agents: AgentState[] = ['prompt', 'llm', 'critique'];
    let agentIndex = 0;
    let currentIter = 1;

    setActiveAgent(agents[0]);

    const interval = setInterval(() => {
      agentIndex++;

      if (agentIndex >= agents.length) {
        // End of cycle - check if we need to refine
        if (currentIter < maxIterations) {
          setActiveAgent('refining');
          setTimeout(() => {
            currentIter++;
            setIteration(currentIter);
            agentIndex = 0;
            setActiveAgent(agents[0]);
          }, 500);
        } else {
          agentIndex = agents.length - 1; // Stay on critique
        }
      } else {
        setActiveAgent(agents[agentIndex]);
      }
    }, AGENT_CYCLE_MS);

    return () => clearInterval(interval);
  }, [isActive, maxIterations]);

  if (!isActive && activeAgent === 'idle') {
    return null;
  }

  const getAgentStyle = (agent: AgentState) => {
    const isCurrentAgent = activeAgent === agent;
    return `flex flex-col items-center p-2 rounded-lg transition-all duration-300 ${
      isCurrentAgent
        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] scale-110 shadow-lg'
        : 'bg-[var(--muted)] text-[var(--muted-foreground)] opacity-50'
    }`;
  };

  const getArrowStyle = (fromAgent: AgentState, toAgent: AgentState) => {
    const agents: AgentState[] = ['prompt', 'llm', 'critique'];
    const fromIndex = agents.indexOf(fromAgent);
    const toIndex = agents.indexOf(toAgent);
    const currentIndex = agents.indexOf(activeAgent);

    const isActive = currentIndex >= fromIndex && currentIndex < toIndex;
    return `text-lg transition-all duration-300 ${
      isActive ? 'text-[var(--primary)] animate-pulse' : 'text-[var(--muted-foreground)] opacity-30'
    }`;
  };

  return (
    <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--background)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Agent Activity
        </span>
        {iteration > 1 && (
          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full">
            Iteration {iteration}/{maxIterations}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1">
        {/* Prompt Agent */}
        <div className={getAgentStyle('prompt')}>
          <div className="text-lg mb-1">📝</div>
          <span className="text-[10px] font-medium">Prompt</span>
        </div>

        {/* Arrow */}
        <span className={getArrowStyle('prompt', 'llm')}>→</span>

        {/* LLM */}
        <div className={getAgentStyle('llm')}>
          <div className="text-lg mb-1">🤖</div>
          <span className="text-[10px] font-medium">LLM</span>
        </div>

        {/* Arrow */}
        <span className={getArrowStyle('llm', 'critique')}>→</span>

        {/* Critique Agent */}
        <div className={getAgentStyle('critique')}>
          <div className="text-lg mb-1">🔍</div>
          <span className="text-[10px] font-medium">Critique</span>
        </div>
      </div>

      {/* Feedback loop indicator */}
      {activeAgent === 'refining' && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-yellow-600">
          <span className="animate-spin">↻</span>
          <span>Refining based on critique...</span>
        </div>
      )}

      {/* Status message */}
      <div className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
        {activeAgent === 'prompt' && 'Building style-aware prompt...'}
        {activeAgent === 'llm' && 'Generating edit suggestion...'}
        {activeAgent === 'critique' && 'Evaluating alignment with preferences...'}
        {activeAgent === 'idle' && 'Ready'}
      </div>
    </div>
  );
}
