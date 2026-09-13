import React from 'react';
// Lezer Java grammar: syntax-aware editing (indentation, bracket matching,
// folding) + Tokyo Night highlighting via the shared CodeEditor theme. The
// package ships ONLY the grammar — no linter/completion surface worth wiring
// (Java diagnostics need a language server, out of scope for a viewer).
import { java } from '@codemirror/lang-java';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── Layout ──────────────────────────────────────────────────────────────────

// Full-area session layout for the RIGHT content pane — identical flush
// geometry to the other editor features (cross-reference:
// src/features/textReader/TextReaderFeature.tsx SessionLayout,
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

// Renders the ACTIVE file's Java editor. Mounted by the dashboard inside the
// content pane as a plugin tab. Edits flow back into the shared session via
// store.updateContent (same path as the generic Editor tab), so switching
// tabs never loses work. Module-level extensions constant — extensions are
// stateless, a stable reference avoids unnecessary CodeMirror
// reconfigurations on re-render (same rationale as CodeEditor.tsx's
// editorExtensions).
const javaEditorExtensions = [java()];

export const JavaEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <SessionLayout data-testid="java-viewer-session">
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="java-editor"
                    height="100%"
                    extensions={javaEditorExtensions}
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Extension check: does the file name end in .java (case-insensitive)? Pure
// predicate on the name — content is never inspected here (a broken .java
// file still gets the Java tab first; the editor is the tool that fixes it).
// Edge cases: `Main.JAVA` matches via toLowerCase; `notjava.javac` does NOT
// match (endsWith is exact).
export const isJavaFile = (file: ScribbleFileLike): boolean =>
    file.name.toLowerCase().endsWith('.java');

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the editor surface for it
// (only when it is a text file — binary/image/pdf never render here, mirroring
// the renderFile guard). Renders nothing when no file is open.
export const JavaViewerFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active && active.kind === 'text' ? <JavaEditorSurface file={active} /> : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Java" tab for text files ONLY. `matches`
// claims priority for .java files, so the tab order for those becomes
// [Java][Editor] — anything else keeps registration order. Java is a
// syntax-aware specialization of the generic Code editor: same CodeEditor
// base + same session updateContent path, with the Java grammar on top.
registerScribblePlugin({
    id: 'java-viewer',
    label: 'Java',
    title: 'Java Editor',
    matches: isJavaFile,
    renderFile: (file) => (file.kind === 'text' ? <JavaEditorSurface file={file} /> : null),
});

// Default export: the store-connected component (legacy import surface).
export default JavaViewerFeature;
