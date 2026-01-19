# Styler

AI-powered document editing with personalized style preferences. Styler learns your writing style from your ChatGPT conversation history and applies it to help you edit documents consistently.

## Overview

Styler is a document editor that uses LLMs to suggest edits aligned with your personal writing style. Instead of generic AI editing, Styler learns your preferences for verbosity, formality, hedging, word choices, and more—then applies these preferences when suggesting improvements to your text.

## Key Features

- **Style Learning**: Bootstrap your preferences from ChatGPT conversation exports
- **Document-Specific Profiles**: Each document can have its own style adjustments
- **Interactive Diff Views**: Inline and side-by-side views with word-level highlighting
- **Accept/Reject Learning**: The system learns from which edits you accept or reject
- **Multiple LLM Support**: Works with Anthropic (Claude), OpenAI, and local Ollama models
- **Real-time Adjustments**: Sliders for verbosity, formality, and hedging
- **Auto-save**: Documents save automatically as you work

## Workflow

### 1. Bootstrap Your Style (Optional)

Export your ChatGPT conversations and upload them in Settings. Styler analyzes your writing patterns to create a base style profile including:
- Verbosity preferences (terse vs detailed)
- Formality level (casual vs academic)
- Hedging style (confident vs cautious)
- Words you frequently use or avoid
- Sentence structure patterns

### 2. Create or Import a Document

- Paste text directly into the editor
- Upload a `.txt` file
- Or start with AI-generated content from a prompt

### 3. Edit with AI Assistance

1. **Select a paragraph** by clicking on it
2. **Get edit suggestions** using the "Get Edit Suggestion" button
3. **Review the diff** showing exactly what changed
4. **Accept, reject, or modify** the suggested changes
5. The system learns from your decisions

### 4. Fine-tune with Document Profile

Each document has its own profile panel where you can:
- Adjust verbosity (Terse ↔ Detailed)
- Adjust formality (Casual ↔ Formal)
- Adjust hedging (Confident ↔ Cautious)
- Add words to avoid
- Add framing guidance

### 5. Export

Export your finished document as a `.txt` file.

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- API key for at least one LLM provider:
  - Anthropic API key (for Claude models)
  - OpenAI API key
  - Or local Ollama installation

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/p-koo/styler.git
   cd styler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your API keys:
   ```env
   ANTHROPIC_API_KEY=your-anthropic-key
   OPENAI_API_KEY=your-openai-key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Configuration

### LLM Providers

Configure your preferred LLM provider in Settings:

| Provider | Models | Notes |
|----------|--------|-------|
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | Recommended for best results |
| OpenAI | GPT-4, GPT-4 Turbo, GPT-3.5 | Good alternative |
| Ollama | Any local model | For offline/private use |

### Style Settings

Access the Settings page to configure:
- **Base Style**: Default writing preferences
- **Audience Profiles**: Pre-configured styles for different contexts
- **Bootstrap**: Import ChatGPT conversations to learn your style

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   │   ├── document/      # Document editing endpoints
│   │   ├── documents/     # Document storage endpoints
│   │   └── preferences/   # Style preferences endpoints
│   ├── editor/            # Main editor page
│   └── settings/          # Settings page
├── agents/                # LLM agent logic
│   ├── critique-agent.ts  # Evaluates edit quality
│   ├── edit-orchestrator.ts # Coordinates edit generation
│   └── prompt-agent.ts    # Builds style-aware prompts
├── components/            # React components
│   ├── DiffView.tsx       # Inline/side-by-side diff
│   └── DocumentProfilePanel.tsx # Document preferences UI
├── memory/                # Data persistence
│   ├── preference-store.ts # Style preferences storage
│   └── document-preferences.ts # Document-specific settings
├── providers/             # LLM provider integrations
│   ├── anthropic.ts
│   ├── openai.ts
│   └── ollama.ts
└── types/                 # TypeScript type definitions
```

## Usage Tips

- **Terse Mode**: Set verbosity to minimum for aggressive word reduction (targets 30-50% fewer words)
- **Batch Editing**: Select multiple paragraphs and use "Improve Flow" for coherent multi-paragraph edits
- **Quick Feedback**: Use the feedback buttons (Too long, Too formal, etc.) to quickly adjust preferences
- **Side-by-side View**: Better for reviewing longer edits; shows highlighted diffs on both sides

## License

MIT
