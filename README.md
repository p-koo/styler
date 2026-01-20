<p align="center">
  <img src="public/logo.png" alt="Styler Logo" height="80">
  <img src="public/styler-text.svg" alt="Styler" height="60">
</p>

<p align="center">
  <strong>Styler is a document editor that uses ADAPT (Adaptive Document Alignment via Prompt Transformations), a multi-agent system for adaptive document alignment via prompt transformations, to align LLM-guided edits with your personal writing style.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#installation">Installation</a> •
  <a href="https://github.com/p-koo/styler/issues">Report Bug</a>
</p>

---

## What is Styler?

Styler goes beyond simple text editing. It uses **ADAPT** — a coordinated system of specialized AI agents — to:

- **Learn your writing style** from existing work (ChatGPT exports, documents)
- **Generate style-aligned edits** matching your preferences for verbosity, formality, and tone
- **Critique and refine suggestions** through an iterative feedback loop
- **Adapt continuously** based on which edits you accept or reject

Unlike generic AI writing tools, Styler maintains your authentic voice while improving clarity and consistency.

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

## Features

### ADAPT: Multi-Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Orchestrator Agent                     │
│           Coordinates the edit-critique loop            │
│                                                         │
│  ┌─────────────┐   ┌─────────┐   ┌──────────────┐      │
│  │Prompt Agent │──▶│   LLM   │──▶│Critique Agent│      │
│  │             │   │ (edit)  │   │              │      │
│  │Builds style-│   └─────────┘   │Evaluates     │      │
│  │aware prompt │                 │alignment     │      │
│  └─────────────┘                 └──────┬───────┘      │
│        ▲                                │              │
│        │       Refine if needed         │              │
│        └────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

| Agent | Role |
|-------|------|
| **Orchestrator** | Manages edit-critique-refine loop (up to 3 iterations) |
| **Prompt Agent** | Builds style-aware prompts from your preferences |
| **Critique Agent** | Scores alignment (0-1), identifies issues, triggers refinement |
| **Constraint Extraction** | Parses grant calls/style guides into structured rules |
| **Learning Agent** | Learns from accept/reject decisions over time |

### Editor Features

| Feature | Description |
|---------|-------------|
| **Document Review** | Get high-level feedback on your document or selected sections. Apply suggestions directly. |
| **Syntax Highlighting** | Auto-detects LaTeX and Markdown. Colors commands, math, code. |
| **Smart Splitting** | Intelligently splits documents by syntax (LaTeX environments, Markdown sections, paragraphs). |
| **Audience Profiles** | Create profiles for journals, grants, blogs. Switch instantly. |
| **Document Preferences** | Fine-tune verbosity, formality, hedging per document. |
| **Interactive Diffs** | Inline or side-by-side. Toggle individual changes. |
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

## How It Works

1. **Select paragraphs** — Click, Shift+click for range, Cmd/Ctrl+click for multi-select
2. **Add instruction** — Optional: "make more concise", "add hedging", etc.
3. **Get suggestion** — ADAPT agents generate and critique the edit
4. **Review diff** — See changes inline or side-by-side
5. **Accept/Reject** — Your decision helps the system learn

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

## Project Structure

```
src/
├── agents/                    # ADAPT multi-agent system
│   ├── orchestrator-agent.ts  # Main coordination loop
│   ├── critique-agent.ts      # Edit quality evaluation
│   ├── prompt-agent.ts        # Style-aware prompt building
│   └── constraint-extraction-agent.ts
├── app/
│   ├── api/                   # API routes
│   ├── editor/                # Main editor page
│   ├── settings/              # Configuration
│   └── about/                 # About page
├── components/
│   ├── CodeMirrorEditor.tsx   # Syntax-highlighted editor
│   ├── SyntaxHighlighter.tsx  # Display highlighting
│   ├── DiffView.tsx           # Inline + side-by-side diffs
│   ├── FeedbackPanel.tsx      # Document review & feedback
│   └── Header.tsx             # Navigation
├── memory/                    # Preference storage
├── utils/                     # Utilities (smart splitting, etc.)
└── providers/                 # LLM integrations
    ├── anthropic.ts
    ├── openai.ts
    └── ollama.ts
```

## Use Cases

**Academic Writing**
- Research papers: Consistent style across sections
- Grant proposals: Appropriate tone and hedging
- Thesis: Voice consistency across chapters

**Professional Documents**
- Technical docs: Standardized terminology
- Reports: Match organizational standards
- Proposals: Calibrate for different audiences

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
