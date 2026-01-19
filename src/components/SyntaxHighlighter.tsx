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

// Get inline style for token type
function getTokenStyle(type: string, mode: HighlightMode): React.CSSProperties {
  if (mode === 'latex') {
    switch (type) {
      case 'comment': return { color: '#6b7280', fontStyle: 'italic' };
      case 'math': return { color: '#9333ea' }; // purple-600
      case 'command': return { color: '#2563eb', fontWeight: 500 }; // blue-600
      case 'environment': return { color: '#7c3aed', fontWeight: 500 }; // violet-600
      case 'argument': return { color: '#059669' }; // emerald-600
      case 'brace': return { color: '#6b7280' }; // gray-500
      default: return {};
    }
  }

  if (mode === 'markdown') {
    switch (type) {
      case 'heading': return { fontWeight: 'bold', color: '#1f2937' };
      case 'bold': return { fontWeight: 'bold' };
      case 'italic': return { fontStyle: 'italic' };
      case 'strikethrough': return { textDecoration: 'line-through' };
      case 'code': return {
        backgroundColor: '#f3f4f6',
        color: '#db2777',
        padding: '0.125rem 0.25rem',
        borderRadius: '0.25rem',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: '0.875em'
      };
      case 'codeblock': return {
        backgroundColor: '#f3f4f6',
        color: '#374151',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: '0.875em',
        display: 'block'
      };
      case 'link': return { color: '#2563eb', textDecoration: 'underline' };
      case 'image': return { color: '#059669' };
      case 'blockquote': return { color: '#6b7280', borderLeft: '4px solid #d1d5db', paddingLeft: '0.5rem' };
      case 'list': return { color: '#6b7280' };
      case 'hr': return { color: '#9ca3af' };
      default: return {};
    }
  }

  return {};
}

export default function SyntaxHighlighter({ content, mode, className = '' }: SyntaxHighlighterProps) {
  const highlighted = useMemo(() => {
    if (mode === 'plain') {
      return <span>{content}</span>;
    }

    const tokens = mode === 'latex' ? tokenizeLatex(content) : tokenizeMarkdown(content);

    return tokens.map((token, i) => {
      const style = getTokenStyle(token.type, mode);
      if (Object.keys(style).length > 0) {
        return (
          <span key={i} style={style}>
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
