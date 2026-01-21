'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="about" />

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">How Styler Works</h1>
          <p className="text-lg text-[var(--muted-foreground)]">
            A multi-agent system that learns your writing style
          </p>
        </div>

        {/* The Problem */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">The Problem</h2>
          <p className="text-[var(--muted-foreground)]">
            When you ask ChatGPT to "improve" your writing, it applies its default preferences—certain hedging patterns, word choices, and formality levels. The result is polished but generic. <strong className="text-[var(--foreground)]">It doesn't sound like you.</strong>
          </p>
        </section>

        {/* The Solution */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">The Solution: ADAPT</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            <strong className="text-[var(--foreground)]">ADAPT</strong> (Adaptive Document Alignment via Prompt Transformations) is a multi-agent system that coordinates specialized AI agents to understand your style, analyze document intent, generate aligned edits, and learn from your feedback.
          </p>

          {/* Simple Flow Diagram */}
          <div className="bg-[var(--muted)] rounded-lg p-6 mb-6">
            <pre className="text-sm font-mono text-[var(--foreground)] whitespace-pre leading-relaxed text-center">
{`Select text → Intent Analysis → Generate Edit → Critique → Present
                                      ↑              │
                                      └──────────────┘
                                      Refine if score < 0.8`}
            </pre>
          </div>
        </section>

        {/* The Agents */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">The Agents</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            Five specialized agents work together:
          </p>

          <div className="space-y-3">
            <AgentCard
              name="Orchestrator"
              role="Coordinates the edit-critique-refine loop"
              details="Manages up to 3 refinement iterations. Returns the best edit with alignment score."
            />
            <AgentCard
              name="Intent Agent"
              role="Analyzes paragraph purpose and document goals"
              details="Ensures edits preserve what each paragraph is trying to accomplish within the document."
            />
            <AgentCard
              name="Prompt Agent"
              role="Builds style-aware, context-rich prompts"
              details="Combines your preferences, document goals, paragraph intent, and section context."
            />
            <AgentCard
              name="Critique Agent"
              role="Evaluates edit alignment (0-1 score)"
              details="Identifies issues: verbosity, formality, word choice, tone. Triggers refinement if needed."
            />
            <AgentCard
              name="Learning Agent"
              role="Learns from your accept/reject decisions"
              details="Analyzes patterns in rejections (not accepts). Adjusts preferences based on feedback."
            />
          </div>
        </section>

        {/* Three-Layer Preferences */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Three-Layer Preferences</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            Your style isn't one-dimensional. Styler models preferences at three levels:
          </p>

          <div className="space-y-4">
            <PreferenceLayer
              name="Base Style"
              scope="Global"
              description="Verbosity, formality, hedging, format rules"
            />
            <PreferenceLayer
              name="Audience Profiles"
              scope="Switchable"
              description="Context-specific overlays (academic, blog, business)"
            />
            <PreferenceLayer
              name="Document Adjustments"
              scope="Per-document"
              description="Fine-tuned sliders, learned rules, document goals"
            />
          </div>
        </section>

        {/* Learning */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">How It Learns</h2>
          <p className="text-[var(--muted-foreground)] mb-6">
            Styler learns from your feedback without memorizing specific word choices:
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <LearningCard
              title="Rejection Feedback"
              description="When you reject and say 'too formal', formality preference decreases"
            />
            <LearningCard
              title="Partial Accepts"
              description="Toggled-off changes become avoid patterns after repeated rejections"
            />
            <LearningCard
              title="Pattern Analysis"
              description="Periodic analysis extracts higher-level rules from decision history"
            />
          </div>

          <p className="text-sm text-[var(--muted-foreground)] mt-4">
            <strong>Conservative by design:</strong> Word avoidance rules require 5+ consistent rejections before activating.
          </p>
        </section>

        {/* Interactive Features */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Interactive Editing</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <FeatureCard
              title="Word-Level Diffs"
              description="See exactly what changed. Toggle individual changes before accepting."
            />
            <FeatureCard
              title="Iterative Refinement"
              description="Not satisfied? Add feedback, click Refine, get a better edit."
            />
            <FeatureCard
              title="Quick Feedback"
              description="One-click feedback chips: 'Too clunky', 'Lost intent', 'Too many edits'"
            />
            <FeatureCard
              title="Document Goals"
              description="Auto-synthesized objectives guide edits. Lock to prevent drift."
            />
          </div>
        </section>

        {/* Deep Dive Links */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Deep Dive</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <a
              href="https://github.com/p-koo/styler/blob/main/WHITEPAPER.md"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Whitepaper</h3>
              <p className="text-sm text-[var(--muted-foreground)]">Comprehensive system documentation</p>
            </a>
            <a
              href="https://github.com/p-koo/styler/blob/main/BLOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors"
            >
              <h3 className="font-semibold text-[var(--foreground)] mb-1">Technical Blog</h3>
              <p className="text-sm text-[var(--muted-foreground)]">Developer-focused architecture walkthrough</p>
            </a>
          </div>
        </section>

        {/* Open Source */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Open Source</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Styler is open source under the MIT license.
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
        <section>
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Contact</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[var(--primary)] rounded-full flex items-center justify-center text-[var(--primary-foreground)] font-semibold text-lg">
              PK
            </div>
            <div>
              <h3 className="font-semibold text-[var(--foreground)]">Peter Koo</h3>
              <a href="mailto:koo@cshl.edu" className="text-[var(--primary)] hover:underline">
                koo@cshl.edu
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-[var(--muted-foreground)]">
          <p>Built with Claude Code by Anthropic</p>
          <div className="mt-2 flex items-center justify-center gap-4">
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

function AgentCard({ name, role, details }: { name: string; role: string; details: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--muted)] transition-colors text-left"
      >
        <div className="flex-1">
          <span className="font-medium text-[var(--foreground)]">{name}</span>
          <span className="text-[var(--muted-foreground)]"> — {role}</span>
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
        <div className="px-4 py-3 bg-[var(--muted)]/50 border-t border-[var(--border)] text-sm text-[var(--muted-foreground)]">
          {details}
        </div>
      )}
    </div>
  );
}

function PreferenceLayer({ name, scope, description }: { name: string; scope: string; description: string }) {
  return (
    <div className="flex items-center gap-4 p-4 border border-[var(--border)] rounded-lg">
      <div className="flex-shrink-0 px-3 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-sm font-medium">
        {scope}
      </div>
      <div>
        <h3 className="font-medium text-[var(--foreground)]">{name}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}

function LearningCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 border border-[var(--border)] rounded-lg">
      <h3 className="font-semibold text-[var(--foreground)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
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
