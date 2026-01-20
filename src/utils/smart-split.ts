/**
 * Smart Document Splitting Utility
 *
 * Intelligently splits documents into logical cells based on syntax mode.
 * Handles LaTeX, Markdown, code, and plain text documents.
 */

export type SyntaxMode = 'plain' | 'markdown' | 'latex' | 'code';

interface SplitOptions {
  syntaxMode: SyntaxMode;
  preserveEmptyCells?: boolean;
}

/**
 * Smartly split a document into logical cells based on syntax mode
 */
export function smartSplit(content: string, options: SplitOptions): string[] {
  const { syntaxMode, preserveEmptyCells = false } = options;

  let cells: string[];

  switch (syntaxMode) {
    case 'latex':
      cells = splitLatex(content);
      break;
    case 'markdown':
      cells = splitMarkdown(content);
      break;
    case 'code':
      cells = splitCode(content);
      break;
    default:
      cells = splitPlainText(content);
  }

  // Filter empty cells unless preserving them
  if (!preserveEmptyCells) {
    cells = cells.filter(cell => cell.trim().length > 0);
  }

  return cells;
}

/**
 * Split LaTeX document into logical cells
 */
function splitLatex(content: string): string[] {
  const cells: string[] = [];
  const lines = content.split('\n');

  let currentCell: string[] = [];
  let inEnvironment: string | null = null;
  let environmentDepth = 0;
  let inPreamble = true;

  // LaTeX commands that should be grouped with following content
  const standaloneCommands = new Set([
    '\\maketitle',
    '\\tableofcontents',
    '\\listoffigures',
    '\\listoftables',
    '\\newpage',
    '\\clearpage',
    '\\cleardoublepage',
    '\\thispagestyle',
    '\\pagestyle',
    '\\flushbottom',
    '\\raggedbottom',
  ]);

  // Commands that start a new logical section
  const sectionCommands = [
    '\\part',
    '\\chapter',
    '\\section',
    '\\subsection',
    '\\subsubsection',
    '\\paragraph',
    '\\subparagraph',
  ];

  const flushCell = () => {
    if (currentCell.length > 0) {
      const cellContent = currentCell.join('\n').trim();
      if (cellContent) {
        cells.push(cellContent);
      }
      currentCell = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for \begin{document} - marks end of preamble
    if (trimmedLine === '\\begin{document}') {
      // Flush preamble as one cell
      flushCell();
      currentCell.push(line);
      flushCell();
      inPreamble = false;
      continue;
    }

    // Check for \end{document}
    if (trimmedLine === '\\end{document}') {
      flushCell();
      cells.push(line);
      continue;
    }

    // If still in preamble, accumulate everything
    if (inPreamble) {
      currentCell.push(line);
      continue;
    }

    // Check for environment begin
    const beginMatch = trimmedLine.match(/^\\begin\{(\w+)\}/);
    if (beginMatch) {
      const envName = beginMatch[1];

      // Special handling for abstract - keep as single cell
      if (envName === 'abstract' || envName === 'figure' || envName === 'table' ||
          envName === 'equation' || envName === 'align' || envName === 'itemize' ||
          envName === 'enumerate' || envName === 'description' || envName === 'quote' ||
          envName === 'quotation' || envName === 'verbatim' || envName === 'lstlisting' ||
          envName === 'algorithm' || envName === 'proof' || envName === 'theorem' ||
          envName === 'lemma' || envName === 'corollary' || envName === 'definition') {
        flushCell();
        inEnvironment = envName;
        environmentDepth = 1;
        currentCell.push(line);
        continue;
      }
    }

    // Track nested environments
    if (inEnvironment) {
      currentCell.push(line);

      // Check for nested begin
      if (trimmedLine.match(/^\\begin\{/)) {
        environmentDepth++;
      }

      // Check for end of tracked environment
      const endMatch = trimmedLine.match(/^\\end\{(\w+)\}/);
      if (endMatch) {
        environmentDepth--;
        if (environmentDepth === 0 && endMatch[1] === inEnvironment) {
          flushCell();
          inEnvironment = null;
        }
      }
      continue;
    }

    // Check for section commands - start new cell
    const isSectionCommand = sectionCommands.some(cmd => trimmedLine.startsWith(cmd));
    if (isSectionCommand) {
      flushCell();
      currentCell.push(line);
      continue;
    }

    // Check for standalone commands - group with current cell
    const isStandaloneCommand = Array.from(standaloneCommands).some(cmd =>
      trimmedLine.startsWith(cmd)
    );
    if (isStandaloneCommand) {
      // If we have content and this is a formatting command, add to current cell
      if (currentCell.length > 0) {
        currentCell.push(line);
      } else {
        currentCell.push(line);
      }
      continue;
    }

    // Check for paragraph break (blank line)
    if (trimmedLine === '') {
      // Only flush if we have substantive content (not just commands)
      const hasSubstantiveContent = currentCell.some(l => {
        const t = l.trim();
        return t && !t.startsWith('\\') && !t.startsWith('%');
      });

      // Count consecutive blank lines - multiple blanks indicate stronger break
      let blankCount = 1;
      while (i + blankCount < lines.length && lines[i + blankCount].trim() === '') {
        blankCount++;
      }

      if (hasSubstantiveContent) {
        flushCell();
        // Skip additional blank lines
        i += blankCount - 1;
      } else if (currentCell.length > 0 && blankCount >= 2) {
        // Multiple blank lines - flush even if just commands
        flushCell();
        i += blankCount - 1;
      }
      continue;
    }

    // Regular content line
    currentCell.push(line);
  }

  // Flush remaining content
  flushCell();

  // Post-process: merge very small cells (standalone commands) with neighbors
  return mergeSmallLatexCells(cells);
}

/**
 * Merge small LaTeX cells that are just standalone commands
 */
function mergeSmallLatexCells(cells: string[]): string[] {
  if (cells.length <= 1) return cells;

  const result: string[] = [];
  let i = 0;

  while (i < cells.length) {
    const cell = cells[i];
    const lines = cell.split('\n').filter(l => l.trim());

    // Check if this cell is just formatting commands (no real content)
    const isJustCommands = lines.every(l => {
      const t = l.trim();
      return t.startsWith('\\') || t.startsWith('%') || t === '';
    });

    // Check if cell is very short (likely a standalone command or header)
    const isShortCommand = lines.length <= 2 && isJustCommands;

    if (isShortCommand && result.length > 0) {
      // Merge with previous cell
      result[result.length - 1] = result[result.length - 1] + '\n\n' + cell;
    } else if (isShortCommand && i + 1 < cells.length) {
      // Merge with next cell
      cells[i + 1] = cell + '\n\n' + cells[i + 1];
    } else {
      result.push(cell);
    }

    i++;
  }

  return result;
}

/**
 * Split Markdown document into logical cells
 */
function splitMarkdown(content: string): string[] {
  const cells: string[] = [];
  const lines = content.split('\n');

  let currentCell: string[] = [];
  let inCodeBlock = false;
  let inFrontMatter = false;

  const flushCell = () => {
    if (currentCell.length > 0) {
      const cellContent = currentCell.join('\n').trim();
      if (cellContent) {
        cells.push(cellContent);
      }
      currentCell = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for front matter (YAML)
    if (i === 0 && trimmedLine === '---') {
      inFrontMatter = true;
      currentCell.push(line);
      continue;
    }
    if (inFrontMatter) {
      currentCell.push(line);
      if (trimmedLine === '---' || trimmedLine === '...') {
        flushCell();
        inFrontMatter = false;
      }
      continue;
    }

    // Check for code block
    if (trimmedLine.startsWith('```')) {
      if (!inCodeBlock) {
        flushCell();
        inCodeBlock = true;
      } else {
        currentCell.push(line);
        flushCell();
        inCodeBlock = false;
        continue;
      }
    }

    if (inCodeBlock) {
      currentCell.push(line);
      continue;
    }

    // Check for headers - start new cell
    if (trimmedLine.match(/^#{1,6}\s/)) {
      flushCell();
      currentCell.push(line);
      continue;
    }

    // Check for horizontal rule
    if (trimmedLine.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      flushCell();
      cells.push(line);
      continue;
    }

    // Check for paragraph break
    if (trimmedLine === '') {
      const hasContent = currentCell.some(l => l.trim());
      if (hasContent) {
        flushCell();
      }
      continue;
    }

    // Regular content
    currentCell.push(line);
  }

  flushCell();
  return cells;
}

/**
 * Split code document into logical cells (basic approach)
 */
function splitCode(content: string): string[] {
  // For code, we'll split on blank lines but keep function/class definitions together
  const cells: string[] = [];
  const lines = content.split('\n');

  let currentCell: string[] = [];
  let braceDepth = 0;
  let parenDepth = 0;

  const flushCell = () => {
    if (currentCell.length > 0) {
      const cellContent = currentCell.join('\n');
      if (cellContent.trim()) {
        cells.push(cellContent);
      }
      currentCell = [];
    }
  };

  for (const line of lines) {
    // Count braces and parens to track block depth
    for (const char of line) {
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
    }

    currentCell.push(line);

    // Only split on blank lines when not inside a block
    if (line.trim() === '' && braceDepth === 0 && parenDepth === 0) {
      flushCell();
    }
  }

  flushCell();
  return cells;
}

/**
 * Split plain text into paragraphs
 */
function splitPlainText(content: string): string[] {
  // Split on double newlines (paragraph breaks)
  return content
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Auto-detect syntax mode from content
 */
export function detectSyntaxMode(content: string): SyntaxMode {
  const trimmed = content.trim();

  // Check for LaTeX
  if (
    trimmed.includes('\\documentclass') ||
    trimmed.includes('\\begin{document}') ||
    trimmed.includes('\\section{') ||
    trimmed.includes('\\usepackage') ||
    (trimmed.includes('\\begin{') && trimmed.includes('\\end{'))
  ) {
    return 'latex';
  }

  // Check for Markdown
  if (
    trimmed.match(/^#{1,6}\s/m) ||
    trimmed.includes('```') ||
    trimmed.match(/^\s*[-*+]\s/m) ||
    trimmed.match(/^\s*\d+\.\s/m) ||
    trimmed.match(/\[.+\]\(.+\)/)
  ) {
    return 'markdown';
  }

  // Check for code (basic heuristics)
  if (
    trimmed.match(/^(import|from|const|let|var|function|class|def|pub fn|fn |async fn)\s/m) ||
    trimmed.match(/^(package|public class|private|protected)\s/m) ||
    trimmed.includes('=>') ||
    trimmed.match(/\{\s*$/) ||
    trimmed.match(/^\s*}\s*$/m)
  ) {
    return 'code';
  }

  return 'plain';
}

/**
 * Clean up cells: split, merge, and format for visual clarity
 * - Splits large cells with multiple logical sections
 * - Merges tiny cells that belong together
 * - Normalizes whitespace within cells
 */
export function cleanupCells(cells: string[], syntaxMode: SyntaxMode): string[] {
  // For LaTeX, preserve single newlines since they have semantic meaning
  // For other modes, use double newlines as paragraph separators
  const separator = syntaxMode === 'latex' ? '\n' : '\n\n';

  // Join all cells
  const fullContent = cells.join(separator);

  // Re-split using smart logic
  let result = smartSplit(fullContent, { syntaxMode });

  // Post-process: merge very small cells
  result = mergeRelatedCells(result, syntaxMode);

  // Clean up whitespace in each cell
  result = result.map(cell => cleanupWhitespace(cell, syntaxMode));

  return result;
}

// Keep old name as alias for backwards compatibility
export const reorganizeCells = cleanupCells;

/**
 * Clean up whitespace within a cell
 * - Remove trailing whitespace from lines
 * - Normalize multiple blank lines to single blank line
 * - Remove leading/trailing blank lines
 */
function cleanupWhitespace(content: string, syntaxMode: SyntaxMode): string {
  let lines = content.split('\n');

  // Remove trailing whitespace from each line
  lines = lines.map(line => line.trimEnd());

  // Collapse multiple consecutive blank lines into one
  const result: string[] = [];
  let prevWasBlank = false;

  for (const line of lines) {
    const isBlank = line.trim() === '';

    if (isBlank) {
      if (!prevWasBlank) {
        // Keep first blank line (paragraph separator)
        result.push('');
      }
      // Skip additional consecutive blank lines
      prevWasBlank = true;
    } else {
      result.push(line);
      prevWasBlank = false;
    }
  }

  // Remove leading blank lines
  while (result.length > 0 && result[0].trim() === '') {
    result.shift();
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n');
}

/**
 * Merge cells that are too small to stand alone
 * This handles cases where splitting was too aggressive
 */
function mergeRelatedCells(cells: string[], syntaxMode: SyntaxMode): string[] {
  if (cells.length <= 1) return cells;

  const result: string[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const trimmed = cell.trim();
    const lineCount = trimmed.split('\n').length;
    const wordCount = trimmed.split(/\s+/).length;

    // Determine if this cell is "tiny" and should be merged
    const isTinyCell = lineCount <= 2 && wordCount < 15;

    // For LaTeX: check if it's just commands without content
    const isLatexCommandsOnly = syntaxMode === 'latex' &&
      trimmed.split('\n').every(line => {
        const t = line.trim();
        return !t || t.startsWith('\\') || t.startsWith('%');
      });

    // For Markdown: check if it's just a header without content
    const isLonelyHeader = syntaxMode === 'markdown' &&
      lineCount === 1 && trimmed.match(/^#{1,6}\s/);

    if ((isTinyCell || isLatexCommandsOnly) && result.length > 0 && !isLonelyHeader) {
      // Merge with previous cell
      const separator = syntaxMode === 'latex' ? '\n\n' : '\n\n';
      result[result.length - 1] = result[result.length - 1] + separator + cell;
    } else if (isLonelyHeader && i + 1 < cells.length) {
      // For lonely headers, merge with next cell
      cells[i + 1] = cell + '\n\n' + cells[i + 1];
    } else {
      result.push(cell);
    }
  }

  return result;
}
