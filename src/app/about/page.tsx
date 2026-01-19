import Image from 'next/image';
import Link from 'next/link';
import Header from '@/components/Header';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="about" />

      <main className="max-w-3xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">About Styler</h1>
          <p className="text-lg text-[var(--muted-foreground)]">
            Intelligent document editing with personalized style
          </p>
        </div>

        {/* What is Styler */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">What is Styler?</h2>
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-[var(--muted-foreground)] mb-4">
              Styler is a multi-agent AI system designed to help researchers, academics, and professionals
              maintain consistent, high-quality writing across their documents. Unlike generic AI writing
              tools, Styler learns your unique voice and adapts its suggestions accordingly.
            </p>
            <p className="text-[var(--muted-foreground)] mb-4">
              The system uses a coordinated architecture of specialized AI agents that work together
              to understand context, generate appropriate edits, and ensure quality through an
              iterative critique process.
            </p>
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">How It Works</h2>
          <div className="bg-[var(--muted)] rounded-lg p-6 mb-4">
            <div className="grid gap-4">
              <AgentRow
                name="Prompt Agent"
                description="Builds context-aware prompts using your style preferences and document structure"
              />
              <AgentRow
                name="LLM (Language Model)"
                description="Generates edit suggestions based on the constructed prompt"
              />
              <AgentRow
                name="Critique Agent"
                description="Evaluates edits for alignment with your preferences; triggers refinement if needed"
              />
              <AgentRow
                name="Constraint Extraction Agent"
                description="Parses grant calls and style guides to extract structured requirements"
              />
            </div>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            This multi-agent approach ensures that suggestions are not only grammatically correct
            but also aligned with your personal writing style and document-specific requirements.
          </p>
        </section>

        {/* Technology */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Technology</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Styler is built with modern web technologies and supports multiple AI providers:
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <TechCard title="Frontend" items={['Next.js 15', 'React', 'TypeScript', 'Tailwind CSS']} />
            <TechCard title="AI Providers" items={['Anthropic (Claude)', 'OpenAI (GPT)', 'Ollama (Local)']} />
          </div>
        </section>

        {/* Open Source */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Open Source</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Styler is open source and available under the MIT license. Contributions, bug reports,
            and feature requests are welcome.
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
        <div className="max-w-3xl mx-auto px-4 text-center text-sm text-[var(--muted-foreground)]">
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

function AgentRow({ name, description }: { name: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-2 h-2 mt-2 bg-[var(--primary)] rounded-full flex-shrink-0" />
      <div>
        <span className="font-medium text-[var(--foreground)]">{name}</span>
        <span className="text-[var(--muted-foreground)]"> — {description}</span>
      </div>
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
