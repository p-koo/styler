'use client';

import { useEffect, useRef, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput, HighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags } from '@lezer/highlight';

export type EditorMode = 'plain' | 'markdown' | 'latex';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: EditorMode;
  darkMode?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

// Custom highlight style that works with CSS variables
const customHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed' },           // purple for keywords
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },  // gray italic for comments
  { tag: tags.string, color: '#059669' },            // green for strings
  { tag: tags.number, color: '#d97706' },            // amber for numbers
  { tag: tags.operator, color: '#6366f1' },          // indigo for operators
  { tag: tags.variableName, color: '#2563eb' },      // blue for variables
  { tag: tags.function(tags.variableName), color: '#dc2626' }, // red for functions
  { tag: tags.typeName, color: '#0891b2' },          // cyan for types
  { tag: tags.heading, fontWeight: 'bold', color: '#1f2937' },
  { tag: tags.heading1, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading2, fontSize: '1.2em', fontWeight: 'bold' },
  { tag: tags.heading3, fontSize: '1.1em', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.url, color: '#2563eb' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.processingInstruction, color: '#7c3aed' }, // LaTeX commands
  { tag: tags.meta, color: '#7c3aed' },               // LaTeX
  { tag: tags.contentSeparator, color: '#9ca3af' },   // ---
]);

// Dark mode highlight style
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#a78bfa' },           // lighter purple
  { tag: tags.comment, color: '#9ca3af', fontStyle: 'italic' },
  { tag: tags.string, color: '#34d399' },            // lighter green
  { tag: tags.number, color: '#fbbf24' },            // lighter amber
  { tag: tags.operator, color: '#818cf8' },          // lighter indigo
  { tag: tags.variableName, color: '#60a5fa' },      // lighter blue
  { tag: tags.function(tags.variableName), color: '#f87171' },
  { tag: tags.typeName, color: '#22d3ee' },          // lighter cyan
  { tag: tags.heading, fontWeight: 'bold', color: '#f3f4f6' },
  { tag: tags.heading1, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading2, fontSize: '1.2em', fontWeight: 'bold' },
  { tag: tags.heading3, fontSize: '1.1em', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#60a5fa', textDecoration: 'underline' },
  { tag: tags.url, color: '#60a5fa' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.processingInstruction, color: '#a78bfa' },
  { tag: tags.meta, color: '#a78bfa' },
  { tag: tags.contentSeparator, color: '#6b7280' },
]);

// Light theme
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--foreground)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px',
  },
}, { dark: false });

// Dark theme
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--foreground)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(96, 165, 250, 0.3)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px',
  },
}, { dark: true });

export default function CodeMirrorEditor({
  value,
  onChange,
  mode,
  darkMode = false,
  placeholder,
  readOnly = false,
  className = '',
  minHeight = '200px',
}: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  // Get language extension based on mode
  const getLanguageExtension = useCallback((editorMode: EditorMode) => {
    switch (editorMode) {
      case 'markdown':
        return markdown();
      case 'latex':
        return StreamLanguage.define(stex);
      default:
        return [];
    }
  }, []);

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        languageCompartment.current.of(getLanguageExtension(mode)),
        themeCompartment.current.of(darkMode ? darkTheme : lightTheme),
        highlightCompartment.current.of(
          syntaxHighlighting(darkMode ? darkHighlightStyle : customHighlightStyle)
        ),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        updateListener,
        EditorView.lineWrapping,
        placeholder ? EditorView.contentAttributes.of({ 'data-placeholder': placeholder }) : [],
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only run once on mount

  // Update mode
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: languageCompartment.current.reconfigure(getLanguageExtension(mode)),
      });
    }
  }, [mode, getLanguageExtension]);

  // Update theme
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: [
          themeCompartment.current.reconfigure(darkMode ? darkTheme : lightTheme),
          highlightCompartment.current.reconfigure(
            syntaxHighlighting(darkMode ? darkHighlightStyle : customHighlightStyle)
          ),
        ],
      });
    }
  }, [darkMode]);

  // Update readOnly
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
      });
    }
  }, [readOnly]);

  // Sync external value changes
  useEffect(() => {
    if (viewRef.current) {
      const currentValue = viewRef.current.state.doc.toString();
      if (value !== currentValue) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className={`border border-[var(--border)] rounded-lg overflow-hidden ${className}`}
      style={{ minHeight }}
    />
  );
}
