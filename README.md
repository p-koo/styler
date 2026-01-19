<p align="center">
  <img src="public/logo.png" alt="Styler Logo" width="150">
</p>

<h1 align="center">Styler</h1>

<p align="center">
  An agentic AI system for document editing that learns and applies your personal writing style.<br>
  Designed for researchers, academics, and professionals who need consistent, high-quality writing assistance for papers, grants, and technical documents.
</p>

## What is Styler?

Styler is a multi-agent AI system that goes beyond simple text editing. It uses a coordinated system of specialized AI agents to:

1. **Learn your writing style** from your existing work (ChatGPT conversations, documents)
2. **Generate style-aligned edits** that match your preferences for verbosity, formality, and tone
3. **Critique and refine suggestions** through an iterative feedback loop
4. **Adapt continuously** based on which edits you accept or reject

Unlike generic AI writing tools, Styler maintains your authentic voice while improving clarity and consistency.

## Use Cases

### Academic Writing
- **Research Papers**: Maintain consistent scientific writing style across sections
- **Grant Proposals**: Ensure appropriate tone and hedging for funding applications
- **Thesis/Dissertation**: Keep voice consistent across chapters written over months or years

### Professional Documents
- **Technical Documentation**: Standardize terminology and explanation depth
- **Reports**: Match organizational writing standards
- **Proposals**: Calibrate formality for different audiences

## Agentic Architecture

Styler uses a multi-agent architecture where specialized agents collaborate to produce high-quality edits:

```
┌─────────────────────┐     ┌─────────────────────┐
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
│  Document Profile   │                │
│  (per-document      │                │
│   preferences)      │◀───────────────┘
└─────────┬───────────┘
          │
          │         ┌─────────────────────┐
          │         │   User Input        │
          │         │   (text + instruction)
          │         └─────────┬───────────┘
          │                   │
          ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Agent                       │
│             Coordinates the edit-critique loop              │
│                                                             │
│  ┌─────────────┐    ┌─────────┐    ┌──────────────┐         │
│  │Prompt Agent │───▶│  LLM    │───▶│Critique Agent│         │
│  │             │    │ (edit)  │    │              │         │
│  │Builds style-│    └─────────┘    │Evaluates     │         │
│  │aware prompt │                   │alignment     │         │
│  └─────────────┘                   └──────┬───────┘         │
│        ▲                                  │                 │
│        │         Refine if needed         │                 │
│        └──────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Suggested Edit  │
                   └─────────────────┘
```

### Agent Descriptions

| Agent | Role | Key Functions |
|-------|------|---------------|
| **Orchestrator Agent** | Coordinator | Manages the edit-critique-refine loop, handles retries until quality threshold is met |
| **Prompt Agent** | Context Builder | Constructs style-aware prompts from audience profile and document preferences |
| **Critique Agent** | Quality Evaluator | Scores edit alignment (0-1), identifies style issues, suggests improvements |
| **Constraint Extraction Agent** | Requirements Parser | Analyzes grant calls, style guides, and submission requirements; extracts structured constraints into document profile |
| **Learning Agent** | Preference Updater | Analyzes accept/reject patterns, updates document profile over time |

### Iterative Refinement

When you request an edit, the system:

1. **Generates** an initial edit using your style preferences
2. **Critiques** the edit for alignment with your preferences
3. **Refines** if alignment score < 0.8 (configurable threshold)
4. **Repeats** up to 3 iterations until quality threshold is met
5. **Presents** the best version for your review

## Features

### Style Learning & Profiles

#### Bootstrap from ChatGPT
Export your ChatGPT conversation history and upload it to Styler. The system analyzes your writing patterns to extract:
- Vocabulary preferences and word frequency patterns
- Sentence structure and complexity preferences
- Formality and hedging tendencies
- Topic-specific terminology

#### Audience Profiles
Create multiple profiles for different contexts:
- "Academic Journal" - formal, precise, appropriately hedged
- "Grant Proposal" - persuasive, clear impact statements
- "Technical Blog" - accessible, engaging, example-rich

#### Document-Specific Adjustments
Each document maintains its own preference layer:
- Fine-tune verbosity, formality, hedging via sliders
- Add document-specific words to avoid
- Include framing guidance ("emphasize novelty", "be concise")

### Editing Interface

#### Paragraph Selection
- Click to select a single paragraph
- Shift+click for range selection
- Cmd/Ctrl+click for multi-select

#### Edit Suggestions
```
Original (224 words):
"It is important to note that the methodology that was employed
in this study represents a significant advancement over previous
approaches that have been utilized in the field..."

Suggested with Terse mode (156 words, -30%):
"Our methodology significantly advances previous approaches..."
```

#### Interactive Diff Views

**Inline View**: Best for single paragraphs
- Word-level diff highlighting
- Click any change to toggle accept/reject
- Shows removed (red) and added (green) inline

**Side-by-Side View**: Best for multi-paragraph edits
- Original on left, suggested on right
- Highlighted differences on both sides
- Resizable partition

### Real-time Adjustments

#### Verbosity Slider (Terse ↔ Detailed)
| Setting | Effect | Target |
|---------|--------|--------|
| Terse (-2) | Aggressive compression | 30-50% fewer words |
| Moderate (0) | Balanced | Minimal change |
| Detailed (+2) | Expansion encouraged | Add context/examples |

#### Formality Slider (Casual ↔ Formal)
| Setting | Effect |
|---------|--------|
| Casual (-2) | Contractions, first person, conversational |
| Moderate (0) | Professional but accessible |
| Formal (+2) | No contractions, third person, academic register |

#### Hedging Slider (Confident ↔ Cautious)
| Setting | Effect |
|---------|--------|
| Confident (-2) | Remove "may", "might", "suggests" |
| Moderate (0) | Balanced assertions |
| Cautious (+2) | Add qualifiers, acknowledge uncertainty |

### Learning from Feedback

#### Accept/Reject Tracking
Every edit decision is recorded:
```
Accept → System learns this style aligns with preferences
Reject → System adjusts to avoid similar suggestions
Partial → System learns nuanced preferences from your modifications
```

#### Quick Feedback Buttons
One-click feedback for common issues:
- "Too long" / "Too short"
- "Too formal" / "Too casual"
- "Too hedged" / "Too bold"

### Document Management

- **Auto-save**: Changes save automatically (1-second debounce)
- **Version History**: Undo/redo with full paragraph history
- **Export**: Download as `.txt` with timestamped filename
- **Multiple Documents**: Switch between documents, each with own preferences

## Installation

### Prerequisites

- **Node.js 18+** and **npm**
- **API Key** for at least one provider:
  - [Anthropic API](https://console.anthropic.com/) (Claude) - Recommended
  - [OpenAI API](https://platform.openai.com/)
  - [Ollama](https://ollama.ai/) (local, free)

#### Installing Node.js

**macOS** (using Homebrew):
```bash
brew install node@20
```

**macOS/Linux** (using nvm - recommended):
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart terminal, then install Node.js
nvm install 20
nvm use 20
```

**Windows** (using winget):
```bash
winget install OpenJS.NodeJS.LTS
```

**Windows** (using installer):
Download from [nodejs.org](https://nodejs.org/) and run the installer.

Verify installation:
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

### Quick Start

```bash
# Clone the repository
git clone https://github.com/p-koo/styler.git
cd styler

# Install dependencies
npm install

# Configure API keys
cp .env.example .env.local
# Edit .env.local and add your API keys:
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...

# Start the development server
npm run dev

# Open http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | Yes* | OpenAI API key for GPT models |
| `OLLAMA_BASE_URL` | No | Custom Ollama endpoint (default: http://localhost:11434) |

*At least one API key is required.

## Usage Guide

### First-Time Setup

1. **Open Settings** (link in top-right corner)
2. **Configure LLM Provider**: Select your preferred model
3. **Bootstrap Style** (optional): Upload ChatGPT export to learn your style
4. **Create Audience Profiles** (optional): Set up profiles for different contexts

### Editing a Document

1. **Create/Import Document**
   - Click "+New" in the Documents panel
   - Paste text or upload a `.txt` file

2. **Select Content**
   - Click a paragraph to select it
   - Use Shift+click for multiple paragraphs

3. **Request Edit**
   - Add optional instruction (e.g., "make more concise")
   - Click "Get Edit Suggestion"
   - Wait for the agentic loop to complete

4. **Review & Apply**
   - Review the diff (inline or side-by-side)
   - Toggle individual changes if desired
   - Click "Apply" to accept or "Discard" to reject

5. **Fine-tune**
   - Open "Doc Profile" panel
   - Adjust sliders based on results
   - Add words to avoid or framing guidance

### Working with Academic Papers

**Example: Tightening a Methods Section**

```
Instruction: "Make more concise while preserving technical accuracy"
Verbosity: Terse (-2)
Formality: Formal (+2)
Hedging: Moderate (0)
```

**Example: Softening Claims for Peer Review**

```
Instruction: "Add appropriate hedging for empirical claims"
Verbosity: Moderate (0)
Formality: Formal (+2)
Hedging: Cautious (+2)
```

### Working with Grant Proposals

**Example: Strengthening Impact Statements**

```
Instruction: "Make the impact more compelling and direct"
Verbosity: Moderate (0)
Formality: Formal (+1)
Hedging: Confident (-1)
```

## Project Structure

```
src/
├── agents/                     # Agentic AI system
│   ├── orchestrator-agent.ts  # Main coordination loop
│   ├── critique-agent.ts      # Edit quality evaluation
│   ├── prompt-agent.ts        # Style-aware prompt construction
│   ├── constraint-extraction-agent.ts  # Parse grant calls/style guides
│   └── gen-alpha-agent.ts     # Easter egg: Gen Alpha mode
├── app/
│   ├── api/
│   │   ├── document/          # Edit generation endpoints
│   │   ├── documents/         # Document CRUD + preferences
│   │   └── preferences/       # Global style preferences
│   ├── editor/                # Main editor interface
│   └── settings/              # Configuration UI
├── components/
│   ├── DiffView.tsx           # Inline + side-by-side diffs
│   └── DocumentProfilePanel.tsx # Per-document preferences
├── memory/
│   ├── preference-store.ts    # Global preferences persistence
│   └── document-preferences.ts # Document-level preferences
├── providers/                  # LLM provider integrations
│   ├── anthropic.ts
│   ├── openai.ts
│   └── ollama.ts
└── types/                      # TypeScript definitions
```

## Configuration Reference

### Base Style Options

| Option | Type | Description |
|--------|------|-------------|
| `verbosity` | terse \| moderate \| detailed | Default verbosity level |
| `formalityLevel` | 1-5 | 1=casual, 5=formal academic |
| `hedgingStyle` | confident \| balanced \| cautious | Assertion confidence |
| `avoidWords` | string[] | Words to never use |
| `preferredWords` | Record<string, string> | Word substitutions |

### Document Preferences

| Option | Type | Range | Description |
|--------|------|-------|-------------|
| `verbosityAdjust` | number | -2 to +2 | Adjust from base style |
| `formalityAdjust` | number | -2 to +2 | Adjust from base style |
| `hedgingAdjust` | number | -2 to +2 | Adjust from base style |
| `additionalAvoidWords` | string[] | - | Document-specific words to avoid |
| `additionalFramingGuidance` | string[] | - | Custom instructions |

## Troubleshooting

### "Edit suggestions are too long/short"
→ Adjust the Verbosity slider in Doc Profile

### "Edits don't match my style"
→ Bootstrap from your ChatGPT history, or manually adjust sliders

### "Changes are too aggressive"
→ Use the inline diff view to toggle individual changes

### "API errors"
→ Check your API key in `.env.local` and verify billing is active

## Contributing

Contributions are welcome! Please open an issue to discuss proposed changes before submitting a PR.

## License

MIT

## Acknowledgments

Built with Claude Code by Anthropic.
