// Core type definitions for the Preference Bridge System

export type Verbosity = 'terse' | 'moderate' | 'detailed';
export type ConfidenceSource = 'explicit' | 'inferred' | 'document';
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
export type CritiqueIssueType = 'verbosity' | 'formality' | 'word_choice' | 'structure' | 'tone' | 'hedging' | 'brainrot';
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
  paragraphIndex: number;
  originalText: string;
  suggestedEdit: string;
  finalText: string;                // What user actually accepted (may be partial)
  decision: EditDecisionType;
  instruction?: string;             // User's instruction if any
  timestamp: string;
  critiqueAnalysis?: CritiqueAnalysis;
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
  paragraphs: Array<{
    id: string;
    index: number;
    content: string;
    type?: 'paragraph' | 'heading';
  }>;
  structure?: {
    title: string;
    documentType: string;
    sections: Array<{
      id: string;
      name: string;
      type: string;
      startParagraph: number;
      endParagraph: number;
      purpose: string;
    }>;
    keyTerms: string[];
    mainArgument: string;
  };
  preferences?: DocumentPreferences;  // Document-specific preferences
  createdAt: string;
  updatedAt: string;
}
