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
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
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
