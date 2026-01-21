import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="home" />

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Image
              src="/logo.png"
              alt="Styler Logo"
              width={80}
              height={80}
              className="rounded-lg"
            />
            <h1 className="text-5xl font-bold text-[var(--foreground)]">Styler</h1>
          </div>
          <p className="text-2xl text-[var(--foreground)] font-medium mb-4">
            AI editing that sounds like you
          </p>
          <p className="text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
            Most AI writing tools make everyone sound the same. Styler learns your personal style and preserves your voice while improving clarity and flow.
          </p>
        </div>

        {/* Main CTA */}
        <div className="text-center mb-16">
          <Link
            href="/editor"
            className="inline-block px-8 py-4 text-lg font-medium bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
          >
            Start Editing
          </Link>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            No account required • All data stays local
          </p>
        </div>

        {/* Problem/Solution */}
        <section className="mb-16">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-3">Generic AI Tools</h3>
              <ul className="space-y-2 text-red-600 dark:text-red-400/80">
                <li className="flex items-start gap-2">
                  <span className="mt-1">✗</span>
                  <span>One-size-fits-all edits</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✗</span>
                  <span>Strips your unique voice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✗</span>
                  <span>No memory between sessions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✗</span>
                  <span>Same output for everyone</span>
                </li>
              </ul>
            </div>
            <div className="p-6 border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-3">Styler</h3>
              <ul className="space-y-2 text-green-600 dark:text-green-400/80">
                <li className="flex items-start gap-2">
                  <span className="mt-1">✓</span>
                  <span>Learns your preferences</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✓</span>
                  <span>Preserves your voice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✓</span>
                  <span>Continuous learning</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1">✓</span>
                  <span>Adapts to you</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* How It Works - Simplified */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-6 text-center">
            How It Works
          </h2>
          <div className="relative">
            {/* Connection line */}
            <div className="hidden md:block absolute left-1/2 top-8 bottom-8 w-0.5 bg-[var(--border)] -translate-x-1/2" />

            <div className="space-y-6">
              <StepCard
                number={1}
                title="Select & Instruct"
                description="Select paragraphs and optionally add an instruction like 'make concise' or 'add hedging'"
              />
              <StepCard
                number={2}
                title="AI Generates Edit"
                description="Multiple agents analyze intent, build a style-aware prompt, and generate an aligned edit"
              />
              <StepCard
                number={3}
                title="Review & Toggle"
                description="See word-level diffs, toggle individual changes, refine with feedback if needed"
              />
              <StepCard
                number={4}
                title="System Learns"
                description="Your accept/reject decisions teach the system your preferences over time"
              />
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-6 text-center">
            Key Features
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <FeatureCard
              title="Style Controls"
              description="Adjust verbosity, formality, and hedging with simple sliders"
            />
            <FeatureCard
              title="Document Goals"
              description="Auto-synthesized objectives guide every edit"
            />
            <FeatureCard
              title="Audience Profiles"
              description="Switch contexts: journal, grant, blog, business"
            />
            <FeatureCard
              title="Interactive Diffs"
              description="Toggle individual changes before accepting"
            />
            <FeatureCard
              title="Iterative Refinement"
              description="Add feedback, click Refine, get better edits"
            />
            <FeatureCard
              title="LaTeX & Markdown"
              description="Syntax-aware editing with highlighting"
            />
          </div>
        </section>

        {/* Use Cases */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-6 text-center">
            Built For
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <UseCaseCard
              title="Researchers"
              items={['Papers & manuscripts', 'Thesis writing', 'Literature reviews']}
            />
            <UseCaseCard
              title="Academics"
              items={['Grant proposals', 'Course materials', 'Conference papers']}
            />
            <UseCaseCard
              title="Professionals"
              items={['Technical docs', 'Reports', 'Business writing']}
            />
          </div>
        </section>

        {/* ADAPT Architecture Teaser */}
        <section className="mb-16">
          <div className="p-6 border border-[var(--border)] rounded-lg bg-[var(--muted)]/30">
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">
              Powered by ADAPT
            </h2>
            <p className="text-[var(--muted-foreground)] mb-4">
              <strong>Adaptive Document Alignment via Prompt Transformations</strong> — a multi-agent system where specialized AI agents collaborate to understand context, analyze intent, generate style-aligned edits, and ensure quality through iterative critique-and-refine loops.
            </p>
            <Link
              href="/about"
              className="text-[var(--primary)] hover:underline font-medium"
            >
              Learn how it works →
            </Link>
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="text-center">
          <Link
            href="/editor"
            className="inline-block px-8 py-4 text-lg font-medium bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
          >
            Try Styler Now
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-[var(--muted-foreground)]">
          <p>Built with Claude Code by Anthropic</p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <Link href="/about" className="hover:text-[var(--foreground)] transition-colors">
              About
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

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 border border-[var(--border)] rounded-lg bg-[var(--background)]">
      <h3 className="font-semibold text-[var(--foreground)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
  );
}

function UseCaseCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-5 border border-[var(--border)] rounded-lg bg-[var(--background)]">
      <h3 className="font-semibold text-[var(--foreground)] mb-3">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-[var(--muted-foreground)] flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4 p-4 border border-[var(--border)] rounded-lg bg-[var(--background)] relative">
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-semibold z-10">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-[var(--foreground)] mb-0.5">{title}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}
