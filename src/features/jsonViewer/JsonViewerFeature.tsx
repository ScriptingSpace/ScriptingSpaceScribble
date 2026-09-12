import React from 'react';
import { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter } from '@codemirror/lint';
import {
    autocompletion,
    completeFromList,
    startCompletion,
    type CompletionContext,
    type CompletionResult,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── JSON read view (fallback rendering for unparseable payloads) ────────────

// Full-area JSON view — fills the content pane edge-to-edge (zero padding,
// matching the Editor surface's flush layout). The pre scrolls internally in
// BOTH axes: JSON is pretty-printed with preserved indentation, so long
// lines must stay horizontally scrollable here (this is a READ view, not the
// editor — the lineWrapping-inside-editor rule applies to CodeEditor only).
const JsonView = styledComponent('pre', {
    margin: 0,
    padding: 16,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'auto' as const,
    textAlign: 'left' as const,
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    whiteSpace: 'pre' as const,
});

// Empty-state hint shown when the payload is not parseable as JSON — the
// plugin still claims the tab (the extension matched), and the EDITOR is the
// tool that fixes it; the hint only appears in the read-only view.
const InvalidHint = styledComponent('div', {
    padding: 16,
    fontSize: 13,
    lineHeight: 1.6,
});

// Pretty-prints JSON with 2-space indentation. Returns null when the content
// is not parseable JSON — the caller decides what to render instead.
const prettyJson = (content: string): string | null => {
    try {
        return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
        return null;
    }
};

// ─── Structure-aware JSON editing ────────────────────────────────────────────
// The Json tab is a REAL editor, not a static viewer: it mounts CodeMirror
// with the JSON grammar so the structure guides every keystroke:
// - json() language pack → syntax tree + indentation + bracket auto-closing
//   for {} [] "" (structure cannot silently break — brackets balance
//   themselves and invalid input is flagged inline, never auto-fixed away)
// - jsonParseLinter → live parse diagnostics underlined at the error position
// - structure-aware completion → context-aware suggestions (see below)

// JSON keyword completion list — offered inside VALUE positions
const jsonValueCompletions = completeFromList([
    { label: 'true', type: 'keyword' },
    { label: 'false', type: 'keyword' },
    { label: 'null', type: 'keyword' },
]);

// Walks the syntax tree ancestors at the cursor to classify the completion
// context. Returns:
// - 'propertyName' → inside an object, expecting "key": — suggests quoted
//   key snippets built from the SIBLING keys already present (structure
//   awareness: existing keys rank first, avoiding accidental duplicates)
// - 'value' → after a colon or in an array → suggests true/false/null
// - null → no confident context (free text) → no suggestions
const completionContextKind = (context: CompletionContext): 'propertyName' | 'value' | null => {
    const tree = syntaxTree(context.state);
    // resolveInner returns a node (never null); the walk below narrows it
    let node: SyntaxNode | null = tree.resolveInner(context.pos, -1);
    while (node) {
        if (node.name === 'Property') {
            // Inside a property: before the colon → property-name position
            return node.firstChild?.name === 'PropertyName' ? 'propertyName' : 'value';
        }
        if (node.name === 'Array' || node.name === 'JsonValue') return 'value';
        if (node.name === 'Object' || node.name === 'JsonText') break;
        node = node.parent;
    }
    return null;
};

// Collects the sibling keys already present in the enclosing object — the
// structure-aware part of the completion: existing keys are offered as
// quoted-key snippets so repeats are visible and one keystroke inserts a
// fully-formed "key": pair.
const collectSiblingKeys = (context: CompletionContext): string[] => {
    const tree = syntaxTree(context.state);
    let node: SyntaxNode | null = tree.resolveInner(context.pos, -1);
    // Climb to the enclosing Object node
    while (node && node.name !== 'Object') node = node.parent;
    if (!node) return [];
    const keys: string[] = [];
    // Object children alternate Property nodes; first child of a Property is
    // its PropertyName
    for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'Property') {
            const name = child.firstChild;
            if (name?.name === 'PropertyName') {
                // Strip the surrounding quotes from the raw text
                const raw = context.state.sliceDoc(name.from, name.to);
                keys.push(raw.replace(/^"|"$/g, ''));
            }
        }
    }
    return keys;
};

// The completion source: dispatches on the context kind. Returning null
// suppresses the popup when the position has no meaningful suggestions.
// jsonValueCompletions is a CompletionSource (may return a promise) — the
// result is awaited-compatible since CodeMirror accepts sync values too.
const jsonCompletionSource = (
    context: CompletionContext,
): CompletionResult | Promise<CompletionResult | null> | null => {
    const kind = completionContextKind(context);
    if (kind === 'value') {
        return context.matchBefore(/[\w"]/) ? jsonValueCompletions(context) : null;
    }
    if (kind === 'propertyName') {
        // Explicit trigger or typed characters required — never popup mid-word
        const typed = context.matchBefore(/"[^"]*/);
        if (!typed && !context.explicit) return null;
        // Existing sibling keys → quoted-key snippet completions ("key": )
        const keys = collectSiblingKeys(context);
        return {
            from: typed ? typed.from : context.pos,
            options: keys.map((key) => ({
                label: `"${key}"`,
                detail: 'existing key',
                type: 'property',
                apply: `"${key}": `,
            })),
        };
    }
    return null;
};

// Editor extensions for the JSON surface: grammar + linter + completion.
// keymap adds Ctrl-Space as an explicit completion trigger (the manual
// affordance; automatic popup fires while typing via autocompletion()).
const jsonEditorExtensions = [
    json(),
    linter(jsonParseLinter()),
    autocompletion({ override: [jsonCompletionSource] }),
    keymap.of([{ key: 'Mod-Space', run: startCompletion }]),
];

// Renders the active file's content as an EDITABLE, structure-aware JSON
// editor. Mounted by the dashboard inside the content pane as a plugin tab.
// Edits flow back into the shared session (same updateContent path as the
// generic Editor tab), so switching tabs never loses work.
export const JsonEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Capture the store during render — calling the accessor inside an
    // event handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <CodeEditor
            value={file.content}
            onChange={(content) => store.updateContent(file.name, content)}
            testId="json-editor"
            height="100%"
            extensions={jsonEditorExtensions}
        />
    );
};

// Renders the active file's content as pretty-printed JSON (read view) when
// it parses, or the invalid hint when it does not. Exported for tests.
export const JsonViewerSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    const pretty = prettyJson(file.content);
    return pretty !== null ? (
        <JsonView data-testid="json-view">{pretty}</JsonView>
    ) : (
        <InvalidHint data-testid="json-invalid-hint">
            This file does not contain valid JSON — the Json tab's editor can fix it.
        </InvalidHint>
    );
};

// Extension check: does the file name end in .json (case-insensitive)? Pure
// predicate on the name — content is never inspected here (a broken .json
// file still gets the Json tab first; the editor + linter fix it).
export const isJsonFile = (file: ScribbleFileLike): boolean =>
    file.name.toLowerCase().endsWith('.json');

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Json" tab — a structure-aware EDITOR (grammar,
// live parse linter, context-aware completion, bracket auto-closing) that
// keeps edits flowing into the shared session. `matches` claims priority for
// .json files, so the tab order for those becomes [Json][Editor] — anything
// else keeps registration order [Editor][Json].
registerScribblePlugin({
    id: 'json-viewer',
    label: 'Json',
    title: 'JSON Editor',
    matches: isJsonFile,
    renderFile: (file) => <JsonEditorSurface file={file} />,
});
