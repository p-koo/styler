'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import ApiKeyWarning from '@/components/ApiKeyWarning';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="about" />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <ApiKeyWarning className="mb-8" />
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">How Styler Works</h1>
          <p className="text-xl text-[var(--muted-foreground)]">
            A multi-agent system that learns your writing style
          </p>
        </div>

        {/* The Problem - Red themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border border-red-200 dark:border-red-900/50">
            <h2 className="text-2xl font-semibold text-red-700 dark:text-red-400 mb-3">The Problem</h2>
            <p className="text-red-700/80 dark:text-red-300/80">
              When you ask ChatGPT to "improve" your writing, it applies its default preferences—certain hedging patterns, word choices, and formality levels. The result is polished but generic. <strong className="text-red-800 dark:text-red-300">It doesn't sound like you.</strong>
            </p>
          </div>
        </section>

        {/* The Solution - Green themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-900/50">
            <h2 className="text-2xl font-semibold text-green-700 dark:text-green-400 mb-3">The Solution: ADAPT</h2>
            <p className="text-green-700/80 dark:text-green-300/80 mb-4">
              <strong className="text-green-800 dark:text-green-300">ADAPT</strong> (Adaptive Document Alignment via Prompt Transformations) coordinates specialized AI agents to understand your style, analyze document intent, generate aligned edits, and learn from your feedback.
            </p>

            {/* Flow Diagram */}
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-4 mt-4">
              <pre className="text-sm font-mono text-green-800 dark:text-green-300 whitespace-pre leading-relaxed text-center">
{`Select text → Intent Analysis → Generate Edit → Critique → Present
                                      ↑              │
                                      └──────────────┘
                                      Refine if score < 0.8`}
              </pre>
            </div>
          </div>
        </section>

        {/* The Agents - Blue themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900/50">
            <h2 className="text-2xl font-semibold text-blue-700 dark:text-blue-400 mb-2">The Agents</h2>
            <p className="text-blue-700/80 dark:text-blue-300/80 mb-4">
              Five specialized agents work together:
            </p>

            <div className="space-y-2">
              <AgentCard
                name="Orchestrator"
                role="Coordinates the edit-critique-refine loop"
                details="Manages up to 3 refinement iterations. Returns the best edit with alignment score."
                color="blue"
              />
              <AgentCard
                name="Intent Agent"
                role="Analyzes paragraph purpose and document goals"
                details="Ensures edits preserve what each paragraph is trying to accomplish within the document."
                color="blue"
              />
              <AgentCard
                name="Prompt Agent"
                role="Builds style-aware, context-rich prompts"
                details="Combines your preferences, document goals, paragraph intent, and section context."
                color="blue"
              />
              <AgentCard
                name="Critique Agent"
                role="Fast edit evaluation during the edit loop"
                details="Scores alignment (0-1), identifies issues (verbosity, formality, word choice, structure, tone). Runs while user is waiting—optimized for speed."
                color="blue"
              />
              <AgentCard
                name="Learning Agent"
                role="Learns from your accept/reject decisions"
                details="Extracts style patterns from feedback. Learns adjustments to verbosity, formality, hedging from rejections. Consolidates rules when patterns accumulate. Runs after decisions—can be more thorough."
                color="blue"
              />
            </div>
          </div>
        </section>

        {/* Three-Layer Preferences - Purple themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200 dark:border-purple-900/50">
            <h2 className="text-2xl font-semibold text-purple-700 dark:text-purple-400 mb-2">Three-Layer Preferences</h2>
            <p className="text-purple-700/80 dark:text-purple-300/80 mb-4">
              Your style isn't one-dimensional. Styler models preferences at three levels:
            </p>

            <div className="space-y-3">
              <PreferenceLayer
                name="Base Style"
                scope="Global"
                description="Verbosity, formality, hedging, format rules"
                color="purple"
              />
              <PreferenceLayer
                name="Audience Profiles"
                scope="Switchable"
                description="Context-specific overlays (academic, blog, business)"
                color="purple"
              />
              <PreferenceLayer
                name="Document Adjustments"
                scope="Per-document"
                description="Fine-tuned sliders, learned rules, document goals"
                color="purple"
              />
            </div>
          </div>
        </section>

        {/* Learning - Amber themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border border-amber-200 dark:border-amber-900/50">
            <h2 className="text-2xl font-semibold text-amber-700 dark:text-amber-400 mb-2">How It Learns</h2>
            <p className="text-amber-700/80 dark:text-amber-300/80 mb-4">
              Styler learns from your feedback without memorizing specific word choices:
            </p>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Rejection Feedback</h3>
                <p className="text-sm text-amber-700/80 dark:text-amber-300/70">When you reject and say "too formal", formality preference decreases</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Partial Accepts</h3>
                <p className="text-sm text-amber-700/80 dark:text-amber-300/70">Toggled-off changes become avoid patterns after repeated rejections</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Pattern Analysis</h3>
                <p className="text-sm text-amber-700/80 dark:text-amber-300/70">Periodic analysis extracts higher-level rules from decision history</p>
              </div>
            </div>

            <p className="text-sm text-amber-700/70 dark:text-amber-300/60 mt-4">
              <strong>Conservative by design:</strong> Word avoidance rules require 5+ consistent rejections.
            </p>
          </div>
        </section>

        {/* Interactive Features - Teal themed */}
        <section className="mb-12">
          <div className="p-6 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border border-teal-200 dark:border-teal-900/50">
            <h2 className="text-2xl font-semibold text-teal-700 dark:text-teal-400 mb-4">Interactive Editing</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Word-Level Diffs</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">See exactly what changed. Toggle individual changes before accepting.</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Iterative Refinement</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">Not satisfied? Add feedback, click Refine, get a better edit.</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Quick Feedback</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">One-click feedback: "Too clunky", "Lost intent", "Too many edits"</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Document Goals</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">Auto-synthesized objectives guide edits. Lock to prevent drift.</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Cell Controls</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">Move cells up/down, delete with toolbar. Full keyboard shortcuts.</p>
              </div>
              <div className="p-4 bg-white/50 dark:bg-black/20 rounded-lg">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300 mb-1">Chat Assistant</h3>
                <p className="text-sm text-teal-700/80 dark:text-teal-300/70">Get feedback on selections, check alignment scores, ask questions.</p>
              </div>
            </div>
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
              className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/50 dark:to-gray-900/50 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-semibold text-[var(--foreground)] mb-1">📄 Whitepaper</h3>
              <p className="text-sm text-[var(--muted-foreground)]">Comprehensive system documentation</p>
            </a>
            <a
              href="https://github.com/p-koo/styler/blob/main/BLOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="p-5 rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/50 dark:to-gray-900/50 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
            >
              <h3 className="font-semibold text-[var(--foreground)] mb-1">📝 Technical Blog</h3>
              <p className="text-sm text-[var(--muted-foreground)]">Developer-focused architecture walkthrough</p>
            </a>
          </div>
        </section>

        {/* Open Source & Contact - Side by side */}
        <section className="mb-12">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Open Source</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                MIT licensed. Contributions welcome.
              </p>
              <a
                href="https://github.com/p-koo/styler"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg hover:opacity-90 transition-opacity text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                View on GitHub
              </a>
            </div>

            <div className="p-6 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)]">
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Contact</h2>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--primary)] rounded-full flex items-center justify-center text-[var(--primary-foreground)] font-semibold">
                  PK
                </div>
                <div>
                  <h3 className="font-medium text-[var(--foreground)]">Peter Koo</h3>
                  <a href="mailto:koo@cshl.edu" className="text-sm text-[var(--primary)] hover:underline">
                    koo@cshl.edu
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
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

function AgentCard({ name, role, details, color }: { name: string; role: string; details: string; color: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg overflow-hidden bg-white/50 dark:bg-black/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/80 dark:hover:bg-black/30 transition-colors text-left"
      >
        <div className="flex-1">
          <span className="font-medium text-blue-800 dark:text-blue-300">{name}</span>
          <span className="text-blue-700/70 dark:text-blue-300/70"> — {role}</span>
        </div>
        <svg
          className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-3 bg-white/30 dark:bg-black/10 border-t border-blue-200/50 dark:border-blue-800/30 text-sm text-blue-700/80 dark:text-blue-300/70">
          {details}
        </div>
      )}
    </div>
  );
}

function PreferenceLayer({ name, scope, description, color }: { name: string; scope: string; description: string; color: string }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white/50 dark:bg-black/20 rounded-lg">
      <div className="flex-shrink-0 px-3 py-1 bg-purple-200/50 dark:bg-purple-800/30 text-purple-700 dark:text-purple-300 rounded text-sm font-medium">
        {scope}
      </div>
      <div>
        <h3 className="font-medium text-purple-800 dark:text-purple-300">{name}</h3>
        <p className="text-sm text-purple-700/70 dark:text-purple-300/70">{description}</p>
      </div>
    </div>
  );
}
