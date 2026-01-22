'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';

type Section = 'getting-started' | 'editing' | 'cells' | 'profiles' | 'chat' | 'shortcuts' | 'tips';

export default function GuidePage() {
  const [activeSection, setActiveSection] = useState<Section>('getting-started');

  const sections: { id: Section; title: string; icon: string }[] = [
    { id: 'getting-started', title: 'Getting Started', icon: '🚀' },
    { id: 'editing', title: 'Editing Text', icon: '✏️' },
    { id: 'cells', title: 'Managing Cells', icon: '📝' },
    { id: 'profiles', title: 'Style Profiles', icon: '🎨' },
    { id: 'chat', title: 'Chat Assistant', icon: '💬' },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: '⌨️' },
    { id: 'tips', title: 'Tips & Tricks', icon: '💡' },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header currentPage="guide" />

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[var(--border)] min-h-[calc(100vh-3.5rem)] p-4 sticky top-14">
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-4">
            User Guide
          </h2>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                  activeSection === section.id
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                }`}
              >
                <span>{section.icon}</span>
                {section.title}
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-4 border-t border-[var(--border)]">
            <Link
              href="/editor"
              className="block w-full text-center px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm hover:opacity-90"
            >
              Open Editor
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8 max-w-4xl">
          {activeSection === 'getting-started' && <GettingStartedSection />}
          {activeSection === 'editing' && <EditingSection />}
          {activeSection === 'cells' && <CellsSection />}
          {activeSection === 'profiles' && <ProfilesSection />}
          {activeSection === 'chat' && <ChatSection />}
          {activeSection === 'shortcuts' && <ShortcutsSection />}
          {activeSection === 'tips' && <TipsSection />}
        </main>
      </div>
    </div>
  );
}

function GettingStartedSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Getting Started</h1>
        <p className="text-[var(--muted-foreground)]">Set up Styler and create your first document</p>
      </div>

      <Step number={1} title="Configure Your API Key">
        <p>Styler needs an API key to work. Go to <strong>Settings</strong> and add your key:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Anthropic</strong> (recommended) - Get a key at <a href="https://console.anthropic.com" className="text-[var(--primary)] hover:underline" target="_blank">console.anthropic.com</a></li>
          <li><strong>OpenAI</strong> - Get a key at <a href="https://platform.openai.com" className="text-[var(--primary)] hover:underline" target="_blank">platform.openai.com</a></li>
          <li><strong>Ollama</strong> - Free, runs locally. Install from <a href="https://ollama.ai" className="text-[var(--primary)] hover:underline" target="_blank">ollama.ai</a></li>
        </ul>
      </Step>

      <Step number={2} title="Load a Document">
        <p>Open the <strong>Editor</strong> and load your content:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Upload</strong> - Click "Choose File" to upload a .txt, .md, or .pdf file</li>
          <li><strong>Paste</strong> - Paste text directly into the text area</li>
          <li><strong>Generate</strong> - Use AI to create new content from a prompt</li>
        </ul>
        <Tip>PDF imports may have artifacts. Use the <strong>Prettify</strong> button to clean them up.</Tip>
      </Step>

      <Step number={3} title="Select an Audience Profile">
        <p>Click the profile dropdown in the toolbar to choose who you're writing for:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Academic Journal</strong> - Formal, technical, comprehensive</li>
          <li><strong>Technical Blog</strong> - Clear, engaging, moderate jargon</li>
          <li><strong>Grant Proposal</strong> - Persuasive, confident, impact-focused</li>
        </ul>
        <p className="mt-2">You can create custom profiles in Settings.</p>
      </Step>

      <Step number={4} title="Make Your First Edit">
        <p>Click on a cell (paragraph) to select it, then:</p>
        <ol className="list-decimal list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>Open the <strong>Edit</strong> panel (click the ✨ icon)</li>
          <li>Choose a quick action or type a custom instruction</li>
          <li>Click <strong>Edit Selected</strong></li>
          <li>Review the diff and <strong>Accept</strong> or <strong>Reject</strong></li>
        </ol>
      </Step>
    </div>
  );
}

function EditingSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Editing Text</h1>
        <p className="text-[var(--muted-foreground)]">Learn how to edit your document with AI assistance</p>
      </div>

      <SubSection title="Styler Edit Mode">
        <p>The main editing mode. Select cells and apply targeted edits:</p>
        <ol className="list-decimal list-inside mt-2 space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Select cells</strong> - Click to select one, Shift+click for range, Cmd/Ctrl+click for multiple</li>
          <li><strong>Choose a template</strong> - Quick actions like "Make concise", "Fix grammar", "Add hedging"</li>
          <li><strong>Or type instructions</strong> - Custom instructions like "make this sound more confident"</li>
          <li><strong>Review the diff</strong> - Green = additions, Red = deletions</li>
          <li><strong>Toggle changes</strong> - Click individual changes to revert them</li>
          <li><strong>Accept or Reject</strong> - Apply or discard the edit</li>
        </ol>
      </SubSection>

      <SubSection title="Vibe Edit Mode">
        <p>Apply a "vibe" to your entire selection:</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <VibeCard name="Polish" desc="Refine for clarity and flow" />
          <VibeCard name="Concise" desc="Make direct and succinct" />
          <VibeCard name="Formal" desc="Increase professionalism" />
          <VibeCard name="Engaging" desc="Make more compelling" />
          <VibeCard name="Clear" desc="Improve readability" />
          <VibeCard name="Academic" desc="Scholarly standards" />
        </div>
        <p className="mt-3 text-[var(--muted-foreground)]">You can also add custom guidance alongside vibes.</p>
      </SubSection>

      <SubSection title="Inline Selection Editing">
        <p>For precise edits within a cell:</p>
        <ol className="list-decimal list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>Highlight specific text within a cell (click and drag)</li>
          <li>A popover appears with edit options</li>
          <li>Type an instruction and click Edit</li>
          <li>Only the selected text is modified</li>
        </ol>
        <Tip>Great for fixing a specific phrase without affecting the rest of the paragraph.</Tip>
      </SubSection>

      <SubSection title="Refinement Loop">
        <p>Not happy with the suggestion? Click <strong>Refine</strong>:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>Add feedback: "keep the original word for X"</li>
          <li>Use quick feedback chips: "Too clunky", "Lost intent", "Too many edits"</li>
          <li>The AI generates a new edit that honors your feedback</li>
          <li>Repeat until satisfied</li>
        </ul>
      </SubSection>

      <SubSection title="Cell Operations">
        <p>Manage your cells with toolbar buttons:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Split</strong> - Break a cell into multiple cells</li>
          <li><strong>Merge</strong> - Combine selected cells into one</li>
          <li><strong>Prettify</strong> - AI cleanup: merge fragments, remove artifacts, fix formatting</li>
        </ul>
      </SubSection>
    </div>
  );
}

function CellsSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Managing Cells</h1>
        <p className="text-[var(--muted-foreground)]">Navigate, select, and organize your document</p>
      </div>

      <SubSection title="Selecting Cells">
        <table className="w-full mt-3 text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-2 text-[var(--muted-foreground)]">Action</th>
              <th className="text-left py-2 text-[var(--muted-foreground)]">How</th>
            </tr>
          </thead>
          <tbody className="text-[var(--foreground)]">
            <tr className="border-b border-[var(--border)]">
              <td className="py-2">Select one cell</td>
              <td className="py-2">Click on it</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-2">Select range</td>
              <td className="py-2">Click first, Shift+click last</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-2">Add/remove from selection</td>
              <td className="py-2">Cmd/Ctrl+click</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-2">Select all</td>
              <td className="py-2">Cmd/Ctrl+A</td>
            </tr>
            <tr className="border-b border-[var(--border)]">
              <td className="py-2">Clear selection</td>
              <td className="py-2">Escape or click background</td>
            </tr>
          </tbody>
        </table>
      </SubSection>

      <SubSection title="Cell Toolbar">
        <p>Hover over a cell to see the toolbar in the top-right corner:</p>
        <div className="flex items-center gap-4 mt-3 p-4 bg-[var(--muted)]/50 rounded-lg">
          <div className="flex items-center gap-2 px-2 py-1 bg-[var(--background)] border border-[var(--border)] rounded">
            <span className="text-sm">↑</span>
            <span className="text-sm">↓</span>
            <span className="text-[var(--border)]">|</span>
            <span className="text-sm">🗑</span>
          </div>
          <div className="text-sm text-[var(--muted-foreground)]">
            Move up • Move down • Delete
          </div>
        </div>
      </SubSection>

      <SubSection title="Editing Cell Content">
        <p>Double-click a cell or press <strong>Enter</strong> with a cell selected to edit its content directly.</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>A text editor opens inline</li>
          <li>Make your changes</li>
          <li>Click outside or press Escape to save</li>
        </ul>
      </SubSection>

      <SubSection title="Adding New Cells">
        <p>Hover between cells to see the "+ Cell" button. Click to insert:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>+ Cell</strong> - Add a regular paragraph</li>
          <li><strong>+ Heading</strong> - Add a section heading</li>
          <li><strong>AI Generate</strong> - Generate content with AI</li>
        </ul>
      </SubSection>

      <SubSection title="Copy, Cut, Paste">
        <p>Standard clipboard operations work on cells:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Cmd/Ctrl+C</strong> - Copy selected cells</li>
          <li><strong>Cmd/Ctrl+X</strong> - Cut selected cells</li>
          <li><strong>Cmd/Ctrl+V</strong> - Paste (inserts after selection)</li>
        </ul>
        <Tip>Pasted text is automatically split into cells by paragraph breaks.</Tip>
      </SubSection>
    </div>
  );
}

function ProfilesSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Style Profiles</h1>
        <p className="text-[var(--muted-foreground)]">Customize how Styler edits your writing</p>
      </div>

      <SubSection title="Three-Layer System">
        <p>Your style is controlled at three levels:</p>
        <div className="space-y-3 mt-4">
          <ProfileLayer
            name="Base Style"
            scope="Global"
            desc="Your fundamental preferences: verbosity, formality, hedging, format rules"
          />
          <ProfileLayer
            name="Audience Profiles"
            scope="Switchable"
            desc="Context overlays: Academic, Blog, Business, etc."
          />
          <ProfileLayer
            name="Document Adjustments"
            scope="Per-document"
            desc="Fine-tune sliders for the current document"
          />
        </div>
      </SubSection>

      <SubSection title="Base Style (Settings)">
        <p>Configure in Settings → Base Style:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Verbosity</strong> - Terse, Moderate, or Detailed</li>
          <li><strong>Formality</strong> - 1 (casual) to 5 (academic)</li>
          <li><strong>Hedging</strong> - Confident, Balanced, or Cautious</li>
          <li><strong>Format bans</strong> - Disallow emojis, em-dashes, etc.</li>
        </ul>
      </SubSection>

      <SubSection title="Audience Profiles (Settings)">
        <p>Create profiles for different writing contexts:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Jargon level</strong> - How technical to be</li>
          <li><strong>Emphasis points</strong> - What to highlight</li>
          <li><strong>Framing guidance</strong> - How to approach the topic</li>
          <li><strong>Length guidance</strong> - Concise vs comprehensive</li>
        </ul>
        <Tip>Import profiles from JSON files in Settings for quick setup.</Tip>
      </SubSection>

      <SubSection title="Document Profile (Editor)">
        <p>Click the 📄 icon to open the Document Profile panel:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Adjustment sliders</strong> - Fine-tune verbosity, formality, hedging for this document</li>
          <li><strong>Document goals</strong> - Auto-generated objectives (editable)</li>
          <li><strong>Learned rules</strong> - Rules learned from your edits on this document</li>
        </ul>
      </SubSection>

      <SubSection title="How Learning Works">
        <p>Styler learns from your feedback:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li><strong>Rejections with feedback</strong> - "Too formal" → formality decreases</li>
          <li><strong>Toggled-off changes</strong> - Patterns you reject become avoid rules</li>
          <li><strong>Conservative thresholds</strong> - Rules require 5+ consistent signals</li>
        </ul>
      </SubSection>
    </div>
  );
}

function ChatSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Chat Assistant</h1>
        <p className="text-[var(--muted-foreground)]">Get feedback and advice while editing</p>
      </div>

      <SubSection title="Opening the Chat">
        <p>Click the 💬 icon in the toolbar to open the Chat Assistant panel.</p>
      </SubSection>

      <SubSection title="General Chat Mode">
        <p>Ask questions about writing in general:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>"How should I structure an introduction?"</li>
          <li>"What's a good way to transition between these ideas?"</li>
          <li>"Is this too formal for a blog post?"</li>
        </ul>
        <p className="mt-2">Answers are informed by your configured style preferences.</p>
      </SubSection>

      <SubSection title="Document Chat Mode">
        <p>Get feedback on specific content. Select cells first, then switch to Document Chat:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-[var(--muted-foreground)]">
          <li>"Is this paragraph clear?"</li>
          <li>"Does this flow well from the previous section?"</li>
          <li>"What's weak about this argument?"</li>
        </ul>
        <Tip>The chat automatically switches to Document mode when you have cells selected.</Tip>
      </SubSection>

      <SubSection title="Alignment Score">
        <p>Click <strong>Get Alignment Score</strong> to analyze how well your selected content matches your style profile:</p>
        <div className="mt-3 p-4 bg-[var(--muted)]/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-green-600">0.85</span>
            <span className="text-[var(--muted-foreground)]">Alignment Score</span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            <strong>Analysis:</strong> Content aligns well with formal academic style.
            Hedging is appropriate but verbosity could be reduced.
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            <strong>Suggestions:</strong> Consider tightening the opening paragraph.
          </p>
        </div>
      </SubSection>
    </div>
  );
}

function ShortcutsSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Keyboard Shortcuts</h1>
        <p className="text-[var(--muted-foreground)]">Work faster with keyboard navigation</p>
      </div>

      <SubSection title="Navigation">
        <ShortcutTable shortcuts={[
          { keys: '↑ / ↓', action: 'Move selection up/down' },
          { keys: 'Shift + ↑/↓', action: 'Extend selection' },
          { keys: 'Cmd/Ctrl + A', action: 'Select all cells' },
          { keys: 'Escape', action: 'Clear selection / Exit edit mode' },
        ]} />
      </SubSection>

      <SubSection title="Editing">
        <ShortcutTable shortcuts={[
          { keys: 'Enter', action: 'Edit selected cell' },
          { keys: 'Delete / Backspace', action: 'Delete selected cells' },
        ]} />
      </SubSection>

      <SubSection title="Clipboard">
        <ShortcutTable shortcuts={[
          { keys: 'Cmd/Ctrl + C', action: 'Copy selected cells' },
          { keys: 'Cmd/Ctrl + X', action: 'Cut selected cells' },
          { keys: 'Cmd/Ctrl + V', action: 'Paste cells' },
        ]} />
      </SubSection>

      <SubSection title="History">
        <ShortcutTable shortcuts={[
          { keys: 'Cmd/Ctrl + Z', action: 'Undo' },
          { keys: 'Cmd/Ctrl + Shift + Z', action: 'Redo' },
        ]} />
      </SubSection>
    </div>
  );
}

function TipsSection() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Tips & Tricks</h1>
        <p className="text-[var(--muted-foreground)]">Get the most out of Styler</p>
      </div>

      <SubSection title="For Best Results">
        <ul className="list-disc list-inside space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Be specific with instructions</strong> - "Make more confident" works better than "improve"</li>
          <li><strong>Use the refinement loop</strong> - Don't accept mediocre edits. Refine with feedback.</li>
          <li><strong>Toggle individual changes</strong> - Accept the good parts, reject the bad</li>
          <li><strong>Train it over time</strong> - Consistent feedback teaches the system your preferences</li>
        </ul>
      </SubSection>

      <SubSection title="PDF Imports">
        <ul className="list-disc list-inside space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Always Prettify first</strong> - PDFs have artifacts that need cleanup</li>
          <li><strong>Check for broken sentences</strong> - PDFs often split lines incorrectly</li>
          <li><strong>Remove page numbers</strong> - Prettify handles this automatically</li>
        </ul>
      </SubSection>

      <SubSection title="LaTeX Documents">
        <ul className="list-disc list-inside space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Styler detects LaTeX automatically</strong> - Commands are preserved</li>
          <li><strong>Prettify groups packages</strong> - \usepackage commands are consolidated</li>
          <li><strong>Comments are removed</strong> - Prettify strips % comments for cleaner output</li>
        </ul>
      </SubSection>

      <SubSection title="Multi-Cell Editing">
        <ul className="list-disc list-inside space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Great for transitions</strong> - Select adjacent paragraphs to improve flow</li>
          <li><strong>Reduce redundancy</strong> - Edit multiple cells to remove repeated ideas</li>
          <li><strong>Restructure arguments</strong> - Reorder and rewrite across paragraphs</li>
        </ul>
      </SubSection>

      <SubSection title="When Edits Miss the Mark">
        <ul className="list-disc list-inside space-y-2 text-[var(--muted-foreground)]">
          <li><strong>Try a different instruction</strong> - Rephrase what you want</li>
          <li><strong>Be more specific</strong> - "Don't change the first sentence" helps</li>
          <li><strong>Use quick feedback chips</strong> - One-click feedback guides refinement</li>
          <li><strong>Check your profile</strong> - Wrong audience profile leads to wrong edits</li>
        </ul>
      </SubSection>
    </div>
  );
}

// Helper components

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{title}</h3>
        <div className="text-[var(--foreground)]">{children}</div>
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">{title}</h2>
      <div className="text-[var(--foreground)]">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200">
      <strong>Tip:</strong> {children}
    </div>
  );
}

function VibeCard({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="p-3 bg-[var(--muted)]/50 rounded-lg">
      <div className="font-medium text-[var(--foreground)]">{name}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{desc}</div>
    </div>
  );
}

function ProfileLayer({ name, scope, desc }: { name: string; scope: string; desc: string }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-[var(--muted)]/50 rounded-lg">
      <div className="flex-shrink-0 px-3 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-sm font-medium">
        {scope}
      </div>
      <div>
        <div className="font-medium text-[var(--foreground)]">{name}</div>
        <div className="text-sm text-[var(--muted-foreground)]">{desc}</div>
      </div>
    </div>
  );
}

function ShortcutTable({ shortcuts }: { shortcuts: { keys: string; action: string }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {shortcuts.map((s, i) => (
          <tr key={i} className="border-b border-[var(--border)]">
            <td className="py-2 w-48">
              <kbd className="px-2 py-1 bg-[var(--muted)] rounded text-xs font-mono">{s.keys}</kbd>
            </td>
            <td className="py-2 text-[var(--muted-foreground)]">{s.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
