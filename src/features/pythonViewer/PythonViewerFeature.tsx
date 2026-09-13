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
import { styledComponent, useStateHook } from '@presource/react';
import { CodeEditor } from '../../components';
import {
    registerScribblePlugin,
    scribbleFileStore,
    // Pyodide access layer — runPython executes source, getPythonStatus
    // drives the Run button during the (slow, first-time) wasm load
    // (cross-reference: src/functions/pythonRuntime.ts)
    runPython,
    getPythonStatus,
    isPythonSupported,
    type PyRunResult,
    // Tokyo Night Storm palette tokens (functions/palette.ts)
    PALETTE_ACCENT,
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_TERTIARY,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_FAINT,
    PALETTE_TEXT_MUTED,
    PALETTE_WELL,
} from '../../functions';
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

// ─── Run bar + output panel ──────────────────────────────────────────────────

// Toolbar strip between the editor and the output panel: Run button + status
// hint on the left, duration-free (PyRunResult has no timing) — the hint
// communicates the wasm state instead ("Loading Python runtime…", etc.).
const RunBar = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    flexShrink: 0,
    borderTop: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_SURFACE,
});

// The Run button. Disabled while a run is in flight (busy) — overlapping
// runs would interleave their stdout collectors. Also disabled while the
// runtime is loading (first press) — the button label announces that.
const RunButton = styledComponent<{ busy: boolean }>(
    'button',
    {
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 6,
        cursor: ({ busy }) => (busy ? 'default' : 'pointer'),
        // Accent blue fill while idle; dimmed while busy/loading
        background: ({ busy }) => (busy ? PALETTE_BORDER : PALETTE_ACCENT),
        color: '#1a1b26',
        border: 'none',
    },
    // Standard button attributes passthrough (onClick, disabled, testid)
) as unknown as React.FC<
    { busy: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Right-aligned loader-state hint (idle/loading/ready/error from
// getPythonStatus) — muted, purely informational
const StatusHint = styledComponent('span', {
    marginLeft: 'auto',
    fontSize: 11,
    color: PALETTE_TEXT_FAINT,
});

// Output panel wrapper — the editor keeps flex:1, the panel takes a FIXED
// 180px slice below it so the editor never collapses when output appears.
const OutputPanel = styledComponent('div', {
    flexShrink: 0,
    height: 180,
    display: 'flex',
    flexDirection: 'column',
    borderTop: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_WELL,
    minHeight: 0,
});

// Panel header strip: "Output" label + error flag when the run failed
const OutputHeader = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: PALETTE_TEXT_MUTED,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    flexShrink: 0,
});

// Error flag inside the header — orange (palette warning color) so a failed
// run is visible without reading the body
const OutputErrorFlag = styledComponent('span', {
    color: PALETTE_TERTIARY,
    textTransform: 'none' as const,
    letterSpacing: 0,
    fontWeight: 600,
});

// Scrollable log body — one div per line keeps whitespace as captured
const OutputBody = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: '8px 10px',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.5,
    color: PALETTE_TEXT_BODY,
    whiteSpace: 'pre-wrap' as const,
});

// A single captured stdout line
const OutputLine = styledComponent('div', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
});

// The error line — orange so it separates from print() lines
const OutputErrorLine = styledComponent('div', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: PALETTE_TERTIARY,
});

// The final-expression value line — cyan (palette string accent) so the
// repr() result reads as a "return value" distinct from printed output
const OutputResultLine = styledComponent('div', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: '#7dcfff',
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
    // Run state: busy flag while Pyodide executes, plus the last result
    // (logs + error + result repr) rendered by the output panel. Null until
    // the first Run press — the panel only exists after a run.
    const busy = useStateHook<boolean>(false);
    const runResult = useStateHook<PyRunResult | null>(null);
    // Loader status read at render time — re-renders triggered by busy()
    // re-read it, so the hint tracks loading → ready without its own
    // subscription (status changes only around a run in this UI)
    const status = getPythonStatus();

    // Run handler: executes the CURRENT editor content through the Pyodide
    // access layer. The first press pays the ~18 MB wasm/CDN load (status
    // flips loading → ready; the hint + disabled button announce it).
    const handleRun = () => {
        if (busy()) return;
        busy(true);
        void runPython(file.content).then((result) => {
            runResult(result);
            busy(false);
        });
    };

    const result = runResult();

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
            {/* Run bar — always visible so the button does not shift layout
                when the first run adds the output panel */}
            <RunBar>
                <RunButton
                    busy={busy()}
                    disabled={busy()}
                    onClick={handleRun}
                    data-testid="python-run"
                >
                    {/* First press loads the runtime — the label announces
                        the slow path instead of a silent freeze */}
                    {busy()
                        ? getPythonStatus() === 'loading'
                            ? 'Loading Python…'
                            : 'Running…'
                        : 'Run'}
                </RunButton>
                {/* Capability hint — when the realm has no WebAssembly the
                    run would only ever fail, so say so up front */}
                <StatusHint data-testid="python-status-hint">
                    {isPythonSupported()
                        ? status === 'idle'
                            ? 'Python runtime: not loaded'
                            : `Python runtime: ${status}`
                        : 'Python unavailable (no WebAssembly)'}
                </StatusHint>
            </RunBar>
            {/* Output panel — appears after the first run and stays */}
            {result ? (
                <OutputPanel data-testid="python-output">
                    <OutputHeader>
                        Output
                        {/* Error flag — the run failed (traceback or load
                            failure) */}
                        {result.error ? (
                            <OutputErrorFlag data-testid="python-output-error-flag">
                                error
                            </OutputErrorFlag>
                        ) : null}
                    </OutputHeader>
                    <OutputBody>
                        {/* Captured stdout/stderr lines in emission order */}
                        {result.logs.map((line, index) => (
                            <OutputLine key={index}>{line}</OutputLine>
                        ))}
                        {/* Final expression's repr() — cyan "return value"
                            line, only when the snippet produced one */}
                        {result.result ? <OutputResultLine>{result.result}</OutputResultLine> : null}
                        {/* Traceback / load failure — orange, after logs */}
                        {result.error ? <OutputErrorLine>{result.error}</OutputErrorLine> : null}
                    </OutputBody>
                </OutputPanel>
            ) : null}
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
