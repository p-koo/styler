'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="about" />

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">About AgentStyler</h1>
          <p className="text-lg text-[var(--muted-foreground)]">
            A multi-agent AI system for intelligent document editing
          </p>
        </div>

        {/* What is AgentStyler */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">What is AgentStyler?</h2>
          <div className="space-y-4 text-[var(--muted-foreground)]">
            <p>
              AgentStyler is a <strong className="text-[var(--foreground)]">multi-agent AI system</strong> designed
              to help researchers, academics, and professionals maintain consistent, high-quality writing.
              Unlike generic AI writing tools that apply one-size-fits-all edits, AgentStyler learns your unique
              voice and adapts its suggestions to match your personal style.
            </p>
            <p>
              The system uses a coordinated architecture of specialized AI agents that work together to
              understand context, generate appropriate edits, and ensure quality through an iterative
              critique-and-refine process.
            </p>
          </div>
        </section>

        {/* Architecture Diagram */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Multi-Agent Architecture</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            When you request an edit, multiple specialized agents collaborate to produce style-aligned suggestions:
          </p>

          {/* Visual Architecture Diagram */}
          <div className="bg-[var(--muted)] rounded-lg p-6 mb-6 overflow-x-auto">
            <pre className="text-xs sm:text-sm font-mono text-[var(--foreground)] whitespace-pre leading-relaxed">
{`┌─────────────────────┐     ┌─────────────────────┐
│   Grant Call /      │     │   Audience Profile  │
│   Style Guide       │     │   (from Settings)   │
└─────────┬───────────┘     └──────────┬──────────┘
          │                            │
          ▼                            │
┌─────────────────────┐                │
│ Constraint          │                │
│ Extraction Agent    │                │
│                     │                │
│ Parses requirements │                │
│ into structured     │                │
│ constraints         │                │
└─────────┬───────────┘                │
          │                            │
          ▼                            │
┌─────────────────────┐                │
│  Document Profile   │◀───────────────┘
│  (per-document      │
│   preferences)      │
└─────────┬───────────┘
          │
          │         ┌─────────────────────┐
          │         │   User Input        │
          │         │   (text + instruction)
          │         └─────────┬───────────┘
          │                   │
          ▼                   ▼
┌───────────────────────────────────────────────────────┐
│                 Orchestrator Agent                    │
│          Coordinates the edit-critique loop           │
│                                                       │
│  ┌─────────────┐   ┌─────────┐   ┌──────────────┐    │
│  │Prompt Agent │──▶│   LLM   │──▶│Critique Agent│    │
│  │             │   │ (edit)  │   │              │    │
│  │Builds style-│   └─────────┘   │Evaluates     │    │
│  │aware prompt │                 │alignment     │    │
│  └─────────────┘                 └──────┬───────┘    │
│        ▲                                │            │
│        │       Refine if needed         │            │
│        └────────────────────────────────┘            │
└───────────────────────────────────────────────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Suggested Edit  │
                 └─────────────────┘`}
            </pre>
          </div>
        </section>

        {/* Agent Details with Expandable Sections */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">How Each Agent Works</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            Click on each agent to learn more about its role in the system:
          </p>

          <div className="space-y-3">
            <AgentDetail
              name="Orchestrator Agent"
              icon="🎯"
              summary="Coordinates the entire edit-critique-refine loop"
              details={[
                "Receives user input (selected text + optional instruction)",
                "Manages up to 3 refinement iterations if quality threshold isn't met",
                "Tracks convergence history and alignment scores",
                "Returns the best edit with critique analysis attached",
                "Handles fallback to direct edit if orchestration fails"
              ]}
            />

            <AgentDetail
              name="Prompt Agent"
              icon="📝"
              summary="Builds context-aware prompts from your style preferences"
              details={[
                "Combines base style settings (verbosity, formality, hedging)",
                "Merges audience profile preferences (jargon level, emphasis points)",
                "Applies document-specific adjustments from sliders",
                "Includes words to avoid and preferred substitutions",
                "Adds section-specific guidance (e.g., 'This is the METHODS section...')"
              ]}
            />

            <AgentDetail
              name="Critique Agent"
              icon="🔍"
              summary="Evaluates edit alignment and suggests improvements"
              details={[
                "Scores alignment from 0-1 based on style match",
                "Identifies specific issues: verbosity, formality, word choice, tone",
                "Suggests concrete improvements for refinement",
                "Predicts likelihood of user acceptance",
                "Triggers re-generation if score < 0.8 threshold"
              ]}
            />

            <AgentDetail
              name="Constraint Extraction Agent"
              icon="📋"
              summary="Parses grant calls and style guides into structured rules"
              details={[
                "Analyzes uploaded documents (grant calls, author guidelines)",
                "Extracts page limits, word counts, formatting requirements",
                "Identifies tone and style expectations",
                "Converts free-text guidelines into structured constraints",
                "Merges extracted constraints into document profile"
              ]}
            />

            <AgentDetail
              name="Learning Agent"
              icon="🧠"
              summary="Learns from your accept/reject decisions over time"
              details={[
                "Records every edit decision with full context",
                "Analyzes patterns in accepted vs rejected edits",
                "Adjusts document preferences based on feedback",
                "Identifies systematic preferences (e.g., 'user always shortens')",
                "Can merge learned preferences back to audience profiles"
              ]}
            />
          </div>
        </section>

        {/* The Edit Flow */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">The Edit Flow</h2>
          <div className="space-y-4">
            <FlowStep
              number={1}
              title="You select text and request an edit"
              description="Click cells to select them. Optionally add an instruction like 'make more concise' or 'add hedging'."
            />
            <FlowStep
              number={2}
              title="Prompt Agent builds a style-aware prompt"
              description="Your preferences, profile settings, and document context are combined into a comprehensive prompt for the LLM."
            />
            <FlowStep
              number={3}
              title="LLM generates an initial edit"
              description="The language model produces an edit suggestion based on the constructed prompt."
            />
            <FlowStep
              number={4}
              title="Critique Agent evaluates alignment"
              description="The edit is scored for style alignment. If below threshold, specific issues are identified."
            />
            <FlowStep
              number={5}
              title="Refinement loop (if needed)"
              description="If alignment < 0.8, the system refines the edit using critique feedback. Up to 3 iterations."
            />
            <FlowStep
              number={6}
              title="You review and decide"
              description="See the diff, toggle individual changes, then accept or reject. Your decision helps the system learn."
            />
          </div>
        </section>

        {/* Key Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Key Features</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              title="Vibe Edit"
              description="Document-level analysis for clarity, structure, and flow. Apply intelligent suggestions directly."
            />
            <FeatureCard
              title="Syntax Highlighting"
              description="Auto-detects LaTeX and Markdown. Colors commands, math, headings, and formatting."
            />
            <FeatureCard
              title="Multiple Profiles"
              description="Create profiles for different contexts: journals, grants, blogs. Switch instantly."
            />
            <FeatureCard
              title="Document Preferences"
              description="Fine-tune verbosity, formality, and hedging per document with sliders."
            />
            <FeatureCard
              title="Interactive Diffs"
              description="Inline or side-by-side views. Toggle individual changes before accepting."
            />
            <FeatureCard
              title="Version History"
              description="Undo/redo with full history. Compare any two versions."
            />
          </div>
        </section>

        {/* Technology */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Technology Stack</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <TechCard title="Frontend" items={['Next.js 15', 'React 19', 'TypeScript', 'Tailwind CSS', 'CodeMirror 6']} />
            <TechCard title="AI Providers" items={['Anthropic (Claude)', 'OpenAI (GPT-4)', 'Ollama (Local)']} />
            <TechCard title="Features" items={['Server Components', 'API Routes', 'File-based Storage', 'Real-time Auto-save']} />
          </div>
        </section>

        {/* Open Source */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Open Source</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            AgentStyler is open source under the MIT license. Contributions, bug reports, and feature requests are welcome.
          </p>
          <a
            href="https://github.com/p-koo/styler"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--foreground)] text-[var(--background)] rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            View on GitHub
          </a>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Contact</h2>
          <div className="bg-[var(--muted)] rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[var(--primary)] rounded-full flex items-center justify-center text-[var(--primary-foreground)] font-semibold text-lg">
                PK
              </div>
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">Peter Koo</h3>
                <p className="text-[var(--muted-foreground)] mb-2">Creator & Maintainer</p>
                <a
                  href="mailto:koo@cshl.edu"
                  className="text-[var(--primary)] hover:underline"
                >
                  koo@cshl.edu
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Acknowledgments */}
        <section>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Acknowledgments</h2>
          <p className="text-[var(--muted-foreground)]">
            Built with Claude Code by Anthropic.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-[var(--muted-foreground)]">
          <div className="flex items-center justify-center gap-4">
            <Link href="/" className="hover:text-[var(--foreground)] transition-colors">
              Home
            </Link>
            <Link href="/editor" className="hover:text-[var(--foreground)] transition-colors">
              Editor
            </Link>
            <a
              href="https://github.com/p-koo/styler"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--foreground)] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AgentDetail({ name, icon, summary, details }: {
  name: string;
  icon: string;
  summary: string;
  details: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--muted)] transition-colors text-left"
      >
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <span className="font-medium text-[var(--foreground)]">{name}</span>
          <span className="text-[var(--muted-foreground)]"> — {summary}</span>
        </div>
        <svg
          className={`w-5 h-5 text-[var(--muted-foreground)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-[var(--muted)]/50 border-t border-[var(--border)]">
          <ul className="space-y-2">
            {details.map((detail, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                <span className="text-[var(--primary)] mt-1">•</span>
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlowStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-semibold text-sm">
        {number}
      </div>
      <div>
        <h3 className="font-medium text-[var(--foreground)]">{title}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 border border-[var(--border)] rounded-lg">
      <h3 className="font-semibold text-[var(--foreground)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
  );
}

function TechCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-4 border border-[var(--border)] rounded-lg">
      <h3 className="font-semibold text-[var(--foreground)] mb-2">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-[var(--muted-foreground)]">{item}</li>
        ))}
      </ul>
    </div>
  );
}
