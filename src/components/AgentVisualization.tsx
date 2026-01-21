'use client';

import { useState, useEffect } from 'react';

interface AgentVisualizationProps {
  isActive: boolean;
  currentIteration?: number;
  maxIterations?: number;
}

type AgentState = 'idle' | 'intent' | 'prompt' | 'llm' | 'critique' | 'refining';

const AGENT_TIMINGS: Record<Exclude<AgentState, 'idle' | 'refining'>, number> = {
  intent: 800,    // Intent analysis is quick
  prompt: 400,    // Prompt building is fast
  llm: 6000,      // LLM generation takes longest
  critique: 2000, // Critique evaluation
};

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

    // More realistic agent cycle based on actual timings
    const runAgentCycle = (iter: number) => {
      const agents: Exclude<AgentState, 'idle' | 'refining'>[] =
        iter === 1 ? ['intent', 'prompt', 'llm', 'critique'] : ['prompt', 'llm', 'critique'];

      let agentIndex = 0;
      setActiveAgent(agents[0]);

      const scheduleNext = () => {
        const currentAgent = agents[agentIndex];
        const duration = AGENT_TIMINGS[currentAgent];

        setTimeout(() => {
          agentIndex++;
          if (agentIndex < agents.length) {
            setActiveAgent(agents[agentIndex]);
            scheduleNext();
          } else if (iter < maxIterations) {
            // Show refining state briefly, then start next iteration
            setActiveAgent('refining');
            setTimeout(() => {
              setIteration(iter + 1);
              runAgentCycle(iter + 1);
            }, 600);
          }
          // If at max iterations, stay on critique
        }, duration);
      };

      scheduleNext();
    };

    runAgentCycle(1);

    return () => {
      // Cleanup handled by state reset
    };
  }, [isActive, maxIterations]);

  if (!isActive && activeAgent === 'idle') {
    return null;
  }

  const agents: Exclude<AgentState, 'idle' | 'refining'>[] = ['intent', 'prompt', 'llm', 'critique'];

  const getAgentConfig = (agent: AgentState) => {
    switch (agent) {
      case 'intent': return { icon: '🎯', name: 'Intent', color: 'blue' };
      case 'prompt': return { icon: '📝', name: 'Prompt', color: 'purple' };
      case 'llm': return { icon: '🤖', name: 'LLM', color: 'green' };
      case 'critique': return { icon: '⚖️', name: 'Critique', color: 'orange' };
      default: return { icon: '⏳', name: '', color: 'gray' };
    }
  };

  const getAgentStyle = (agent: AgentState) => {
    const isCurrentAgent = activeAgent === agent;
    const config = getAgentConfig(agent);

    if (isCurrentAgent) {
      return `flex flex-col items-center p-2 rounded-lg transition-all duration-300 bg-${config.color}-100 dark:bg-${config.color}-900 text-${config.color}-700 dark:text-${config.color}-300 scale-110 shadow-lg ring-2 ring-${config.color}-400`;
    }

    const agentIndex = agents.indexOf(agent as Exclude<AgentState, 'idle' | 'refining'>);
    const currentIndex = agents.indexOf(activeAgent as Exclude<AgentState, 'idle' | 'refining'>);
    const isPast = currentIndex > agentIndex;

    return `flex flex-col items-center p-2 rounded-lg transition-all duration-300 ${
      isPast
        ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
    }`;
  };

  const getArrowStyle = (fromIndex: number, toIndex: number) => {
    const currentIndex = agents.indexOf(activeAgent as Exclude<AgentState, 'idle' | 'refining'>);
    const isActive = currentIndex === fromIndex;
    const isPast = currentIndex > fromIndex;

    return `text-lg transition-all duration-300 ${
      isActive
        ? 'text-blue-500 dark:text-blue-400 animate-pulse scale-125'
        : isPast
          ? 'text-green-500 dark:text-green-400'
          : 'text-slate-300 dark:text-slate-600'
    }`;
  };

  const getStatusMessage = () => {
    switch (activeAgent) {
      case 'intent': return 'Analyzing paragraph intent...';
      case 'prompt': return 'Building style-aware prompt...';
      case 'llm': return 'Generating edit suggestion...';
      case 'critique': return 'Evaluating alignment...';
      case 'refining': return 'Refining based on critique...';
      default: return 'Ready';
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Agent Pipeline
        </span>
        {iteration > 1 && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full font-medium">
            Iteration {iteration}/{maxIterations}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1">
        {agents.map((agent, i) => (
          <div key={agent} className="flex items-center">
            <div className={getAgentStyle(agent)}>
              <div className="text-lg mb-0.5">{getAgentConfig(agent).icon}</div>
              <span className="text-[9px] font-semibold">{getAgentConfig(agent).name}</span>
            </div>
            {i < agents.length - 1 && (
              <span className={`mx-1 ${getArrowStyle(i, i + 1)}`}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* Feedback loop indicator */}
      {activeAgent === 'refining' && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="animate-spin">↻</span>
          <span>Refining based on critique...</span>
        </div>
      )}

      {/* Status message with spinner */}
      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        {activeAgent !== 'idle' && (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        <span>{getStatusMessage()}</span>
      </div>
    </div>
  );
}
