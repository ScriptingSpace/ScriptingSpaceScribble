import React from 'react';
// StreamLanguage wraps a legacy (CodeMirror 5-era) stream parser as a
// CodeMirror 6 extension; the yaml mode lives in @codemirror/legacy-modes
// (cross-reference: package.json — @codemirror/legacy-modes 6.5.4 is the
// same source the JSON plugin's lang-json sits on top of for grammar work).
import { StreamLanguage } from '@codemirror/language';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
// The `yaml` package is the PARSE validator (a different concern from the
// editor grammar): it decides whether the document is valid YAML so the
// banner can report it. Cross-reference: package.json — yaml 2.9.1.
import { parse } from 'yaml';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
import type { ScribbleFileLike } from '../../functions';
// Palette tokens — Tokyo Night Storm (see functions/palette.ts). The gold
// accent carries the error banner; the neutral tokens keep the banner slim
// and grounded against the editor well below it.
import {
    PALETTE_TERTIARY,
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_TEXT_BODY,
} from '../../functions';

// ─── YAML grammar for the editor ─────────────────────────────────────────────
// Module-level constant: extensions are stateless, so a stable reference
// avoids unnecessary CodeMirror reconfigurations on re-render (same rationale
// as CodeEditor.tsx's editorExtensions). StreamLanguage.define(yaml) gives
// the editor YAML-aware token highlighting (keys, strings, comments, anchors)
// — it does NOT validate; validation is the banner's job via `parse` below.
const yamlEditorExtensions = [StreamLanguage.define(yaml)];

// ─── Parse validation ────────────────────────────────────────────────────────
// try/catch around yaml.parse — the package throws YAMLParseError on invalid
// documents. Only the SHORT message surfaces in the banner (error.message);
// the full stack stays out of the UI. Returns the message string on failure,
// null on success — the caller renders the banner only when non-null.
// Edge cases: empty content parses as null (valid YAML) → no banner; a
// mid-typing document like `a: [1, 2` throws (unbalanced flow sequence) →
// banner shows but the editor STAYS MOUNTED so the user can fix the
// structure (parse errors must never block editing).
const yamlParseError = (content: string): string | null => {
    try {
        parse(content);
        return null;
    } catch (error) {
        // Defensive: anything throwable, not just YAMLParseError
        return error instanceof Error ? error.message : String(error);
    }
};

// ─── Layout ──────────────────────────────────────────────────────────────────

// Root fills the content pane edge-to-edge: height/width 100%, flex column,
// overflow hidden — the CodeEditor owns internal scrolling (its .cm-scroller
// handles overflow; see CodeEditor.tsx and TextReaderFeature.tsx's
// SessionLayout, which follows the identical flush layout).
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

// Slim error banner ABOVE the editor. Gold (PALETTE_TERTIARY) left accent bar
// signals the parse failure without shouting a full-width alarm; the surface
// token grounds it against the well. flexShrink 0 keeps the banner from being
// squeezed when the pane is short — the editor (flex: 1) absorbs the rest.
const ErrorBanner = styledComponent('div', {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: PALETTE_SURFACE,
    borderLeft: `3px solid ${PALETTE_TERTIARY}`,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    color: PALETTE_TEXT_BODY,
    fontSize: 12,
    lineHeight: 1.4,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
});

// The editor fills ALL remaining height below the banner (when present).
// minHeight: 0 lets it shrink inside the flex column instead of overflowing
// (same EditorStack pattern as TextReaderFeature.tsx).
const EditorStack = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
});

// ─── Content plugin component ────────────────────────────────────────────────

// Renders the ACTIVE file's YAML surface: optional parse-error banner on top,
// syntax-highlighted EDITABLE CodeMirror below. Mounted by the dashboard as
// the plugin tab's content. Edits flow back into the shared session via
// store.updateContent (same path as TextReaderFeature's TextEditorSurface),
// so switching tabs never loses work. The banner NEVER unmounts the editor —
// a broken document is exactly when the user needs it most.
export const YamlEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    // Recomputed per render: the store pushes new content on every edit, so
    // each keystroke re-validates (cheap for typical file sizes) and the
    // banner clears the moment the document becomes valid again.
    const parseError = yamlParseError(file.content);
    return (
        <SessionLayout data-testid="yaml-viewer-session">
            {/* Banner ONLY on error — 'Valid YAML' on every keystroke is
                noise; silence IS the success state */}
            {parseError !== null ? (
                <ErrorBanner data-testid="yaml-error-banner" title={parseError}>
                    {parseError}
                </ErrorBanner>
            ) : null}
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="yaml-editor"
                    height="100%"
                    extensions={yamlEditorExtensions}
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Extension check: does the file name end in .yaml or .yml (case-insensitive)?
// Pure predicate on the name — content is never inspected here (a broken
// .yaml file still gets the Yaml tab first; the editor + banner fix it).
// Edge case: names like `something.ymlar` do NOT match (endsWith is exact);
// `DEPLOY.YML` matches via toLowerCase.
export const isYamlFile = (file: ScribbleFileLike): boolean =>
    file.name.toLowerCase().endsWith('.yaml') || file.name.toLowerCase().endsWith('.yml');

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the YAML surface for it
// (only when it is a text file — binary/image/pdf never render here, mirroring
// the renderFile guard). Renders nothing when no file is open.
export const YamlViewerFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active && active.kind === 'text' ? <YamlEditorSurface file={active} /> : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Yaml" tab for text files ONLY — binary/image/
// pdf files never render here (their kind routes them to other plugins or
// the notice path). `matches` claims priority for .yaml/.yml files, so the
// tab order for those becomes [Yaml][Editor] — anything else keeps
// registration order [Editor][Yaml].
registerScribblePlugin({
    id: 'yaml-viewer',
    label: 'Yaml',
    title: 'YAML Viewer',
    matches: isYamlFile,
    renderFile: (file) => (file.kind === 'text' ? <YamlEditorSurface file={file} /> : null),
});

// Default export: the store-connected component (legacy import surface).
export default YamlEditorSurface;
