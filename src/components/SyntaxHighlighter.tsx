'use client';

import { useMemo } from 'react';

export type HighlightMode = 'plain' | 'markdown' | 'latex';

interface SyntaxHighlighterProps {
  content: string;
  mode: HighlightMode;
  className?: string;
}

interface Token {
  type: string;
  content: string;
}

// Tokenize LaTeX
function tokenizeLatex(text: string): Token[] {
  const tokens: Token[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Comment: % to end of line
    const commentMatch = remaining.match(/^(%[^\n]*)/);
    if (commentMatch) {
      tokens.push({ type: 'comment', content: commentMatch[1] });
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // Math mode: $...$ or $$...$$
    const mathMatch = remaining.match(/^(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/);
    if (mathMatch) {
      tokens.push({ type: 'math', content: mathMatch[1] });
      remaining = remaining.slice(mathMatch[1].length);
      continue;
    }

    // Environment: \begin{...} or \end{...}
    const envMatch = remaining.match(/^(\\(?:begin|end)\{[^}]+\})/);
    if (envMatch) {
      tokens.push({ type: 'environment', content: envMatch[1] });
      remaining = remaining.slice(envMatch[1].length);
      continue;
    }

    // Command with argument: \command{...}
    const cmdArgMatch = remaining.match(/^(\\[a-zA-Z]+)(\{[^}]*\})/);
    if (cmdArgMatch) {
      tokens.push({ type: 'command', content: cmdArgMatch[1] });
      tokens.push({ type: 'argument', content: cmdArgMatch[2] });
      remaining = remaining.slice(cmdArgMatch[0].length);
      continue;
    }

    // Command: \command
    const cmdMatch = remaining.match(/^(\\[a-zA-Z]+)/);
    if (cmdMatch) {
      tokens.push({ type: 'command', content: cmdMatch[1] });
      remaining = remaining.slice(cmdMatch[1].length);
      continue;
    }

    // Braces
    const braceMatch = remaining.match(/^([{}[\]])/);
    if (braceMatch) {
      tokens.push({ type: 'brace', content: braceMatch[1] });
      remaining = remaining.slice(1);
      continue;
    }

    // Regular text - up to next special character
    const textMatch = remaining.match(/^([^\\$%{}\[\]]+)/);
    if (textMatch) {
      tokens.push({ type: 'text', content: textMatch[1] });
      remaining = remaining.slice(textMatch[1].length);
      continue;
    }

    // Single character fallback
    tokens.push({ type: 'text', content: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

// Tokenize Markdown
function tokenizeMarkdown(text: string): Token[] {
  const tokens: Token[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Code block ```
    const codeBlockMatch = remaining.match(/^(```[\s\S]*?```)/);
    if (codeBlockMatch) {
      tokens.push({ type: 'codeblock', content: codeBlockMatch[1] });
      remaining = remaining.slice(codeBlockMatch[1].length);
      continue;
    }

    // Inline code `...`
    const inlineCodeMatch = remaining.match(/^(`[^`\n]+`)/);
    if (inlineCodeMatch) {
      tokens.push({ type: 'code', content: inlineCodeMatch[1] });
      remaining = remaining.slice(inlineCodeMatch[1].length);
      continue;
    }

    // Heading: # at start of line
    const headingMatch = remaining.match(/^(#{1,6}\s+[^\n]*)/);
    if (headingMatch && (tokens.length === 0 || tokens[tokens.length - 1].content.endsWith('\n'))) {
      tokens.push({ type: 'heading', content: headingMatch[1] });
      remaining = remaining.slice(headingMatch[1].length);
      continue;
    }

    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(\*\*[^*]+\*\*|__[^_]+__)/);
    if (boldMatch) {
      tokens.push({ type: 'bold', content: boldMatch[1] });
      remaining = remaining.slice(boldMatch[1].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^(\*[^*\n]+\*|_[^_\n]+_)/);
    if (italicMatch) {
      tokens.push({ type: 'italic', content: italicMatch[1] });
      remaining = remaining.slice(italicMatch[1].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^(~~[^~]+~~)/);
    if (strikeMatch) {
      tokens.push({ type: 'strikethrough', content: strikeMatch[1] });
      remaining = remaining.slice(strikeMatch[1].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^(\[[^\]]+\]\([^)]+\))/);
    if (linkMatch) {
      tokens.push({ type: 'link', content: linkMatch[1] });
      remaining = remaining.slice(linkMatch[1].length);
      continue;
    }

    // Image: ![alt](url)
    const imageMatch = remaining.match(/^(!\[[^\]]*\]\([^)]+\))/);
    if (imageMatch) {
      tokens.push({ type: 'image', content: imageMatch[1] });
      remaining = remaining.slice(imageMatch[1].length);
      continue;
    }

    // Blockquote: > at start
    const quoteMatch = remaining.match(/^(>[^\n]*)/);
    if (quoteMatch && (tokens.length === 0 || tokens[tokens.length - 1].content.endsWith('\n'))) {
      tokens.push({ type: 'blockquote', content: quoteMatch[1] });
      remaining = remaining.slice(quoteMatch[1].length);
      continue;
    }

    // List item: - or * or 1. at start
    const listMatch = remaining.match(/^((?:[-*]|\d+\.)\s+)/);
    if (listMatch && (tokens.length === 0 || tokens[tokens.length - 1].content.endsWith('\n'))) {
      tokens.push({ type: 'list', content: listMatch[1] });
      remaining = remaining.slice(listMatch[1].length);
      continue;
    }

    // Horizontal rule
    const hrMatch = remaining.match(/^(---+|\*\*\*+|___+)(?:\n|$)/);
    if (hrMatch) {
      tokens.push({ type: 'hr', content: hrMatch[1] });
      remaining = remaining.slice(hrMatch[1].length);
      continue;
    }

    // Regular text
    const textMatch = remaining.match(/^([^*_`#\[!\n>-]+|\n)/);
    if (textMatch) {
      tokens.push({ type: 'text', content: textMatch[1] });
      remaining = remaining.slice(textMatch[1].length);
      continue;
    }

    // Single character fallback
    tokens.push({ type: 'text', content: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

// Get CSS class for token type
function getTokenClass(type: string, mode: HighlightMode): string {
  if (mode === 'latex') {
    switch (type) {
      case 'comment': return 'text-gray-500 italic';
      case 'math': return 'text-purple-600 dark:text-purple-400';
      case 'command': return 'text-blue-600 dark:text-blue-400 font-medium';
      case 'environment': return 'text-violet-600 dark:text-violet-400 font-medium';
      case 'argument': return 'text-emerald-600 dark:text-emerald-400';
      case 'brace': return 'text-gray-500';
      default: return '';
    }
  }

  if (mode === 'markdown') {
    switch (type) {
      case 'heading': return 'text-gray-900 dark:text-gray-100 font-bold';
      case 'bold': return 'font-bold';
      case 'italic': return 'italic';
      case 'strikethrough': return 'line-through';
      case 'code': return 'bg-gray-100 dark:bg-gray-800 text-pink-600 dark:text-pink-400 px-1 rounded font-mono text-sm';
      case 'codeblock': return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded font-mono text-sm block';
      case 'link': return 'text-blue-600 dark:text-blue-400 underline';
      case 'image': return 'text-green-600 dark:text-green-400';
      case 'blockquote': return 'text-gray-600 dark:text-gray-400 border-l-4 border-gray-300 pl-2';
      case 'list': return 'text-gray-500';
      case 'hr': return 'text-gray-400';
      default: return '';
    }
  }

  return '';
}

export default function SyntaxHighlighter({ content, mode, className = '' }: SyntaxHighlighterProps) {
  const highlighted = useMemo(() => {
    if (mode === 'plain') {
      return <span>{content}</span>;
    }

    const tokens = mode === 'latex' ? tokenizeLatex(content) : tokenizeMarkdown(content);

    return tokens.map((token, i) => {
      const tokenClass = getTokenClass(token.type, mode);
      if (tokenClass) {
        return (
          <span key={i} className={tokenClass}>
            {token.content}
          </span>
        );
      }
      return <span key={i}>{token.content}</span>;
    });
  }, [content, mode]);

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {highlighted}
    </div>
  );
}
