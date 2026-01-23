// Core type definitions for the Preference Bridge System

export type Verbosity = 'terse' | 'moderate' | 'detailed';
export type ConfidenceSource = 'explicit' | 'inferred' | 'document' | 'diff';
export type ProviderType = 'openai' | 'anthropic' | 'ollama';

// Writing style elements extracted from history
export interface StylePattern {
  pattern: string;
  examples: string[];
  frequency: number; // How often this pattern appears
  confidence: number; // 0-1 scale
}

// Learned rule from user corrections or patterns
export interface LearnedRule {
  rule: string;
  confidence: number;
  source: ConfidenceSource;
  timestamp: string;
  examples?: string[];
}

// Base writing style - always applied
export interface BaseStyle {
  // Structural preferences
  verbosity: Verbosity;
  sentencePatterns: StylePattern[];
  paragraphStructure: StylePattern[];

  // Word-level preferences
  preferredWords: Record<string, string>; // "utilize" -> "use"
  avoidWords: string[];

  // Tone and voice
  formalityLevel: number; // 1-5
  hedgingStyle: 'confident' | 'cautious' | 'balanced';
  activeVoicePreference: number; // 0-1, higher = prefer active

  // Formatting
  formatBans: string[]; // e.g., ["emoji", "em-dash", "exclamation"]
  requiredFormats: string[]; // e.g., ["code-blocks", "bullet-points"]

  // Argument structure
  argumentStyle: StylePattern[];
  transitionPhrases: string[];

  // Learned rules
  learnedRules: LearnedRule[];
}

// Audience-specific overlay
export interface AudienceProfile {
  id: string;
  name: string;
  description: string;

  // How this profile was created
  source: 'inferred' | 'manual' | 'document';
  inferredFrom?: string[]; // conversation IDs if inferred

  // Style overrides (merged on top of base style)
  overrides: Partial<BaseStyle>;

  // Audience-specific additions
  jargonLevel: 'minimal' | 'moderate' | 'heavy';
  disciplineTerms: string[]; // Domain-specific terms to use
  emphasisPoints: string[]; // What to emphasize (e.g., "broader impacts", "significance")

  // Framing guidance
  framingGuidance: string[];

  // Word limits or length guidance
  lengthGuidance?: {
    target: 'concise' | 'standard' | 'comprehensive';
    maxWords?: number;
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Complete preference store
export interface PreferenceStore {
  version: string;

  // Base style always applied
  baseStyle: BaseStyle;

  // Audience-specific profiles
  audienceProfiles: AudienceProfile[];

  // Currently active profile (null = base only)
  activeProfileId: string | null;

  // Metadata
  lastBootstrap?: string;
  conversationsAnalyzed?: number;
}

// ChatGPT export format types
export interface ChatGPTMessage {
  id: string;
  author: {
    role: 'user' | 'assistant' | 'system' | 'tool';
    name?: string;
    metadata?: Record<string, unknown>;
  };
  content: {
    content_type: string;
    parts?: string[];
    text?: string;
  };
  metadata?: Record<string, unknown>;
  create_time?: number;
}

export interface ChatGPTConversation {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, {
    id: string;
    message?: ChatGPTMessage;
    parent?: string;
    children: string[];
  }>;
  current_node?: string;
}

// Parsed conversation for analysis
export interface ParsedConversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
  }[];

  // Inferred metadata
  detectedType?: string; // 'grant', 'paper', 'technical', etc.
  keywords?: string[];
}

// Conversation cluster for audience profile inference
export interface ConversationCluster {
  id: string;
  name: string;
  conversations: ParsedConversation[];

  // Cluster characteristics
  keywords: string[];
  averageFormalityLevel: number;
  commonPatterns: StylePattern[];
}

// Provider configuration
export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string; // For Ollama or custom endpoints
  model: string;
  maxTokens?: number;
  temperature?: number;
}

// Chat message format
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;

  // Metadata for debugging/transparency
  synthesizedPrompt?: string; // The actual prompt sent to LLM
  profileUsed?: string; // Which audience profile was applied
}

// Chat session
export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  activeProfileId: string | null;
  provider: ProviderType;
  createdAt: Date;
  updatedAt: Date;
}

// API request/response types
export interface ChatRequest {
  message: string;
  profileId?: string;
  provider?: ProviderType;
  sessionId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  synthesizedPrompt?: string; // For transparency mode
}

export interface BootstrapRequest {
  conversations: ChatGPTConversation[];
}

export interface BootstrapResponse {
  baseStyle: BaseStyle;
  audienceProfiles: AudienceProfile[];
  conversationsAnalyzed: number;
  clustersDetected: number;
}

// Style extraction result
export interface StyleExtractionResult {
  baseStyle: BaseStyle;
  corrections: {
    original: string;
    corrected: string;
    context: string;
  }[];
  patterns: {
    category: string;
    pattern: string;
    examples: string[];
  }[];
}

// ========================================
// Document-Specific Preferences & Critique
// ========================================

// Critique issue types
export type CritiqueIssueType = 'verbosity' | 'formality' | 'word_choice' | 'structure' | 'tone' | 'hedging' | 'brainrot' | 'user_feedback' | 'rejected_change';
export type CritiqueIssueSeverity = 'minor' | 'moderate' | 'major';
export type EditDecisionType = 'accepted' | 'rejected' | 'partial';

// Individual critique issue found in an edit
export interface CritiqueIssue {
  type: CritiqueIssueType;
  severity: CritiqueIssueSeverity;
  description: string;
  location?: { start: number; end: number };
}

// Critique agent's analysis of a suggested edit
export interface CritiqueAnalysis {
  alignmentScore: number;           // 0-1 how well edit matches preferences
  issues: CritiqueIssue[];
  suggestions: string[];
  predictedAcceptance: number;      // 0-1 likelihood user will accept
}

// Record of a user's edit decision (accept/reject/partial)
export interface EditDecision {
  id: string;
  cellIndex: number;
  originalText: string;
  suggestedEdit: string;
  finalText: string;                // What user actually accepted (may be partial)
  decision: EditDecisionType;
  instruction?: string;             // User's instruction if any
  timestamp: string;
  critiqueAnalysis?: CritiqueAnalysis;
}

// Explicit feedback categories for rejection
export type FeedbackCategory =
  | 'too_formal'
  | 'too_casual'
  | 'too_verbose'
  | 'too_terse'
  | 'changed_meaning'
  | 'over_edited'
  | 'wrong_tone'
  | 'bad_word_choice'
  | 'lost_nuance'
  | 'other';

// Example pair from user edits (for example-based learning)
export interface EditExample {
  id: string;
  suggestedEdit: string;        // What the LLM suggested
  userVersion: string;          // What the user actually wanted
  context?: string;             // Surrounding context
  instruction?: string;         // Original instruction
  feedback?: FeedbackCategory[];// Explicit feedback if provided
  timestamp: string;
}

// Word-level diff pattern (for diff-based learning)
export interface DiffPattern {
  type: 'removal' | 'addition' | 'substitution';
  pattern: string;              // The word/phrase pattern
  replacement?: string;         // For substitutions, what it became
  count: number;                // How many times this pattern occurred
  confidence: number;           // Higher = more consistent pattern
}

// Document goals synthesized by Intent Agent
export interface DocumentGoals {
  // High-level synthesis of what the document aims to achieve
  summary: string;

  // Key objectives (not a laundry list, but 2-4 core aims)
  objectives: string[];

  // Target audience and their needs
  audienceNeeds?: string;

  // The main argument or thesis
  mainArgument?: string;

  // What success looks like for this document
  successCriteria?: string;

  // Last updated timestamp
  updatedAt: string;

  // Whether goals were manually edited by user
  userEdited?: boolean;

  // Whether goals are locked (prevents Intent Agent from auto-updating)
  locked?: boolean;
}

// Document constraints from external sources (grant calls, style guides, etc.)
export interface DocumentConstraints {
  // Raw source text (pasted or extracted from PDF)
  sourceText?: string;

  // Source description (e.g., "NIH R01 Grant Guidelines", "Nature Style Guide")
  sourceDescription?: string;

  // Extracted/parsed constraints
  constraints: string[];

  // Style adjustments derived from constraints
  styleAdjustments?: {
    verbosity?: number;
    formality?: number;
    hedging?: number;
  };

  // Words to avoid from this source
  avoidWords?: string[];

  // Preferred terminology from this source
  preferredTerms?: Record<string, string>;

  // Last updated timestamp
  updatedAt: string;

  // Whether constraints were manually edited
  userEdited?: boolean;
}

// Paragraph intent analysis from Intent Agent
export interface ParagraphIntent {
  // What this paragraph is trying to accomplish
  purpose: string;

  // How it connects to the previous paragraph
  connectionToPrevious?: string;

  // How it leads to the next paragraph
  connectionToNext?: string;

  // Its role in achieving document goals
  roleInGoals?: string;
}

// Adjustments learned from a document
export interface DocumentAdjustments {
  // Style adjustments learned from rejections (-2 to +2)
  verbosityAdjust: number;          // more terse ↔ more detailed
  formalityAdjust: number;
  hedgingAdjust: number;            // more confident ↔ more cautious

  // Additional avoid/prefer words learned from this document
  additionalAvoidWords: string[];
  additionalPreferWords: Record<string, string>;

  // Framing learned from this document
  additionalFramingGuidance: string[];

  // Free-form rules learned from patterns
  learnedRules: LearnedRule[];

  // Example pairs from user edits (example-based learning)
  editExamples?: EditExample[];

  // Word-level diff patterns (diff-based learning)
  diffPatterns?: DiffPattern[];

  // Document goals (synthesized by Intent Agent, editable by user)
  documentGoals?: DocumentGoals;

  // Document constraints from external sources (grant calls, style guides, etc.)
  documentConstraints?: DocumentConstraints;

  // Easter egg: Gen Alpha mode
  genAlphaMode?: boolean;
}

// Document-specific preferences that layer on top of global profiles
export interface DocumentPreferences {
  documentId: string;
  baseProfileId: string | null;     // The global profile this builds on

  // Learned adjustments (corrections to the profile)
  adjustments: DocumentAdjustments;

  // Edit history for learning
  editHistory: EditDecision[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Extended SavedDocument with preferences
export interface SavedDocumentWithPreferences {
  id: string;
  title: string;
  cells: Array<{
    id: string;
    index: number;
    content: string;
    type?: 'cell' | 'heading';
  }>;
  structure?: {
    title: string;
    documentType: string;
    sections: Array<{
      id: string;
      name: string;
      type: string;
      startCell: number;
      endCell: number;
      purpose: string;
    }>;
    keyTerms: string[];
    mainArgument: string;
  };
  preferences?: DocumentPreferences;  // Document-specific preferences
  createdAt: string;
  updatedAt: string;
}
