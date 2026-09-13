import React from 'react';
// Lezer Rust grammar: syntax-aware editing (indentation, bracket matching,
// folding) + Tokyo Night highlighting via the shared CodeEditor theme. The
// package ships ONLY the grammar — rust-analyzer diagnostics are a language
// server concern, out of scope for a viewer.
import { rust } from '@codemirror/lang-rust';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── Layout ──────────────────────────────────────────────────────────────────

// Full-area session layout for the RIGHT content pane — identical flush
// geometry to the other editor features (cross-reference:
// src/features/typescriptViewer/TypeScriptViewerFeature.tsx SessionLayout):
// zero padding, height-locked to 100%, CodeMirror's internal .cm-scroller
// owns the vertical scrollbar.
const SessionLayout = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: 0,
    height: '100%',
    width: '100%',
    boxSizing: 'border-box' as const,
    minWidth: 0,
    overflow: 'hidden' as const,
});

const EditorStack = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
});

// ─── Content plugin component ────────────────────────────────────────────────

// Renders the ACTIVE file's Rust editor. Mounted by the dashboard inside the
// content pane as a plugin tab. Edits flow back into the shared session via
// store.updateContent (same path as the generic Editor tab), so switching
// tabs never loses work. Module-level extensions constant — extensions are
// stateless, a stable reference avoids unnecessary CodeMirror
// reconfigurations on re-render (same rationale as CodeEditor.tsx's
// editorExtensions).
const rustEditorExtensions = [rust()];

export const RustEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <SessionLayout data-testid="rust-viewer-session">
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="rust-editor"
                    height="100%"
                    extensions={rustEditorExtensions}
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Extension check: does the file name end in .rs (case-insensitive)? Pure
// predicate on the name — content is never inspected here (a broken .rs file
// still gets the Rust tab first; the editor is the tool that fixes it).
// Edge cases: `MAIN.RS` matches via toLowerCase; `car.cars` does NOT match
// (endsWith is exact); `main.rs.bak` does NOT match.
export const isRustFile = (file: ScribbleFileLike): boolean =>
    file.name.toLowerCase().endsWith('.rs');

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the editor surface for it
// (only when it is a text file — binary/image/pdf never render here, mirroring
// the renderFile guard). Renders nothing when no file is open.
export const RustViewerFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active && active.kind === 'text' ? <RustEditorSurface file={active} /> : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Rust" tab for text files ONLY. `matches`
// claims priority for .rs files, so the tab order for those becomes
// [Rust][Editor] — anything else keeps registration order. Rust is a
// syntax-aware specialization of the generic Code editor: same CodeEditor
// base + same session updateContent path, with the Rust grammar on top.
registerScribblePlugin({
    id: 'rust-viewer',
    label: 'Rust',
    title: 'Rust Editor',
    matches: isRustFile,
    renderFile: (file) => (file.kind === 'text' ? <RustEditorSurface file={file} /> : null),
});

// Default export: the store-connected component (legacy import surface).
export default RustViewerFeature;
