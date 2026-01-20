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
      const cellContent = currentCell.join('\n').trim();
      const hasSubstantiveContent = currentCell.some(l => {
        const t = l.trim();
        return t && !t.startsWith('\\') && !t.startsWith('%');
      });

      if (hasSubstantiveContent && cellContent) {
        flushCell();
      } else if (currentCell.length > 0) {
        // Keep accumulating if we only have commands
        currentCell.push(line);
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
 * Reorganize existing cells using smart logic
 * Takes an array of cell contents and reorganizes them
 */
export function reorganizeCells(cells: string[], syntaxMode: SyntaxMode): string[] {
  // Join all cells and re-split smartly
  const fullContent = cells.join('\n\n');
  return smartSplit(fullContent, { syntaxMode });
}
