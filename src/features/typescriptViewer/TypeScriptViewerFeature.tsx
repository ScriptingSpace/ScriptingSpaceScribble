import React from 'react';
// The @codemirror/lang-javascript pack provides the REAL JavaScript/TypeScript
// Lezer grammar (not a legacy stream mode): javascript({ typescript: true })
// gives the TS grammar (type annotations, generics, interfaces, enums), the
// plain call gives JS. Both include snippet + local-variable completion out of
// the box. autoCloseTags auto-inserts JSX close tags for .tsx/.jsx.
// Cross-reference: package.json — @codemirror/lang-javascript ^6.2.5 (its
// deps — autocomplete/language/lint/state/view/@lezer/common — are already
// hoisted in the workspace root via the other @codemirror packages).
import { javascript, autoCloseTags } from '@codemirror/lang-javascript';
import { styledComponent, useStateHook } from '@presource/react';
import { CodeEditor } from '../../components';
import {
    registerScribblePlugin,
    scribbleFileStore,
    // Run pipeline — worker facade (falls back to main-thread eval in
    // Worker-less realms like jsdom; see src/functions/jsRunner.ts)
    runJsAsync,
    // Result contract for the output panel (same shape pythonRuntime's
    // PyRunResult mirrors so both panels render uniformly)
    type JsRunResult,
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

// ─── Grammar selection ───────────────────────────────────────────────────────

// Decides which grammar the editor mounts for a file, from its extension:
// - .ts / .mts / .cts          → TypeScript grammar
// - .tsx / .jsx                → TypeScript+JSX / JS+JSX grammar (JSX support
//                                implies the TS parser handles generics in
//                                .tsx without ambiguity)
// - .js / .mjs / .cjs          → plain JavaScript grammar
// - anything else              → plain JavaScript (defensive default — the
//                                matcher below gates which files reach this
//                                plugin, but renderFile stays total so an
//                                unexpected name never crashes the editor)
// Case-insensitive via toLowerCase (e.g. `COMPONENT.TSX` still matches).
const grammarForFile = (
    name: string,
): ReturnType<typeof javascript> => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.tsx')) return javascript({ typescript: true, jsx: true });
    if (lower.endsWith('.jsx')) return javascript({ jsx: true });
    if (
        lower.endsWith('.ts') ||
        lower.endsWith('.mts') ||
        lower.endsWith('.cts')
    ) {
        return javascript({ typescript: true });
    }
    return javascript();
};

// ─── Layout ──────────────────────────────────────────────────────────────────

// Full-area session layout for the RIGHT content pane — identical flush
// geometry to TextReaderFeature's SessionLayout and YamlViewerFeature's
// SessionLayout (cross-reference: src/features/textReader/TextReaderFeature.tsx,
// src/features/yamlViewer/YamlViewerFeature.tsx): zero padding, height-locked
// to 100%, CodeMirror's internal .cm-scroller owns the vertical scrollbar.
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

// Toolbar strip between the editor and the output panel: Run button on the
// left, duration readout on the right. flexShrink 0 — it never collapses.
const RunBar = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    flexShrink: 0,
    borderTop: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_SURFACE,
});

// The Run button. Disabled while a run is in flight (busy) — re-clicking
// would otherwise spawn overlapping worker runs whose logs interleave.
const RunButton = styledComponent<{ busy: boolean }>(
    'button',
    {
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 6,
        cursor: ({ busy }) => (busy ? 'default' : 'pointer'),
        // Accent blue fill while idle; dimmed while a run is in flight
        background: ({ busy }) => (busy ? PALETTE_BORDER : PALETTE_ACCENT),
        color: '#1a1b26',
        border: 'none',
    },
    // Standard button attributes passthrough (onClick, disabled, testid)
) as unknown as React.FC<
    { busy: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Right-aligned execution time readout (from JsRunResult.durationMs)
const DurationLine = styledComponent('span', {
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

// Scrollable log body — one pre per line keeps whitespace exactly as the
// sandbox captured it
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

// A single captured log line
const OutputLine = styledComponent('div', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
});

// The error line — orange so it separates from normal [log]/[info] lines
const OutputErrorLine = styledComponent('div', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: PALETTE_TERTIARY,
});

// ─── Content plugin component ────────────────────────────────────────────────

// Renders the ACTIVE file's code editor with the JS/TS grammar picked by its
// extension. Mounted by the dashboard inside the content pane as a plugin
// tab. Edits flow back into the shared session via store.updateContent (same
// path as the generic Editor tab), so switching tabs never loses work.
//
// The grammar is picked PER FILE at render time (not a module-level constant
// like the JSON/YAML plugins): a single plugin serves .ts/.js/.tsx/.jsx and
// each needs a different parser. CodeMirror treats a changed extensions array
// as a reconfiguration — switching between a .ts and a .js file swaps the
// grammar cleanly (the doc content is re-parsed under the new grammar).
export const TypeScriptEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    // Run state: busy flag while the worker is executing, plus the last
    // result (logs + error + duration) rendered by the output panel. Null
    // until the first Run press — the panel only exists after a run.
    const busy = useStateHook<boolean>(false);
    const runResult = useStateHook<JsRunResult | null>(null);

    // Run handler: takes the CURRENT editor content (the file prop updates
    // through the store on every keystroke, so file.content is live),
    // transpiles + sandboxes it via the worker facade, stores the result.
    // isTypeScript mirrors the grammar pick: every extension EXCEPT the pure
    // JS ones (.js/.jsx/.mjs/.cjs) is treated as TypeScript for Sucrase.
    const handleRun = () => {
        if (busy()) return;
        busy(true);
        const lower = file.name.toLowerCase();
        const isTypeScript = !(
            lower.endsWith('.js') ||
            lower.endsWith('.jsx') ||
            lower.endsWith('.mjs') ||
            lower.endsWith('.cjs')
        );
        void runJsAsync(file.content, isTypeScript).then((result) => {
            runResult(result);
            busy(false);
        });
    };

    const result = runResult();

    return (
        <SessionLayout data-testid="typescript-viewer-session">
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="typescript-editor"
                    height="100%"
                    // autoCloseTags rides EVERY grammar variant: JSX close-tag
                    // auto-insertion is harmless in plain JS/TS files (it only
                    // fires on `>` after a JSX-ish opening tag)
                    extensions={[grammarForFile(file.name), autoCloseTags]}
                />
            </EditorStack>
            {/* Run bar — always visible so the button does not shift layout
                when the first run adds the output panel */}
            <RunBar>
                <RunButton
                    busy={busy()}
                    disabled={busy()}
                    onClick={handleRun}
                    data-testid="typescript-run"
                >
                    {busy() ? 'Running…' : 'Run'}
                </RunButton>
                {/* Duration readout — only after a completed run */}
                {result ? <DurationLine>{result.durationMs} ms</DurationLine> : null}
            </RunBar>
            {/* Output panel — appears after the first run and stays */}
            {result ? (
                <OutputPanel data-testid="typescript-output">
                    <OutputHeader>
                        Output
                        {/* Error flag — the run failed (transpile, sandbox
                            throw, or timeout) */}
                        {result.error ? (
                            <OutputErrorFlag data-testid="typescript-output-error-flag">
                                error
                            </OutputErrorFlag>
                        ) : null}
                    </OutputHeader>
                    <OutputBody>
                        {/* Log lines in emission order, then the error line
                            last (error after logs mirrors console behavior) */}
                        {result.logs.map((line, index) => (
                            <OutputLine key={index}>{line}</OutputLine>
                        ))}
                        {result.error ? <OutputErrorLine>{result.error}</OutputErrorLine> : null}
                    </OutputBody>
                </OutputPanel>
            ) : null}
        </SessionLayout>
    );
};

// Extension check: does the file name end in a JS/TS extension
// (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs, case-insensitive)? Pure predicate
// on the name — content is never inspected here (a broken .ts file still gets
// the Typescript tab first; the editor is the tool that fixes it).
// Edge cases: `something.tsx` matches (checked before .ts via endsWith
// exactness — '.ts' does NOT endsWith-match '.tsx'); `README.TXT` does not
// match (toLowerCase endsWith is exact); `app.mjs`/`app.cjs` match so ESM/CJS
// variants get the same editor.
export const isTypeScriptFile = (file: ScribbleFileLike): boolean => {
    const lower = file.name.toLowerCase();
    return (
        lower.endsWith('.ts') ||
        lower.endsWith('.tsx') ||
        lower.endsWith('.js') ||
        lower.endsWith('.jsx') ||
        lower.endsWith('.mts') ||
        lower.endsWith('.cts') ||
        lower.endsWith('.mjs') ||
        lower.endsWith('.cjs')
    );
};

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the editor surface for it
// (only when it is a text file — binary/image/pdf never render here, mirroring
// the renderFile guard). Renders nothing when no file is open.
export const TypeScriptViewerFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active && active.kind === 'text' ? (
        <TypeScriptEditorSurface file={active} />
    ) : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Typescript" tab for text files ONLY —
// binary/image/pdf files never render here. `matches` claims priority for
// .ts/.js family files, so the tab order for those becomes
// [Typescript][Editor] — anything else keeps registration order
// [Editor][...][Typescript]. The plugin is a SPECIALIZED subset of the
// generic "Code" (text-reader/General) editor: same CodeEditor base + same
// session updateContent path, but with the JS/TS grammar, syntax-aware
// highlighting, snippet completion and JSX auto-close on top.
registerScribblePlugin({
    id: 'typescript-viewer',
    label: 'Typescript',
    title: 'TypeScript / JavaScript Editor',
    matches: isTypeScriptFile,
    renderFile: (file) =>
        file.kind === 'text' ? <TypeScriptEditorSurface file={file} /> : null,
});

// Default export: the store-connected component (legacy import surface).
export default TypeScriptViewerFeature;
