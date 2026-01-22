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

## Installation

### Quick Install (Recommended)

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| **macOS** | [Styler-1.2.3.dmg](https://github.com/p-koo/styler/releases/latest) |
| **Windows** | Coming soon |
| **Linux** | Coming soon |

1. Download and open the DMG
2. Drag Styler to Applications
3. Remove quarantine (required for unsigned apps):
   ```bash
   sudo xattr -rd com.apple.quarantine /Applications/Styler.app
   ```
4. Launch Styler
5. Configure your API key in Settings

> **Note:** You'll need an API key from [Anthropic](https://console.anthropic.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) to use Styler.

### Developer Installation

For developers who want to run from source or contribute:

```bash
# Clone and install
git clone https://github.com/p-koo/styler.git
cd styler && npm install

# Configure API key (choose one method)

# Option A: Via Settings UI (recommended)
npm run dev
# Open http://localhost:3000/settings and add your API key

# Option B: Via environment file
cp .env.example .env.local
# Edit .env.local with your key:
# ANTHROPIC_API_KEY=sk-ant-...  (recommended)
# or OPENAI_API_KEY=sk-...

# Run development server
npm run dev
# Open http://localhost:3000
```

#### Building the Desktop App

```bash
# Build for macOS
npm run electron:build:mac

# Build for Windows
npm run electron:build:win

# Build for Linux
npm run electron:build:linux

# Output will be in dist/
```

---

## Requirements

### For Desktop App (Quick Install)
- **macOS 10.15+** (Catalina or later)
- **API Key** from Anthropic or OpenAI (see below)

### For Development
- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm** or **yarn** — Comes with Node.js

### API Keys (at least one required)
| Provider | Get API Key | Notes |
|----------|-------------|-------|
| **Anthropic** (recommended) | [console.anthropic.com](https://console.anthropic.com/) | Claude models, best quality |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/) | GPT-4 models |
| **Ollama** | [ollama.ai](https://ollama.ai/) | Free, runs locally |

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.x | React framework |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| CodeMirror | 6.x | Text editor |
| Anthropic SDK | 0.71.x | Claude API |
| OpenAI SDK | 6.x | GPT API |

<details>
<summary>Full dependency list</summary>

```json
{
  "@anthropic-ai/sdk": "^0.71.2",
  "@codemirror/commands": "^6.10.1",
  "@codemirror/lang-markdown": "^6.5.0",
  "@codemirror/language": "^6.12.1",
  "@codemirror/language-data": "^6.5.2",
  "@codemirror/legacy-modes": "^6.5.2",
  "@codemirror/state": "^6.5.4",
  "@codemirror/theme-one-dark": "^6.1.3",
  "@codemirror/view": "^6.39.11",
  "next": "^16.1.3",
  "openai": "^6.16.0",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "tailwindcss": "^4.1.18",
  "typescript": "^5.9.3"
}
```
</details>

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
| **Critique** | Fast edit evaluation during the edit loop (user waiting) |
| **Learning** | Thorough preference learning after decisions (user not waiting) |

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
- **Cell controls** — Move cells up/down, delete with toolbar buttons (Colab-style)
- **Prettify** — AI-powered cleanup for PDF imports: merge fragments, remove artifacts, fix formatting

### Chat Assistant

- **General Chat** — Ask questions about writing, get advice based on your document profile
- **Document Chat** — Get feedback on selected cells, analyze alignment with your style
- **Alignment Score** — See how well your content matches your configured preferences

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

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected cells |
| `Enter` | Edit selected cell |
| `Escape` | Exit edit mode / clear selection |
| `↑` / `↓` | Navigate between cells |
| `Shift + ↑/↓` | Extend selection |
| `Cmd/Ctrl + A` | Select all cells |
| `Cmd/Ctrl + C` | Copy selected cells |
| `Cmd/Ctrl + X` | Cut selected cells |
| `Cmd/Ctrl + V` | Paste cells |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |

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
│   ├── critique-agent.ts      # Fast edit evaluation (latency-critical)
│   ├── learning-agent.ts      # Preference learning from feedback
│   ├── prompt-agent.ts        # Style-aware prompt building
│   └── constraint-extraction-agent.ts
├── app/
│   ├── editor/                # Main editor page
│   ├── settings/              # Global configuration
│   └── api/                   # API routes
├── components/
│   ├── DiffView.tsx           # Interactive diff display
│   ├── DocumentProfilePanel.tsx  # Per-document preferences
│   ├── ChatPanel.tsx          # Chat assistant sidebar
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
| **Desktop** | Electron 40 |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS |
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
