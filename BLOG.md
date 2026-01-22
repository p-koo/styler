# Building an AI Writing Assistant That Actually Sounds Like You

**How we built a multi-agent system that learns your writing style instead of replacing it**

---

If you've ever used ChatGPT to help edit your writing, you've probably noticed something: the output sounds like ChatGPT, not like you. It's polished, sure, but it's also generic. The hedging patterns, the word choices, the sentence structures—they're all distinctly AI.

We built Styler to solve this problem. It's an AI-powered document editor that learns your personal writing style and preserves it while improving clarity and flow. Here's how it works under the hood.

## The Core Problem: Style Drift

When you ask an LLM to "improve" your writing, it applies its default preferences:
- More hedging ("It could be argued that...")
- Certain word choices ("utilize" instead of "use")
- Generic transitions ("Furthermore," "Moreover,")
- A particular level of formality

These aren't bad choices—they're just not *your* choices. And when you're writing something that needs to sound like you (a research paper, a blog post, a grant proposal), this style drift is a real problem.

The naive solution is prompt engineering: "Edit this but keep my voice." But LLMs don't know what your voice *is*. They have no memory of how you write.

## Our Solution: ADAPT

We built **ADAPT** (Adaptive Document Alignment via Prompt Transformations)—a multi-agent system that coordinates specialized AI agents to understand your style, analyze document intent, generate aligned suggestions, and learn from your feedback.

The key insight: instead of sending text directly to an LLM with a generic "improve this" prompt, we orchestrate multiple agents that each handle a specific aspect of the editing process.

### The Agent Architecture

```
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR                        │
│   Coordinates the edit → critique → refine loop │
└─────────────────────────────────────────────────┘
                      │
       ┌──────────────┼──────────────┬──────────────┐
       ▼              ▼              ▼              ▼
   ┌────────┐    ┌────────┐    ┌──────────┐   ┌──────────┐
   │ INTENT │    │ PROMPT │    │ CRITIQUE │   │ LEARNING │
   │ AGENT  │    │ AGENT  │    │  AGENT   │   │  AGENT   │
   └────────┘    └────────┘    └──────────┘   └──────────┘
```

**Intent Agent**: Before editing anything, this agent analyzes what each paragraph is trying to accomplish. Is it introducing a concept? Providing evidence? Making a transition? This intent is preserved during editing.

**Prompt Agent**: Builds context-aware prompts by combining your style preferences, document goals, section context, and learned rules. Different prompts for LaTeX vs. Markdown vs. plain text.

**Critique Agent**: Evaluates every generated edit on a 0-1 alignment scale. If the score is below 0.8, it identifies specific issues and triggers re-generation. This creates a quality gate before anything reaches the user. Runs during the edit loop where latency matters.

**Learning Agent**: Analyzes accept/reject decisions to extract style adjustments, patterns, and rules that improve future edits. Runs after user decisions where latency is less critical, allowing for more thorough analysis.

**Orchestrator**: Coordinates the whole loop. Calls Intent Agent first, builds the prompt, generates an edit, runs critique, and iterates up to 3 times until quality threshold is met.

## The Three-Layer Preference Stack

Style isn't one-dimensional. You might write differently for a journal paper vs. a blog post vs. an email to a collaborator. We model this with three layers:

### Layer 1: Base Style (Global)

Your fundamental preferences:
```typescript
{
  verbosity: 'moderate',      // terse | moderate | detailed
  formality: 3,               // 1-5 scale
  hedgingStyle: 'balanced',   // confident | balanced | cautious
  activeVoice: true,
  formatBans: ['emoji'],
  learnedRules: [
    { rule: "Avoid 'utilize'", confidence: 0.85 }
  ]
}
```

### Layer 2: Audience Profiles (Switchable)

Context-specific overlays:
```typescript
{
  name: 'Academic Journal',
  jargonLevel: 'heavy',
  formality: 5,
  lengthGuidance: 'comprehensive',
  emphasisPoints: ['methodology', 'reproducibility']
}
```

### Layer 3: Document Adjustments (Per-Document)

Fine-grained sliders that modify the base + profile:
```typescript
{
  verbosityAdjust: -0.5,    // Slightly more terse for this doc
  formalityAdjust: 0,       // Keep profile default
  hedgingAdjust: +1.0,      // More cautious (it's a bold claim)
  additionalAvoidWords: ['breakthrough'],
  documentGoals: { /* synthesized by Intent Agent */ }
}
```

When generating an edit, all three layers merge. The Prompt Agent computes effective values and builds a prompt that reflects your complete preference stack.

### Example: How a Prompt Gets Built

Let's walk through a concrete example. Say you have these preferences configured:

**Base Style:**
```typescript
{
  verbosity: 'terse',
  formalityLevel: 4,  // High formality
  hedgingStyle: 'cautious',
  formatBans: ['emoji'],
  learnedRules: [
    { rule: "Prefer active voice", confidence: 0.85 }
  ]
}
```

**Active Audience Profile:** "Academic Journal"
```typescript
{
  jargonLevel: 'heavy',
  emphasisPoints: ['methodology', 'reproducibility'],
  lengthGuidance: { target: 'comprehensive' }
}
```

**Document Adjustments:** (for this specific paper)
```typescript
{
  hedgingAdjust: +1.0,  // Even more cautious than usual
  additionalAvoidWords: ['breakthrough', 'novel']
}
```

The Prompt Agent merges these and generates this system prompt:

```
You are a writing assistant that adapts to the user's personal writing style and preferences.

VERBOSITY: EXTREME COMPRESSION MODE - YOUR #1 PRIORITY IS CUTTING WORDS
TARGET: Remove 30-50% of words. If you only cut 10-20%, you have FAILED.
MANDATORY CUTS - DO ALL OF THESE:
1. DELETE these words EVERYWHERE: "that", "very", "really", "just"...
2. DELETE all weak openings: "It is important to note"...
[...]

FORMALITY: MAXIMUM FORMAL/ACADEMIC MODE - STRICT REQUIREMENT
- Use formal, academic language throughout. This is non-negotiable.
- NEVER use contractions. Replace: don't→do not, isn't→is not...
- Use third person. Avoid "I", "we", "you". Use "one", "the authors"...

HEDGING: CAUTIOUS MODE
- Use appropriate hedging language throughout.
- ADD qualifiers: "may", "might", "suggests", "appears to"...
- Acknowledge uncertainty and limitations explicitly.

FORMATTING: Never use: emojis.

SPECIFIC PREFERENCES:
- Prefer active voice

AUDIENCE CONTEXT: Academic Journal
Use appropriate technical terminology freely. Assume audience expertise.
Emphasize: methodology, reproducibility.
Provide comprehensive detail where appropriate.
```

This prompt goes to the LLM along with the text to edit. The combined effect:
- **Terse verbosity** aggressively cuts filler words
- **High formality** ensures academic register
- **Cautious hedging** adds appropriate qualifiers
- **No emojis** enforced by format rules
- **Active voice** from learned rules
- **Heavy jargon** allowed by audience profile

The result is an edit that sounds like *your* academic writing—compressed but hedged appropriately, formal but using terms your field expects.

## Learning From Feedback

The magic happens when you accept or reject edits. We learn from three signals:

### 1. Explicit Rejection Feedback

When you reject an edit, we ask why:
- Too formal / Too casual
- Changed meaning
- Over-edited
- Bad word choice

These map directly to preference adjustments:
```typescript
if (feedback === 'too_formal') {
  documentPrefs.formalityAdjust -= 0.3;
}
```

### 2. Diff Pattern Learning

When you partially accept an edit (toggle some changes off), we analyze the diff:
```
Suggested: "The results demonstrate that..."
You kept:  "The results show that..."
```

After seeing this pattern 5+ times, we learn: avoid "demonstrate" → "show" substitutions for this user.

### 3. Decision History Analysis

Every decision is recorded:
```typescript
{
  original: "We used standard methods.",
  suggested: "Standard methodologies were employed.",
  final: "We used standard methods.",  // User rejected
  decision: 'rejected',
  feedback: ['too_formal', 'changed_meaning']
}
```

Periodically, we analyze patterns across decisions to extract higher-level rules.

## The Edit-Critique-Refine Loop

Here's what happens when you click "Edit" on a paragraph:

```
1. Intent Analysis
   └─ "This paragraph introduces the methodology"
   └─ "Connects to: problem statement (before), results (after)"

2. Prompt Building
   └─ Merge base style + profile + document adjustments
   └─ Add intent context and section info
   └─ Include learned rules and avoid words

3. LLM Generation (temp=0.25 for consistency)
   └─ "Improve this paragraph: [text]"

4. Critique Evaluation
   └─ Alignment score: 0.72 (below threshold)
   └─ Issues: ["verbosity: added unnecessary hedge"]

5. Refinement (attempt 2)
   └─ Add critique feedback to prompt
   └─ Re-generate with issue awareness

6. Critique Again
   └─ Alignment score: 0.85 (passes!)

7. Present to User
   └─ Word-level diff with toggleable changes
```

The critique step is crucial. Without it, we'd show users edits that don't match their style. The 0.8 threshold ensures quality before presentation.

## Interactive Refinement: The Human in the Loop

Even with critique, sometimes the edit isn't quite right. That's where interactive refinement comes in.

When you see a suggested edit, you can:

1. **Toggle individual changes**: Click any word-level change to revert it
2. **Add feedback**: "Keep the original word choice for X"
3. **Click Refine**: Generate a new edit that honors your feedback

The refinement context is passed back to the orchestrator:
```typescript
{
  previousEdit: "The method was executed...",
  userCurrentText: "The method was implemented...",  // After toggles
  userFeedback: "Don't change 'implemented'",
  rejectedChanges: ["executed → implemented (reverted)"]
}
```

This creates a collaborative loop. You're not just accepting or rejecting—you're guiding the AI toward exactly what you want.

## Handling Large Documents

One challenge we hit: users selecting entire documents and asking to "add a discussion section."

The naive approach—asking the LLM to output the entire document plus new content—fails spectacularly. A 64KB document exceeds output token limits.

Our solution: detect "add" requests and only generate the new content:

```typescript
const isAddRequest = /\b(add|draft|write)\s+(a|an)?\s*(discussion|conclusion)/i
  .test(instruction);

if (isAddRequest) {
  // Generate only the new section
  const newSection = await generateNewSection(instruction, documentContext);
  // Append it ourselves
  return originalContent + '\n\n' + newSection;
}
```

The LLM sees the full document as context but only outputs the new part. Much more reliable.

## Syntax-Aware Editing

Academic users often write in LaTeX. We can't just treat `\begin{abstract}` as regular text.

Auto-detection identifies the syntax mode:
```typescript
const isLatex = /\\begin\{|\\end\{|\\section|\\cite/.test(content);
const isMarkdown = /^#{1,6}\s|^\*\*|^```/.test(content);
```

Then mode-specific instructions go into the prompt:
```
CRITICAL SYNTAX REQUIREMENT - LaTeX:
- Use proper LaTeX commands (e.g., \textbf{}, \emph{}, \cite{})
- Include BOTH opening AND closing tags for environments
- Preserve existing LaTeX structure
```

Smart-split also respects syntax boundaries—we won't split in the middle of a `\begin{equation}...\end{equation}` block.

## What We Learned

Building Styler taught us a few things about AI writing assistants:

**1. Multi-agent beats monolithic.** Separating intent analysis, prompt building, and critique into distinct agents makes each one better and the whole system more debuggable.

**2. Learning must be conservative.** Early versions learned too aggressively from single data points. Now we require 5+ consistent signals before adding avoid-word rules.

**3. Users want control, not automation.** The toggle-based diff view and iterative refinement loop are more important than fully automated edits. Users want to guide, not delegate.

**4. Style sliders should be user-controlled.** We tried having the system auto-adjust verbosity/formality based on feedback. Users hated it—their settings kept drifting. Now sliders are user-controlled only.

**5. Intent matters more than style.** Preserving what a paragraph is *trying to do* is more important than matching surface-level style patterns. The Intent Agent was a late addition but made the biggest quality difference.

## Recent Additions

### Chat Assistant

We added an interactive chat panel that integrates with your document and preferences:

- **General Chat**: Ask writing questions, get advice based on your configured style
- **Document Chat**: Select cells and get feedback on them specifically
- **Alignment Score**: Check how well your content matches your preference profile

The chat uses the same preference context as the editor, so advice is tailored to your style.

### Keyboard Shortcuts

Power users wanted faster navigation. We added a full set of shortcuts:

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate cells |
| `Shift + ↑/↓` | Extend selection |
| `Enter` | Edit selected cell |
| `Delete` | Delete selected cells |
| `Cmd/Ctrl + C/X/V` | Copy/Cut/Paste |
| `Cmd/Ctrl + Z` | Undo/Redo |

### Cell Controls

Colab-style toolbar on each cell: move up, move down, delete. Appears on hover, stays out of the way otherwise.

### Prettify

PDF imports are messy—page numbers, broken lines, artifacts everywhere. The "Prettify" function (formerly "Clean") uses AI to:
- Merge fragmented sentences into proper paragraphs
- Remove page numbers and PDF artifacts
- Fix broken words split across lines
- Group LaTeX packages compactly

It's aggressive by design—cleaning up noise, not preserving it.

## Try It Yourself

Styler is open source. The core agents are in `src/agents/`:
- `orchestrator-agent.ts` - Main coordination loop
- `intent-agent.ts` - Document/paragraph analysis
- `prompt-agent.ts` - Context-aware prompt building
- `critique-agent.ts` - Fast edit evaluation (runs during edit loop)
- `learning-agent.ts` - Preference learning from feedback (runs after decisions)

The preference system lives in `src/memory/`:
- `preference-store.ts` - Global preferences
- `document-preferences.ts` - Per-document adjustments

If you're building AI writing tools, we hope our architecture gives you ideas. The key insight: don't just prompt an LLM—orchestrate multiple specialized agents that understand context, evaluate quality, and learn from feedback.

Your users' voices are worth preserving.

---

*Styler is built with Next.js, React, and TypeScript. It supports Anthropic Claude, OpenAI GPT, and local Ollama models. All data stays local—no cloud sync, no telemetry.*
