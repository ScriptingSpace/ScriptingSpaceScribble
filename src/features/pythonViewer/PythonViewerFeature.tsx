import React from 'react';
// Lezer Python grammar + Python-aware completion. python() bundles the
// globalCompletion (builtins + keywords) and localCompletionSource
// (locally defined names) sources behind autocompletion() — wiring
// autocompletion({ override: [...] }) here mirrors the JSON plugin's
// structure-aware completion setup (cross-reference:
// src/features/jsonViewer/JsonViewerFeature.tsx jsonEditorExtensions).
// Python diagnostics need a language server (flake8/pyright) — out of scope
// for a viewer, so no linter is wired.
import { python, globalCompletion, localCompletionSource } from '@codemirror/lang-python';
import { autocompletion } from '@codemirror/autocomplete';
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

// Editor extensions: Python grammar + the package's two completion sources
// (builtins/keywords + local names) as overrides. Module-level constant —
// extensions are stateless, a stable reference avoids unnecessary CodeMirror
// reconfigurations on re-render (same rationale as CodeEditor.tsx's
// editorExtensions). autocompletion() fires while typing; the override array
// replaces the default `completeAnyWord`-style source with the Python-aware
// ones.
const pythonEditorExtensions = [
    python(),
    autocompletion({ override: [globalCompletion, localCompletionSource] }),
];

// Renders the ACTIVE file's Python editor. Mounted by the dashboard inside
// the content pane as a plugin tab. Edits flow back into the shared session
// via store.updateContent (same path as the generic Editor tab), so switching
// tabs never loses work.
export const PythonEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <SessionLayout data-testid="python-viewer-session">
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="python-editor"
                    height="100%"
                    extensions={pythonEditorExtensions}
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Extension check: does the file name end in .py (case-insensitive)? Pure
// predicate on the name — content is never inspected here (a broken .py file
// still gets the Python tab first; the editor is the tool that fixes it).
// Edge cases: `MAIN.PY` matches via toLowerCase; `script.python` does NOT
// match (endsWith is exact); `.pyw` (Windows GUI scripts) is deliberately
// NOT matched — keep the matcher strict to the canonical extension.
export const isPythonFile = (file: ScribbleFileLike): boolean =>
    file.name.toLowerCase().endsWith('.py');

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the editor surface for it
// (only when it is a text file — binary/image/pdf never render here, mirroring
// the renderFile guard). Renders nothing when no file is open.
export const PythonViewerFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active && active.kind === 'text' ? <PythonEditorSurface file={active} /> : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Python" tab for text files ONLY. `matches`
// claims priority for .py files, so the tab order for those becomes
// [Python][Editor] — anything else keeps registration order. Python is a
// syntax-aware specialization of the generic Code editor: same CodeEditor
// base + same session updateContent path, with the Python grammar +
// completion on top.
registerScribblePlugin({
    id: 'python-viewer',
    label: 'Python',
    title: 'Python Editor',
    matches: isPythonFile,
    renderFile: (file) => (file.kind === 'text' ? <PythonEditorSurface file={file} /> : null),
});

// Default export: the store-connected component (legacy import surface).
export default PythonViewerFeature;
