/**
 * Document Store
 *
 * Manages full documents for context-aware editing.
 * Tracks paragraphs, definitions, acronyms, and edit history.
 */

export interface Paragraph {
  id: string;
  index: number;
  content: string;
  edited?: string;
  editAccepted?: boolean;
}

export interface DocumentDefinition {
  term: string;
  definition: string;
  firstMentionParagraph: number;
}

export interface Document {
  id: string;
  title: string;
  paragraphs: Paragraph[];
  definitions: DocumentDefinition[];
  acronyms: Map<string, string>; // e.g., "ML" -> "Machine Learning"
  createdAt: Date;
  updatedAt: Date;
}

// In-memory document storage
const documents = new Map<string, Document>();

/**
 * Generate unique ID
 */
function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Parse text into paragraphs
 */
export function parseTextIntoParagraphs(text: string): string[] {
  // Split by double newlines or single newlines followed by indentation
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Extract acronyms from text
 * Looks for patterns like "Machine Learning (ML)" or "ML (Machine Learning)"
 */
export function extractAcronyms(text: string): Map<string, string> {
  const acronyms = new Map<string, string>();

  // Pattern: "Full Name (ACRONYM)"
  const pattern1 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\(([A-Z]{2,})\)/g;
  // Pattern: "ACRONYM (Full Name)"
  const pattern2 = /\b([A-Z]{2,})\s*\(([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)\)/g;

  let match;
  while ((match = pattern1.exec(text)) !== null) {
    acronyms.set(match[2], match[1]);
  }
  while ((match = pattern2.exec(text)) !== null) {
    acronyms.set(match[1], match[2]);
  }

  return acronyms;
}

/**
 * Extract definitions from text
 * Looks for patterns like "X is defined as Y" or "We define X as Y"
 */
export function extractDefinitions(
  paragraphs: Paragraph[]
): DocumentDefinition[] {
  const definitions: DocumentDefinition[] = [];

  const patterns = [
    /(?:we\s+)?define\s+["']?([^"']+?)["']?\s+as\s+["']?([^"'.]+)/gi,
    /["']?([^"']+?)["']?\s+is\s+defined\s+as\s+["']?([^"'.]+)/gi,
    /["']?([^"']+?)["']?\s+refers\s+to\s+["']?([^"'.]+)/gi,
  ];

  for (const para of paragraphs) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(para.content)) !== null) {
        definitions.push({
          term: match[1].trim(),
          definition: match[2].trim(),
          firstMentionParagraph: para.index,
        });
      }
    }
  }

  return definitions;
}

/**
 * Create a new document from text
 */
export function createDocument(text: string, title?: string): Document {
  const paragraphTexts = parseTextIntoParagraphs(text);
  const paragraphs: Paragraph[] = paragraphTexts.map((content, index) => ({
    id: `para-${index}`,
    index,
    content,
  }));

  const acronyms = extractAcronyms(text);
  const definitions = extractDefinitions(paragraphs);

  const doc: Document = {
    id: generateId(),
    title: title || 'Untitled Document',
    paragraphs,
    definitions,
    acronyms,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  documents.set(doc.id, doc);
  return doc;
}

/**
 * Get a document by ID
 */
export function getDocument(id: string): Document | undefined {
  return documents.get(id);
}

/**
 * Get context for a specific paragraph
 * Returns surrounding paragraphs, relevant definitions, and acronyms
 */
export function getParagraphContext(
  docId: string,
  paragraphIndex: number,
  contextSize: number = 2
): {
  before: Paragraph[];
  current: Paragraph;
  after: Paragraph[];
  relevantDefinitions: DocumentDefinition[];
  relevantAcronyms: Map<string, string>;
} | null {
  const doc = documents.get(docId);
  if (!doc) return null;

  const current = doc.paragraphs[paragraphIndex];
  if (!current) return null;

  // Get surrounding paragraphs
  const startBefore = Math.max(0, paragraphIndex - contextSize);
  const endAfter = Math.min(doc.paragraphs.length, paragraphIndex + contextSize + 1);

  const before = doc.paragraphs.slice(startBefore, paragraphIndex);
  const after = doc.paragraphs.slice(paragraphIndex + 1, endAfter);

  // Find relevant definitions (defined before or in current paragraph)
  const relevantDefinitions = doc.definitions.filter(
    (d) => d.firstMentionParagraph <= paragraphIndex
  );

  // Find acronyms used in current paragraph
  const relevantAcronyms = new Map<string, string>();
  for (const [acronym, fullForm] of doc.acronyms) {
    if (current.content.includes(acronym)) {
      relevantAcronyms.set(acronym, fullForm);
    }
  }

  return {
    before,
    current,
    after,
    relevantDefinitions,
    relevantAcronyms,
  };
}

/**
 * Update a paragraph with suggested edit
 */
export function updateParagraphEdit(
  docId: string,
  paragraphIndex: number,
  editedContent: string
): Document | null {
  const doc = documents.get(docId);
  if (!doc) return null;

  const para = doc.paragraphs[paragraphIndex];
  if (!para) return null;

  para.edited = editedContent;
  para.editAccepted = false;
  doc.updatedAt = new Date();

  return doc;
}

/**
 * Accept or reject an edit
 */
export function resolveEdit(
  docId: string,
  paragraphIndex: number,
  accept: boolean
): Document | null {
  const doc = documents.get(docId);
  if (!doc) return null;

  const para = doc.paragraphs[paragraphIndex];
  if (!para || !para.edited) return null;

  if (accept) {
    para.content = para.edited;
    para.editAccepted = true;
  }
  para.edited = undefined;
  doc.updatedAt = new Date();

  return doc;
}

/**
 * Export document as text
 */
export function exportDocumentAsText(docId: string): string | null {
  const doc = documents.get(docId);
  if (!doc) return null;

  return doc.paragraphs.map((p) => p.content).join('\n\n');
}

/**
 * Get all documents
 */
export function getAllDocuments(): Document[] {
  return Array.from(documents.values());
}

/**
 * Delete a document
 */
export function deleteDocument(id: string): boolean {
  return documents.delete(id);
}

/**
 * Build context prompt for paragraph editing
 */
export function buildContextPrompt(
  docId: string,
  paragraphIndex: number
): string | null {
  const context = getParagraphContext(docId, paragraphIndex);
  if (!context) return null;

  const parts: string[] = [];

  // Add definitions context
  if (context.relevantDefinitions.length > 0) {
    parts.push('DEFINITIONS IN THIS DOCUMENT:');
    for (const def of context.relevantDefinitions) {
      parts.push(`- ${def.term}: ${def.definition}`);
    }
    parts.push('');
  }

  // Add acronyms context
  if (context.relevantAcronyms.size > 0) {
    parts.push('ACRONYMS USED:');
    for (const [acronym, fullForm] of context.relevantAcronyms) {
      parts.push(`- ${acronym} = ${fullForm}`);
    }
    parts.push('');
  }

  // Add preceding context
  if (context.before.length > 0) {
    parts.push('PRECEDING PARAGRAPHS (for context):');
    for (const para of context.before) {
      parts.push(`[Paragraph ${para.index + 1}]: ${para.content}`);
    }
    parts.push('');
  }

  // Add current paragraph
  parts.push('PARAGRAPH TO EDIT:');
  parts.push(context.current.content);
  parts.push('');

  // Add following context
  if (context.after.length > 0) {
    parts.push('FOLLOWING PARAGRAPHS (for context):');
    for (const para of context.after) {
      parts.push(`[Paragraph ${para.index + 1}]: ${para.content}`);
    }
    parts.push('');
  }

  parts.push('Please edit ONLY the "PARAGRAPH TO EDIT" above. Consider the surrounding context, defined terms, and acronyms. Return ONLY the edited paragraph text, nothing else.');

  return parts.join('\n');
}
