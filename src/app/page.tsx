import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="home" />

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Image
              src="/logo.png"
              alt="AgentStyler Logo"
              width={80}
              height={80}
              className="rounded-lg"
            />
            <h1 className="text-5xl font-bold text-[var(--foreground)]">AgentStyler</h1>
          </div>
          <p className="text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto">
            An agentic AI system for document editing that learns and applies your personal writing style.
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
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <FeatureCard
            icon="🎯"
            title="Style Learning"
            description="Upload your ChatGPT conversation history or existing documents. AgentStyler analyzes your writing patterns to understand your unique voice."
          />
          <FeatureCard
            icon="🤖"
            title="Multi-Agent Architecture"
            description="A coordinated system of AI agents works together: Prompt Agent builds context, LLM generates edits, and Critique Agent ensures quality."
          />
          <FeatureCard
            icon="📋"
            title="Document Review"
            description="Get high-level feedback on your document or sections. Specify goals, focus on areas like clarity or flow, and apply suggestions directly."
          />
          <FeatureCard
            icon="📊"
            title="Audience Profiles"
            description="Create different profiles for various contexts—academic journals, grant proposals, technical blogs—each with tailored style settings."
          />
          <FeatureCard
            icon="🔄"
            title="Continuous Adaptation"
            description="The system learns from your accept/reject decisions, continuously improving its suggestions to match your preferences."
          />
          <FeatureCard
            icon="✨"
            title="Syntax Highlighting"
            description="Auto-detects LaTeX and Markdown syntax. Colors commands, math, headings, and code blocks for easier editing."
          />
        </div>

        {/* Use Cases */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-6 text-center">
            Designed For
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <UseCaseCard
              title="Researchers"
              items={['Research papers', 'Thesis & dissertations', 'Literature reviews']}
            />
            <UseCaseCard
              title="Academics"
              items={['Grant proposals', 'Course materials', 'Conference submissions']}
            />
            <UseCaseCard
              title="Professionals"
              items={['Technical documentation', 'Reports & proposals', 'Business communications']}
            />
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-6 text-center">
            How It Works
          </h2>
          <div className="space-y-4">
            <StepCard
              number={1}
              title="Select Text"
              description="Click paragraphs to select them. Use Shift+click for ranges or Cmd/Ctrl+click for multiple selections."
            />
            <StepCard
              number={2}
              title="Request Edit"
              description="Add an optional instruction like 'make more concise' or 'add appropriate hedging' and click Get Edit Suggestion."
            />
            <StepCard
              number={3}
              title="Review & Refine"
              description="View the suggested changes with inline or side-by-side diff. Toggle individual changes before applying."
            />
            <StepCard
              number={4}
              title="Learn & Improve"
              description="Your accept/reject decisions help the system learn your preferences over time."
            />
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="text-center">
          <Link
            href="/editor"
            className="inline-block px-8 py-4 text-lg font-medium bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
          >
            Try AgentStyler Now
          </Link>
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            No account required. Your data stays on your machine.
          </p>
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

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-6 border border-[var(--border)] rounded-lg bg-[var(--background)]">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{title}</h3>
      <p className="text-[var(--muted-foreground)]">{description}</p>
    </div>
  );
}

function UseCaseCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="p-6 border border-[var(--border)] rounded-lg bg-[var(--background)]">
      <h3 className="text-lg font-semibold text-[var(--foreground)] mb-3">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-[var(--muted-foreground)] flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4 p-4 border border-[var(--border)] rounded-lg bg-[var(--background)]">
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[var(--primary)] text-[var(--primary-foreground)] rounded-full font-semibold">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-[var(--foreground)] mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}
