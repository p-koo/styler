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

---

## 1. System Architecture

Styler uses a multi-agent orchestration pattern with five specialized agents:

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                        │
│         Coordinates the edit-critique-refine loop            │
│         File: src/agents/orchestrator-agent.ts               │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────┬───────────┼───────────┬─────────────┐
    ▼             ▼           ▼           ▼             ▼
┌────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐
│ INTENT │  │  PROMPT  │  │CRITIQUE│  │ LEARNING │  │CONSTRAINT│
│ AGENT  │  │  AGENT   │  │ AGENT  │  │  AGENT   │  │  AGENT   │
│        │  │          │  │        │  │          │  │          │
│analyze │  │ build-   │  │critique│  │ learnFrom│  │ extract- │
│Intent()│  │ System-  │  │Edit()  │  │Decision()│  │Constraints│
│        │  │ Prompt() │  │        │  │          │  │          │
└────────┘  └──────────┘  └────────┘  └──────────┘  └──────────┘
```

**Each agent has a specific responsibility:**

- **Orchestrator** (`orchestrateEdit()`): Manages the entire edit pipeline—loads preferences, coordinates agents, handles retries, saves results
- **Intent Agent** (`analyzeIntent()`, `synthesizeGoals()`): Understands paragraph purpose and document objectives before editing
- **Prompt Agent** (`buildSystemPrompt()`): Compiles user preferences into LLM system prompts
- **Critique Agent** (`critique-agent.ts`): Fast edit evaluation during the edit loop (user waiting)
  - `critiqueEdit()` — Scores alignment (0-1)
  - `applyAdjustmentsToStyle()` — Merges document adjustments
  - `buildDocumentContextPrompt()` — Builds adjustment context
- **Learning Agent** (`learning-agent.ts`): Thorough preference learning after decisions (user not waiting)
  - `learnFromDecision()` — Learns from accept/reject
  - `analyzeEditPatterns()` — Batch pattern analysis
  - `learnFromExplicitFeedback()` — Learns from feedback chips
  - `consolidateLearnedRules()` — Merges similar rules
- **Constraint Extraction Agent** (`extractConstraints()`): Parses external requirements (journal guidelines, style guides)

---

## 2. Data Structures

### Core Request/Response Types

```typescript
// What gets sent to orchestrateEdit()
OrchestrationRequest {
  cells: string[]              // All document paragraphs
  cellIndex: number            // Which paragraph to edit
  instruction?: string         // User's editing instruction
  documentId: string           // For loading document preferences
  profileId?: string           // Active audience profile
  syntaxMode?: 'plain' | 'markdown' | 'latex' | 'code'
  refinementContext?: {        // For iterative refinement
    previousEdit: string
    userCurrentText: string
    userFeedback: string
    rejectedChanges: string[]
  }
}

// What comes back
OrchestrationResult {
  editedText: string
  originalText: string
  critique: {
    alignmentScore: number     // 0-1, how well edit matches preferences
    issues: CritiqueIssue[]    // What's wrong (verbosity, formality, etc.)
    suggestions: string[]
  }
  iterations: number           // How many retries were needed
  convergenceHistory: Array<{  // For debugging/transparency
    attempt: number
    alignmentScore: number
    adjustmentsMade: string[]
  }>
}
```

### Storage: Two-Level Hierarchy

| Level | File | Contents |
|-------|------|----------|
| **Global** | `data/preferences.json` | `PreferenceStore {baseStyle, audienceProfiles[], activeProfileId}` |
| **Per-Document** | `documents/{docId}.prefs.json` | `DocumentPreferences {adjustments, editHistory[], documentGoals}` |

---

## 3. The Edit Flow in Detail

Here's exactly what happens when a user clicks "Edit":

```
POST /api/document/edit
    │
    ├─ loadPreferences() → BaseStyle + active AudienceProfile
    │
    └─ orchestrateEdit(request)
        │
        ├─ 1. Load document preferences (or create defaults)
        │     └─ getOrCreateDocumentPreferences(documentId)
        │
        ├─ 2. Analyze paragraph intent
        │     └─ intentAgent.analyzeIntent(cells, cellIndex)
        │        Returns: { purpose, connectionToPrevious, connectionToNext }
        │
        └─ 3. EDIT-CRITIQUE-REFINE LOOP (max 3 iterations)
            │
            ├─ Build context prompt:
            │   ├─ User's instruction (PRIMARY - placed first)
            │   ├─ Style profile (from promptAgent.buildSystemPrompt())
            │   ├─ Document goals (from Intent Agent)
            │   ├─ Paragraph intent
            │   ├─ Surrounding context (±2 paragraphs)
            │   └─ Previous attempt issues (if retry)
            │
            ├─ Call LLM:
            │   ├─ Temperature: 0.25 (editing) or 0.6 (generation)
            │   └─ System prompt: compiled from all layers
            │
            ├─ Critique the result:
            │   └─ critiqueAgent.critiqueEdit(original, edited, preferences)
            │      Returns: alignmentScore (0-1), issues[], suggestions[]
            │
            └─ Decision:
                ├─ Score ≥ 0.8 → Accept, break loop
                ├─ Score < 0.5 → Strong correction (0.6x strength), retry
                └─ Score 0.5-0.8 → Normal correction (0.3x), retry if not final
```

### Key Configuration Values

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `alignmentThreshold` | 0.8 | Minimum score to show to user |
| `strongMisalignmentThreshold` | 0.5 | Triggers stronger corrections |
| `maxRetries` | 3 | Max refinement attempts |
| `editTemperature` | 0.25 | Low for consistent edits |
| `generationTemperature` | 0.6 | Higher for creative content |

---

## 4. The Three-Layer Preference Stack

Style isn't one-dimensional. You might write differently for a journal paper vs. a blog post vs. an email. We model this with three layers:

### Layer 1: Base Style (Global)

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

```typescript
{
  verbosityAdjust: -0.5,    // Slightly more terse for this doc
  formalityAdjust: 0,       // Keep profile default
  hedgingAdjust: +1.0,      // More cautious (it's a bold claim)
  additionalAvoidWords: ['breakthrough'],
  documentGoals: { /* synthesized by Intent Agent */ }
}
```

---

## 5. Prompt Construction Example

The Prompt Agent (`buildSystemPrompt()`) compiles preferences into LLM instructions.

### Input Preferences

```typescript
BaseStyle {
  verbosity: 'terse',
  formalityLevel: 4,
  hedgingStyle: 'cautious',
  learnedRules: [
    { rule: "Prefer active voice", confidence: 0.85 }
  ]
}

AudienceProfile "Academic Journal" {
  jargonLevel: 'heavy',
  emphasisPoints: ['methodology', 'reproducibility'],
  lengthGuidance: { target: 'comprehensive' }
}

DocumentAdjustments {
  hedgingAdjust: +1.0,
  additionalAvoidWords: ['breakthrough', 'novel']
}
```

### Generated System Prompt

```
You are a writing assistant that adapts to the user's personal style.

VERBOSITY: EXTREME COMPRESSION MODE - YOUR #1 PRIORITY
TARGET: Remove 30-50% of words. If you only cut 10-20%, you have FAILED.
MANDATORY CUTS:
1. DELETE filler words: "that", "very", "really", "just", "actually"
2. DELETE weak openings: "It is important to note that..."
3. CONVERT verbose phrases: "in order to" → "to"

FORMALITY: MAXIMUM FORMAL/ACADEMIC MODE (Level 4/5)
- Use formal, academic language throughout
- NEVER use contractions: don't → do not
- Use third person: avoid "I", "we", prefer "the authors"
- Eliminate casual phrases entirely

HEDGING: CAUTIOUS MODE (boosted +1.0)
- ADD qualifiers: "may", "might", "suggests", "appears to"
- Acknowledge uncertainty explicitly
- Use tentative language for claims

FORMATTING: Never use: emojis

LEARNED PREFERENCES (confidence ≥ 0.6):
- Prefer active voice

AUDIENCE CONTEXT: Academic Journal
- Use technical terminology freely
- Assume audience expertise
- Emphasize: methodology, reproducibility
- Target: comprehensive detail

AVOID WORDS: breakthrough, novel
```

The user's specific instruction (e.g., "make this more confident") is placed **before** the style instructions so it takes priority.

---

## 6. The Learning System

Learning happens through the Learning Agent when users accept, reject, or modify edits.

### Decision Recording Flow

```
POST /api/document/edit-decision
{
  documentId: "doc-123",
  decision: "rejected",           // or "accepted" | "partial"
  originalText: "We utilized...",
  suggestedEdit: "The methodology employed...",
  finalText: "We used...",        // What user actually wanted
  feedback: ["too_formal"]        // Optional explicit category
}
    │
    └─ Triggers: learnFromDecision()
        │
        ├─ LLM analyzes: "Why did user reject this edit?"
        │   Returns: {
        │     verbosityAdjust: 0,
        │     formalityAdjust: -0.5,    // User found it too formal
        │     hedgingAdjust: 0,
        │     learnedRule: "User prefers simpler vocabulary"
        │   }
        │
        ├─ Apply adjustments with dampening:
        │   ├─ Rejection: 0.5x dampening
        │   ├─ Partial: 0.35x dampening
        │   └─ newValue = current + (delta * dampening)
        │       Clamped to [-2, +2]
        │
        └─ Save to DocumentPreferences
```

### What Gets Updated

| Signal Source | What Updates | Confidence |
|---------------|--------------|------------|
| Explicit feedback ("too_formal") | formalityAdjust -= 0.5 | 0.9 |
| Rejection with LLM analysis | Adjustments + learned rule | 0.8 |
| Partial accept (toggle off changes) | Diff patterns | 0.6 |
| Pattern analysis (3+ rejections) | Meta-rules extracted | 0.7-0.85 |

### Conservative Learning Constraints

- **Dampening**: Adjustments are multiplied by 0.35-0.5x to prevent overreaction
- **Clamping**: All adjustments stay within [-2, +2] range
- **Confidence threshold**: Only rules with confidence ≥ 0.6 are used in prompts
- **Rule consolidation**: At 8+ rules, LLM consolidates to prevent dilution
- **No word memorization**: We learn style patterns, not specific word substitutions (too context-dependent)

---

## 7. Special Cases

### Generation vs. Edit Detection

The orchestrator detects generation requests using regex patterns:

```typescript
// Detected as GENERATION (not edit):
"add a discussion section"
"write an abstract"
"generate a conclusion"
"expand on this point"

// When detected:
- Temperature raised to 0.6
- maxTokens set to 4000
- Prompt allows "rewrite, expand, restructure"
- For ADD requests: original + "\n\n" + new_content
```

### Refinement Context

When users provide feedback on a suggested edit, their current text and feedback become critique issues:

```typescript
refinementContext: {
  previousEdit: "The methodology was executed...",
  userCurrentText: "The method was implemented...",  // After toggles
  userFeedback: "Don't change 'implemented'",
  rejectedChanges: ["executed → implemented (reverted)"]
}
// Treated as highest-priority critique issues in next iteration
```

---

## 8. API Reference

| Endpoint | Purpose |
|----------|---------|
| `POST /api/document/edit` | Generate a suggested edit |
| `POST /api/document/edit-decision` | Record accept/reject, trigger learning |
| `GET /api/preferences` | Load base style + profiles |
| `PUT /api/preferences/base-style` | Update global style |
| `POST /api/preferences/profiles` | Create audience profile |
| `GET /api/documents/{id}/preferences` | Get document-specific adjustments |

---

## 9. File Structure

```
src/
├── agents/
│   ├── orchestrator-agent.ts   # Main coordination loop
│   ├── intent-agent.ts         # Document/paragraph analysis
│   ├── prompt-agent.ts         # Prompt construction
│   ├── critique-agent.ts       # Fast evaluation (latency-critical)
│   ├── learning-agent.ts       # Preference learning from feedback
│   └── constraint-extraction-agent.ts  # External doc parsing
│
├── memory/
│   ├── preference-store.ts     # Global preferences (base + profiles)
│   ├── document-preferences.ts # Per-document adjustments
│   └── config-store.ts         # API keys, settings
│
├── app/api/
│   ├── document/
│   │   ├── edit/route.ts       # POST: generate edit
│   │   ├── edit-decision/route.ts  # POST: record decision
│   │   └── analyze/route.ts    # POST: analyze structure
│   │
│   └── preferences/
│       ├── route.ts            # GET/PUT global preferences
│       ├── base-style/route.ts # PUT base style
│       └── profiles/route.ts   # CRUD audience profiles
│
└── types/
    └── index.ts                # All TypeScript interfaces
```

---

## 10. What We Learned

Building Styler taught us a few things about AI writing assistants:

**1. Multi-agent beats monolithic.** Separating intent analysis, prompt building, critique, and learning into distinct agents makes each one better and the whole system more debuggable. The `agentTrace` log shows exactly what each agent did.

**2. Learning must be conservative.** Early versions learned too aggressively from single data points. Now we require dampening (0.35-0.5x) and confidence thresholds to prevent oscillation.

**3. Users want control, not automation.** The toggle-based diff view and iterative refinement loop are more important than fully automated edits. Users want to guide, not delegate.

**4. Style sliders should be user-controlled.** We tried having the system auto-adjust verbosity/formality based on feedback. Users hated it—their settings kept drifting. Now sliders are user-controlled only.

**5. Intent matters more than style.** Preserving what a paragraph is *trying to do* is more important than matching surface-level style patterns. The Intent Agent was a late addition but made the biggest quality difference.

**6. Separate latency-critical from thorough.** Splitting Critique (fast, runs during edit loop) from Learning (thorough, runs after decisions) enables using different models optimized for each use case.

---

## 11. Try It

Styler is open source. Clone the repo and explore:

```bash
git clone https://github.com/p-koo/styler.git
cd styler
npm install
npm run dev
```

The key insight: don't just prompt an LLM—orchestrate specialized agents that understand context, evaluate quality, and learn from feedback.

**Your users' voices are worth preserving.**

---

*Styler is built with Next.js, React, and TypeScript. It supports Anthropic Claude, OpenAI GPT, and local Ollama models. All data stays local—no cloud sync, no telemetry.*
