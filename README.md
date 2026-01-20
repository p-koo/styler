<p align="center">
  <img src="public/logo.png" alt="Styler Logo" height="80">
  <img src="public/styler-text.svg" alt="Styler" height="60">
</p>

<p align="center">
  <strong>A document editor powered by ADAPT for style-aligned writing assistance</strong>
</p>

<p align="center">
  <a href="#what-is-styler">What is Styler?</a> •
  <a href="#adapt-architecture">ADAPT Architecture</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#installation">Installation</a>
</p>

---

## What is Styler?

Styler is a document editor that learns and adapts to your personal writing style. Unlike generic AI writing tools that apply one-size-fits-all edits, Styler maintains your authentic voice while improving clarity and consistency.

**Key capabilities:**

- **Style Learning** — Import your writing history (ChatGPT exports, documents) to bootstrap your preferences
- **Adaptive Editing** — Suggestions match your preferences for verbosity, formality, and tone
- **Continuous Improvement** — The system learns from which edits you accept or reject
- **Multi-Format Support** — LaTeX, Markdown, and plain text with syntax highlighting

---

## ADAPT Architecture

**ADAPT** stands for **Adaptive Document Alignment via Prompt Transformations**.

It is a multi-agent system where specialized AI agents collaborate to produce style-aligned edit suggestions. Rather than sending your text directly to an LLM, ADAPT coordinates multiple agents that understand context, analyze intent, generate appropriate edits, and ensure quality through an iterative critique-and-refine process.

### System Overview

```
┌───────────────────────┐       ┌───────────────────────┐
│    Grant Call /       │       │    Audience Profile   │
│    Style Guide        │       │    (from Settings)    │
└───────────┬───────────┘       └───────────┬───────────┘
            │                               │
            ▼                               │
┌───────────────────────┐                   │
│ Constraint Extraction │                   │
│ Agent                 │                   │
└───────────┬───────────┘                   │
            │                               │
            ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Document Profile                       │
│                                                             │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│  │ Style Sliders │ │ Words &       │ │ Document Goals    │ │
│  │               │ │ Guidance      │ │ (Intent Agent     │ │
│  │               │ │               │ │  synthesizes)     │ │
│  └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
┌───────────────────────┐       ┌───────────────────────┐
│    User Input         │       │    Document Content   │
│    (text+instruction) │       │                       │
└───────────┬───────────┘       └───────────┬───────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Orchestrator Agent                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 1. Intent Agent analyzes paragraph purpose            │ │
│  │    (connects to document goals)                       │ │
│  └───────────────────────────┬───────────────────────────┘ │
│                              ▼                              │
│  ┌───────────────┐     ┌───────────┐     ┌───────────────┐ │
│  │ Prompt Agent  │────▶│    LLM    │────▶│Critique Agent │ │
│  │               │     │  (edit)   │     │               │ │
│  │ Builds prompt │     └───────────┘     │ Scores edit   │ │
│  │ with style,   │                       │ alignment     │ │
│  │ intent, goals │                       └───────┬───────┘ │
│  └───────────────┘                               │         │
│         ▲                                        │         │
│         │            Refine if < 0.8             │         │
│         └────────────────────────────────────────┘         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │    Suggested Edit     │
                  └───────────┬───────────┘
                              │
                              ▼ User Accept/Reject
                  ┌───────────────────────┐
                  │    Learning Agent     │──▶ Updates Profile
                  └───────────────────────┘
```

### Agent Roles

| Agent | Role |
|-------|------|
| **Orchestrator Agent** | Coordinates the edit-critique-refine loop. Calls Intent Agent before editing. Manages up to 3 refinement iterations. |
| **Intent Agent** | Synthesizes document goals from content. Analyzes each paragraph's purpose within document goals. Ensures edits preserve intent. |
| **Prompt Agent** | Builds context-aware prompts including style preferences, document goals, paragraph intent, and section context. |
| **Critique Agent** | Evaluates edit alignment (0-1 score). Identifies issues: verbosity, formality, word choice, tone. Triggers re-generation if score < 0.8. |
| **Constraint Extraction Agent** | Parses grant calls, style guides, and author guidelines into structured rules. Extracts formatting requirements and tone expectations. |
| **Learning Agent** | Records edit decisions. Learns from rejections (not accepts). Adjusts preferences based on explicit feedback. Consolidates rules. |

### The Edit Flow

1. **You select text and request an edit** — Click cells to select. Add optional instruction like "make more concise"
2. **Intent Agent analyzes paragraph purpose** — How the paragraph connects to surrounding content and contributes to document goals
3. **Prompt Agent builds a goal-aware prompt** — Style preferences, paragraph intent, document goals, and context are combined
4. **LLM generates an initial edit** — Based on the constructed prompt, aligned with both style and intent
5. **Critique Agent evaluates alignment** — Scores the edit, identifies issues if any
6. **Refinement loop (if needed)** — If alignment < 0.8, the system refines using critique feedback (up to 3 iterations)
7. **You review and decide** — See the diff, toggle individual changes, accept or reject. Your decision helps the system learn.

---

## Features

### Edit Modes

| Mode | Description |
|------|-------------|
| **Styler Edit** | Single-cell editing with style alignment. Select a paragraph, get a style-matched suggestion. |
| **Vibe Edit** | Document-level analysis. Select multiple cells or the whole document for holistic feedback on clarity, structure, and flow. |

### Editor Features

| Feature | Description |
|---------|-------------|
| **Document Goals** | Auto-synthesized objectives guide edits. Lock to prevent drift or edit manually. |
| **Syntax Highlighting** | Auto-detects LaTeX and Markdown. Colors commands, math, headings, and formatting. |
| **Smart Splitting** | Intelligently splits documents by syntax (LaTeX environments, Markdown sections, paragraphs). |
| **Audience Profiles** | Create profiles for different contexts: journals, grants, blogs. Switch instantly. |
| **Document Preferences** | Fine-tune verbosity, formality, and hedging per document with sliders. |
| **Interactive Diffs** | Inline or side-by-side views. Toggle individual changes before accepting. |
| **Version History** | Full undo/redo. Compare any two versions. |
| **Dark Mode** | System, light, or dark theme. |
| **Search** | Find text within documents. Navigate matches. |
| **Auto-save** | Changes save automatically. |

### Style Controls

**Verbosity** (Terse ↔ Detailed)
- Terse: Aggressive compression, 30-50% fewer words
- Detailed: Expansion encouraged, add context/examples

**Formality** (Casual ↔ Formal)
- Casual: Contractions, first person, conversational
- Formal: No contractions, third person, academic register

**Hedging** (Confident ↔ Cautious)
- Confident: Remove "may", "might", "suggests"
- Cautious: Add qualifiers, acknowledge uncertainty

### Adaptive Learning

Styler learns from your feedback without memorizing specific word choices:

- **Rejection feedback** — When you reject an edit, tell the system why (over-edited, changed meaning, wrong tone, etc.)
- **Style pattern learning** — The system learns patterns like "prefers less formal tone" rather than specific word substitutions
- **Rule consolidation** — Similar rules are merged into stronger, clearer directives
- **Conservative word learning** — Words are only added to avoid lists after 5+ consistent rejections

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/p-koo/styler.git
cd styler && npm install

# Configure API key (at least one required)
cp .env.example .env.local
# Edit .env.local: ANTHROPIC_API_KEY=sk-ant-... or OPENAI_API_KEY=sk-...

# Run
npm run dev
# Open http://localhost:3000
```

---

## Installation

### Prerequisites

- **Node.js 18+** ([install guide](https://nodejs.org/))
- **API Key** for at least one provider:
  - [Anthropic](https://console.anthropic.com/) (Claude) — Recommended
  - [OpenAI](https://platform.openai.com/) (GPT-4)
  - [Ollama](https://ollama.ai/) (Local, free)

### Setup

```bash
# Clone
git clone https://github.com/p-koo/styler.git
cd styler

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

Edit `.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-...   # Recommended
OPENAI_API_KEY=sk-...          # Alternative
OLLAMA_BASE_URL=http://localhost:11434  # Optional, for local models
```

```bash
# Start development server
npm run dev

# Open http://localhost:3000
```

---

## Project Structure

```
src/
├── agents/                    # ADAPT multi-agent system
│   ├── orchestrator-agent.ts  # Main coordination loop
│   ├── intent-agent.ts        # Document goals & paragraph intent
│   ├── critique-agent.ts      # Edit quality evaluation & learning
│   ├── prompt-agent.ts        # Style-aware prompt building
│   └── constraint-extraction-agent.ts
├── app/
│   ├── api/                   # API routes
│   │   └── documents/[id]/goals/  # Goals synthesis endpoint
│   ├── editor/                # Main editor page
│   ├── settings/              # Configuration
│   └── about/                 # About page with architecture details
├── components/
│   ├── CodeMirrorEditor.tsx   # Syntax-highlighted editor
│   ├── SyntaxHighlighter.tsx  # Display highlighting
│   ├── DiffView.tsx           # Inline + side-by-side diffs
│   ├── FeedbackPanel.tsx      # Document review & feedback
│   └── DocumentProfilePanel.tsx  # Per-document preferences + goals
├── memory/                    # Preference storage
│   ├── preference-store.ts    # Global preferences
│   └── document-preferences.ts  # Document-specific learning
├── utils/                     # Utilities
│   └── smart-split.ts         # Syntax-aware document splitting
└── providers/                 # LLM integrations
    ├── anthropic.ts
    ├── openai.ts
    └── ollama.ts
```

---

## Use Cases

**Academic Writing**
- Research papers: Consistent style across sections
- Grant proposals: Appropriate tone and hedging for reviewers
- Thesis: Voice consistency across chapters

**Professional Documents**
- Technical documentation: Standardized terminology
- Reports: Match organizational style standards
- Proposals: Calibrate for different audiences

**Content Creation**
- Blog posts: Maintain personal voice
- Documentation: Consistent technical writing
- Editing: Batch improvements across documents

---

## Technology Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, CodeMirror 6 |
| **AI Providers** | Anthropic (Claude), OpenAI (GPT-4), Ollama (Local) |
| **Features** | Server Components, API Routes, File-based Storage, Real-time Auto-save |

---

## Contributing

Contributions welcome! Please [open an issue](https://github.com/p-koo/styler/issues) to discuss changes before submitting a PR.

## License

MIT — see [LICENSE](LICENSE)

## Contact

**Peter Koo** — [koo@cshl.edu](mailto:koo@cshl.edu)

---

<p align="center">
  Built with <a href="https://claude.ai">Claude Code</a> by Anthropic
</p>
