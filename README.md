<p align="center">
  <img src="public/logo.png" alt="Styler Logo" height="80">
  <img src="public/styler-text.svg" alt="Styler" height="60">
</p>

<p align="center">
  <strong>AI-powered document editing that learns your writing style</strong>
</p>

<p align="center">
  <a href="#why-styler">Why Styler?</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#features">Features</a> •
  <a href="WHITEPAPER.md">Whitepaper</a> •
  <a href="BLOG.md">Technical Blog</a>
</p>

---

## Why Styler?

Most AI writing tools have a problem: **they make everyone sound the same.**

When you ask ChatGPT to "improve" your writing, it applies its default preferences—certain hedging patterns, word choices, and formality levels. The result is polished but generic. It doesn't sound like *you*.

**Styler is different.** It learns your personal writing style and preserves it while improving clarity and flow.

| Generic AI Tools | Styler |
|------------------|--------|
| One-size-fits-all edits | Learns your preferences |
| Strips your voice | Preserves your voice |
| No memory between sessions | Continuous learning |
| Same output for everyone | Adapts to you |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/p-koo/styler.git
cd styler && npm install

# Configure API key
cp .env.example .env.local
# Edit .env.local with your key:
# ANTHROPIC_API_KEY=sk-ant-...  (recommended)
# or OPENAI_API_KEY=sk-...

# Run
npm run dev
# Open http://localhost:3000
```

**Requirements:** Node.js 18+ and an API key from [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or [Ollama](https://ollama.ai/) (free, local).

---

## How It Works

Styler is powered by **ADAPT** (Adaptive Document Alignment via Prompt Transformations)—a multi-agent system that coordinates specialized AI agents.

### The Edit Loop

```
You select text → Intent analysis → Generate edit → Critique → Refine → Present
                                                      ↑          │
                                                      └──────────┘
                                                      (if score < 0.8)
```

1. **Intent Agent** analyzes what the paragraph is trying to accomplish
2. **Prompt Agent** builds a context-aware prompt with your style preferences
3. **LLM** generates an edit aligned with your voice
4. **Critique Agent** scores alignment (0-1) and identifies issues
5. If score < 0.8, the system refines automatically (up to 3 times)
6. You review the diff, toggle individual changes, and accept or reject
7. **Learning Agent** updates your preferences based on your decision

### Three-Layer Preferences

| Layer | Scope | What It Controls |
|-------|-------|------------------|
| **Base Style** | Global | Verbosity, formality, hedging, format rules |
| **Audience Profiles** | Switchable | Context-specific overlays (academic, blog, business) |
| **Document Adjustments** | Per-document | Fine-tuned sliders, learned rules, document goals |

### Agents at a Glance

| Agent | Purpose |
|-------|---------|
| **Orchestrator** | Coordinates the edit-critique-refine loop |
| **Intent** | Analyzes document goals and paragraph purpose |
| **Prompt** | Builds style-aware, context-rich prompts |
| **Critique** | Evaluates edit quality, triggers refinement |
| **Learning** | Updates preferences from your feedback |

> **Deep Dive:** See the [Whitepaper](WHITEPAPER.md) for full architecture details or the [Technical Blog](BLOG.md) for a developer-focused walkthrough.

---

## Features

### Edit Modes

**Styler Edit** — Select a paragraph, add an optional instruction ("make concise"), get a style-matched suggestion.

**Vibe Edit** — Apply vibes (Polish, Concise, Formal, Engaging, Academic) to multiple paragraphs or the whole document.

### Interactive Editing

- **Word-level diffs** — Toggle individual changes before accepting
- **Iterative refinement** — Not satisfied? Add feedback, click Refine, get a better edit
- **Quick feedback chips** — One-click feedback: "Too clunky", "Lost intent", "Too many edits"

### Style Controls

| Control | Range | Effect |
|---------|-------|--------|
| **Verbosity** | Terse ↔ Detailed | Compression vs. expansion |
| **Formality** | Casual ↔ Formal | Contractions, register, tone |
| **Hedging** | Confident ↔ Cautious | Qualifiers and uncertainty |

### Document Intelligence

- **Auto-synthesized goals** — System infers document objectives, guides all edits
- **Paragraph intent** — Understands each paragraph's role in the document
- **Section awareness** — Edits respect document structure

### Format Support

- **LaTeX** — Preserves commands, environments, math mode
- **Markdown** — Maintains headers, lists, code blocks
- **Smart splitting** — Syntax-aware document segmentation

### Quality of Life

- **Audience profiles** — Switch contexts instantly (journal → blog → grant)
- **Version history** — Full undo/redo, compare any versions
- **Auto-save** — Never lose work
- **Dark mode** — System, light, or dark theme
- **Local storage** — All data stays on your machine

---

## Learning System

Styler learns from your feedback without memorizing specific word choices:

| Signal | How It's Used |
|--------|---------------|
| **Rejection feedback** | "Too formal" → decrease formality preference |
| **Partial accepts** | Toggled-off changes become avoid patterns |
| **Decision history** | Patterns extracted across multiple edits |

**Conservative by design:** Word avoidance rules require 5+ consistent rejections before activating. This prevents over-fitting to single decisions.

---

## Use Cases

**Academic Writing**
- Research papers with consistent voice across sections
- Grant proposals with appropriate hedging for reviewers
- Thesis chapters that maintain your style

**Professional Documents**
- Technical docs with standardized terminology
- Reports matching organizational style guides
- Proposals calibrated for different audiences

**Content Creation**
- Blog posts that sound like you
- Documentation with consistent technical writing
- Batch editing across multiple documents

---

## Project Structure

```
src/
├── agents/                    # ADAPT multi-agent system
│   ├── orchestrator-agent.ts  # Main coordination loop
│   ├── intent-agent.ts        # Document goals & paragraph intent
│   ├── critique-agent.ts      # Edit evaluation & learning
│   ├── prompt-agent.ts        # Style-aware prompt building
│   └── constraint-extraction-agent.ts
├── app/
│   ├── editor/                # Main editor page
│   ├── settings/              # Global configuration
│   └── api/                   # API routes
├── components/
│   ├── DiffView.tsx           # Interactive diff display
│   ├── DocumentProfilePanel.tsx  # Per-document preferences
│   └── ...
├── memory/                    # Preference storage
│   ├── preference-store.ts    # Global preferences
│   └── document-preferences.ts  # Document-specific learning
└── providers/                 # LLM integrations
    ├── anthropic.ts
    ├── openai.ts
    └── ollama.ts
```

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS |
| **Editor** | CodeMirror 6 with syntax highlighting |
| **AI** | Anthropic Claude, OpenAI GPT-4, Ollama |
| **Storage** | Local JSON files (no cloud dependency) |

---

## Documentation

- **[Whitepaper](WHITEPAPER.md)** — Comprehensive system documentation
- **[Technical Blog](BLOG.md)** — Developer-focused architecture walkthrough

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
