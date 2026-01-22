# Styler: Adaptive Document Editing with Multi-Agent AI

## Abstract

Styler is an AI-powered document editor that learns and adapts to your personal writing style. Unlike generic AI writing assistants that impose a uniform voice, Styler preserves your authentic style while improving clarity, consistency, and flow. At its core is **ADAPT** (Adaptive Document Alignment via Prompt Transformations)—a multi-agent system that coordinates specialized AI agents to understand context, analyze intent, generate style-aligned suggestions, and continuously improve through your feedback.

---

## 1. Introduction

### The Problem with Generic AI Writing Tools

Traditional AI writing assistants treat all users the same. They apply generic improvements that often strip away the writer's unique voice, resulting in homogenized text that sounds like every other AI-assisted document. Writers face a frustrating trade-off: accept AI suggestions that don't sound like them, or spend time manually reverting changes to preserve their style.

### The Styler Approach

Styler takes a fundamentally different approach:

1. **Learn from your writing history** — Import ChatGPT conversations or existing documents to bootstrap your style profile
2. **Preserve your voice** — Edits align with your established patterns for formality, hedging, verbosity, and word choice
3. **Continuous improvement** — Every accept/reject decision teaches the system more about your preferences
4. **Context-aware editing** — Understand document structure, paragraph intent, and section purpose before suggesting changes

---

## 2. System Architecture

### 2.1 Multi-Agent Coordination

Styler's intelligence comes from coordinating five specialized agents:

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                        │
│         Coordinates the edit-critique-refine loop            │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  INTENT AGENT   │  │  PROMPT AGENT   │  │ CRITIQUE AGENT  │
│                 │  │                 │  │                 │
│ • Document goals│  │ • Style merging │  │ • Alignment     │
│ • Paragraph     │  │ • Context       │  │   scoring       │
│   purpose       │  │   building      │  │ • Issue         │
│ • Connection    │  │ • Mode-specific │  │   detection     │
│   analysis      │  │   instructions  │  │ • Learning      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Orchestrator Agent**: The central coordinator that manages the edit-critique-refine loop. It calls the Intent Agent before generating edits, manages up to 3 refinement iterations, and ensures edits meet a quality threshold (alignment score ≥ 0.8) before presenting to the user.

**Intent Agent**: Analyzes document goals and paragraph purpose. Before any edit, it determines what each paragraph is trying to accomplish and how it connects to surrounding content. This ensures edits preserve semantic intent rather than just surface-level style.

**Prompt Agent**: Builds context-aware prompts by combining style preferences, document goals, section context, and learned rules. It handles syntax-specific instructions for LaTeX, Markdown, and plain text.

**Critique Agent**: Evaluates edit quality on a 0-1 alignment scale, identifies issues (verbosity, formality, word choice, structure, tone), and predicts user acceptance probability. Triggers re-generation if alignment is too low.

**Constraint Extraction Agent**: Parses external requirements (journal guidelines, grant calls, style guides) and converts them into structured rules that inform the editing process.

### 2.2 Edit-Critique-Refine Loop

```
User Request
     │
     ▼
┌─────────────────┐
│ Intent Analysis │ ← Analyze paragraph purpose + document goals
└────────┬────────┘
         ▼
┌─────────────────┐
│ Prompt Building │ ← Combine style, intent, context, learned rules
└────────┬────────┘
         ▼
┌─────────────────┐
│ LLM Generation  │ ← Generate initial edit
└────────┬────────┘
         ▼
┌─────────────────┐
│    Critique     │ ← Evaluate alignment (0-1 score)
└────────┬────────┘
         │
         ▼
    Score < 0.8? ───Yes──→ Refine (up to 3 iterations)
         │                        │
         No                       │
         │                        │
         ▼                        │
┌─────────────────┐               │
│ Present to User │ ←─────────────┘
└────────┬────────┘
         ▼
┌─────────────────┐
│  User Decision  │ ← Accept / Reject / Partial
└────────┬────────┘
         ▼
┌─────────────────┐
│    Learning     │ ← Update preferences based on decision
└─────────────────┘
```

---

## 3. Preference System

Styler uses a three-layer preference stack that enables both global consistency and document-specific customization.

### 3.1 Layer 1: Base Style (Global)

Your fundamental writing preferences that apply everywhere:

| Dimension | Options |
|-----------|---------|
| **Verbosity** | Terse, Moderate, Detailed |
| **Formality** | 1-5 scale (casual → formal) |
| **Hedging** | Confident, Balanced, Cautious |
| **Format Rules** | Ban/require emojis, em-dashes, headers, etc. |
| **Learned Rules** | Patterns extracted from your feedback |

### 3.2 Layer 2: Audience Profiles (Global, Switchable)

Context-specific overlays for different writing scenarios:

- **Academic Journal**: Heavy jargon, high formality, comprehensive length
- **Grant Proposal**: Moderate jargon, confident hedging, emphasis on impact
- **Technical Blog**: Minimal jargon, moderate formality, engaging tone
- **Business Report**: Professional tone, structured format, concise

Profiles can be created manually, extracted from ChatGPT conversation exports, or inferred from document samples.

### 3.3 Layer 3: Document Adjustments (Per-Document)

Fine-grained controls specific to each document:

| Control | Range | Effect |
|---------|-------|--------|
| **Verbosity Adjust** | -2 to +2 | More terse ↔ More detailed |
| **Formality Adjust** | -2 to +2 | Less formal ↔ More formal |
| **Hedging Adjust** | -2 to +2 | More confident ↔ More cautious |

Plus document-specific:
- Additional words to avoid/prefer
- Custom framing guidance
- Learned rules from this document's edit history
- Document goals (auto-synthesized, user-editable)

---

## 4. Learning System

### 4.1 How Styler Learns

Styler learns from three sources of signal:

**1. Explicit Feedback (Highest Signal)**

When you reject an edit, you can specify why:
- Too formal / Too casual
- Too verbose / Too terse
- Changed meaning
- Over-edited
- Wrong tone
- Bad word choice
- Lost nuance

These map directly to preference adjustments with high confidence.

**2. Diff Pattern Learning**

When you partially accept an edit (toggle some changes off), Styler learns:
- Which word substitutions you consistently reject
- Which structural changes you prefer
- Patterns in what you accept vs. revert

**3. Decision History**

Every accept/reject decision is recorded:
- Original text
- Suggested edit
- Final text (after your modifications)
- Decision type and timestamp
- Any explicit feedback

Over time, patterns emerge that refine the system's understanding of your preferences.

### 4.2 Conservative Learning

Styler is deliberately conservative to avoid over-fitting:

- Word avoidance rules require **5+ consistent rejections** before activating
- Similar rules are **consolidated** rather than duplicated
- Confidence scores determine rule priority
- Contradictory signals are **not** learned (prevents oscillation)

---

## 5. Edit Modes

### 5.1 Styler Edit

Focused, instruction-driven editing for individual paragraphs:

1. Select a paragraph
2. Optionally add an instruction ("make more concise", "add hedging")
3. Review the suggested edit with inline or side-by-side diff
4. Toggle individual word-level changes
5. Accept, reject, or refine further

**Quick Style Templates:**
- Make concise
- Fix grammar
- Improve clarity
- Add hedging
- More formal
- Simplify

### 5.2 Vibe Edit

Document-level editing with preset "vibes":

| Vibe | Effect |
|------|--------|
| **Polish** | Refine for clarity and flow |
| **Concise** | Make more direct and succinct |
| **Formal** | Increase professionalism |
| **Engaging** | Make more compelling |
| **Clear** | Improve readability |
| **Academic** | Adjust for scholarly standards |

Vibes can be combined with custom guidance for nuanced control.

### 5.3 Multi-Cell Editing

Select multiple paragraphs to edit them together:

1. System merges selected cells into a unified block
2. Applies edit instruction across the entire selection
3. Considers cross-paragraph flow and transitions
4. On accept, intelligently splits back into separate paragraphs

Useful for:
- Improving transitions between paragraphs
- Restructuring argument flow
- Reducing redundancy across sections

### 5.4 Keyboard Shortcuts

Full keyboard navigation for power users:

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate between cells |
| `Shift + ↑/↓` | Extend selection |
| `Enter` | Edit selected cell |
| `Escape` | Exit edit mode / clear selection |
| `Delete` / `Backspace` | Delete selected cells |
| `Cmd/Ctrl + C` | Copy selected cells |
| `Cmd/Ctrl + X` | Cut selected cells |
| `Cmd/Ctrl + V` | Paste cells |
| `Cmd/Ctrl + A` | Select all cells |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |

### 5.5 Cell Controls

Each cell has a hover toolbar (Colab-style):
- **Move Up/Down**: Reorder cells with one click
- **Delete**: Remove the cell

---

## 6. Interactive Refinement

### 6.1 Word-Level Toggle

Every suggested edit is presented as a diff with toggleable changes:

```
Original: The methodology was implemented using standard procedures.
                              ▼
Suggested: The methodology was [executed] using [established] procedures.
                                   │              │
                               [toggle]       [toggle]
```

Click any change to revert it to the original. Your toggles are preserved if you request further refinement.

### 6.2 Iterative Refinement Loop

Not satisfied with the suggestion? Click **Refine**:

1. Your current text (with accepted/rejected toggles applied) becomes the starting point
2. Add custom feedback: "keep the original word choice for X" or "make this sound more confident"
3. System generates a new edit that honors your feedback
4. Repeat until satisfied

This creates a collaborative loop where you guide the AI toward exactly what you want.

### 6.3 Quick Feedback Chips

For common issues, use quick feedback chips instead of typing:

- **Imprecise** — Word choices aren't accurate enough
- **Not logical** — Argument flow doesn't make sense
- **Too clunky** — Phrasing is awkward
- **Lost intent** — Original meaning was changed
- **Too vague** — Needs more specificity
- **Poor flow** — Transitions are jarring
- **Too many edits** — Over-edited, keep more original text

---

## 7. Document Intelligence

### 7.1 Document Goals

On first edit, Styler's Intent Agent synthesizes document goals:

```
Summary: Research paper demonstrating novel approach to X
Objectives:
  1. Establish problem significance
  2. Present methodology clearly
  3. Demonstrate results validity
  4. Position contribution in field
Main Argument: Our approach outperforms existing methods because...
Audience Needs: Technical depth for reviewers, clarity for broad readership
Success Criteria: Accepted at target venue
```

Goals are:
- **Auto-generated** from document content
- **User-editable** for refinement
- **Lockable** to prevent auto-updates
- **Used by all agents** to ensure edits support document purpose

### 7.2 Paragraph Intent Analysis

Before editing any paragraph, the Intent Agent determines:

- **Purpose**: What is this paragraph trying to accomplish?
- **Connection to previous**: How does it flow from what came before?
- **Connection to next**: How does it set up what comes after?
- **Role in document goals**: How does it support the overall objectives?

This ensures edits preserve the paragraph's function within the larger document structure.

---

## 8. Syntax Support

### 8.1 Auto-Detection

Styler automatically detects document syntax:

| Mode | Detection Patterns |
|------|-------------------|
| **LaTeX** | `\begin{}`, `\end{}`, `\section{}`, `$...$` |
| **Markdown** | `# headers`, `**bold**`, `- lists`, ` ```code``` ` |
| **Plain** | No special syntax detected |

### 8.2 Syntax-Aware Editing

Each mode has specialized handling:

**LaTeX:**
- Preserves `\begin{}`/`\end{}` environment pairs
- Maintains math mode (`$...$`, `$$...$$`)
- Smart-splits respect LaTeX structure
- Generation enforces complete tags

**Markdown:**
- Preserves header hierarchy
- Maintains list structure
- Respects code block boundaries
- Keeps link/image syntax intact

---

## 9. Chat Assistant

An integrated chat panel provides interactive assistance alongside the editor.

### 9.1 Chat Modes

**General Chat**: Ask writing questions, get style advice, discuss best practices. Uses your configured preferences to tailor recommendations.

**Document Chat**: Select specific cells and get targeted feedback:
- Analysis of how well content aligns with your style
- Suggestions for improvement
- Discussion of tone, clarity, and structure

### 9.2 Alignment Score

Request an alignment score to see how well your content matches your preference profile:

```
Alignment Score: 0.82
Profiles Used: Base (moderate verbosity), Academic Journal
Analysis: Content aligns well with formal academic style.
          Hedging is appropriate but verbosity could be reduced.
Suggestions:
  - Consider tightening the opening paragraph
  - Some sentences could be more direct
```

The alignment analysis uses the same Critique Agent infrastructure as the edit loop.

---

## 10. Prettify (Document Cleanup)

The Prettify function cleans up messy imports (especially from PDFs):

- **Merge fragmented sentences** into proper paragraphs
- **Remove PDF artifacts** — page numbers, line numbers, `[1]` references
- **Fix broken words** split across lines (e.g., "docu-\nment" → "document")
- **Remove noise** — random characters, garbled text
- **Group LaTeX packages** compactly (no blank lines between `\usepackage` commands)

Unlike conservative formatting tools, Prettify is aggressive—it removes artifacts rather than preserving them.

---

## 11. Technical Details

### 11.1 Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, CodeMirror
- **Backend**: Next.js API Routes
- **LLM Providers**: Anthropic Claude, OpenAI GPT, Ollama (local)
- **Storage**: Local JSON files (no cloud dependency)

### 11.2 Key Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Alignment threshold | 0.8 | Minimum score before presenting to user |
| Strong misalignment | 0.5 | Triggers aggressive corrections |
| Max iterations | 3 | Refinement attempts before giving up |
| Edit temperature | 0.25 | Low for consistent edits |
| Generation temperature | 0.6 | Higher for creative content |

### 11.3 Privacy

- **All data stored locally** — Documents, preferences, and history never leave your machine
- **API calls contain only document text** — No metadata or user information transmitted
- **No cloud sync** — Full control over your data

---

## 12. Getting Started

### 12.1 Initial Setup

1. Configure API keys (Anthropic, OpenAI, or Ollama for local inference)
2. Optionally import ChatGPT conversation history to bootstrap your style profile
3. Create or adjust audience profiles for your common writing contexts

### 12.2 Editing Workflow

1. **Load document** — Paste, import, or start fresh
2. **Set context** — Choose audience profile, adjust style sliders
3. **Select and edit** — Click paragraphs, add instructions, review suggestions
4. **Refine** — Toggle changes, add feedback, iterate until satisfied
5. **Accept** — Commit changes that work; reject those that don't
6. **Learn** — System improves with every decision

### 12.3 Building Your Profile

The more you use Styler, the better it understands you:

- **Week 1**: Basic style alignment from initial settings
- **Month 1**: Refined preferences from edit decisions
- **Ongoing**: Continuously improving as patterns emerge

---

## 13. Conclusion

Styler represents a new approach to AI-assisted writing: one that treats your voice as something to preserve rather than override. Through multi-agent coordination, intent analysis, and continuous learning, it delivers suggestions that sound like you—just polished.

The system is designed for writers who want AI assistance without AI homogenization. Whether you're writing academic papers, business reports, or creative content, Styler adapts to your style rather than imposing its own.

---

## Appendix: Agent Details

### Orchestrator Agent
- **File**: `src/agents/orchestrator-agent.ts`
- **Role**: Central coordination
- **Key functions**: `orchestrateEdit()`, `generateEdit()`

### Intent Agent
- **File**: `src/agents/intent-agent.ts`
- **Role**: Document/paragraph analysis
- **Key functions**: `analyzeIntent()`, `synthesizeDocumentGoals()`

### Prompt Agent
- **File**: `src/agents/prompt-agent.ts`
- **Role**: Context-aware prompt building
- **Key functions**: `buildSystemPrompt()`, `buildDocumentContextPrompt()`

### Critique Agent
- **File**: `src/agents/critique-agent.ts`
- **Role**: Edit evaluation and learning
- **Key functions**: `critiqueEdit()`, `learnFromDecision()`, `learnFromDiff()`

### Constraint Extraction Agent
- **File**: `src/agents/constraint-extraction-agent.ts`
- **Role**: External requirement parsing
- **Key functions**: `extractConstraints()`
