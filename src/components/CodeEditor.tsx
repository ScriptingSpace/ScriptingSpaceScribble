import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { styledComponent } from '@presource/react';
import {
    PALETTE_WELL,
    PALETTE_BORDER,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_FAINT,
    // Syntax accents — Tokyo Night scale (see functions/palette.ts)
    PALETTE_ACCENT,
    PALETTE_ACCENT_BRIGHT,
    PALETTE_SECONDARY,
    PALETTE_TERTIARY,
    PALETTE_CYAN,
    PALETTE_GREEN,
    PALETTE_GOLD,
} from '../functions';

// Container frame for the CodeMirror instance. flex: 1 + minHeight: 0 let it
// stretch to the parent's remaining space when used in a full-area session
// layout. Edge-to-edge mode: NO borderRadius, NO border — when the editor is
// the pane's sole content it fills the pane flush (paddingless layout in
// TextReaderFeature), so the chrome would just inset the content area.
const EditorContainer = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    background: PALETTE_WELL,
    textAlign: 'left' as const,
    minWidth: 0,
});

// ─── Custom CodeMirror theme (Tokyo Night dark) ──────────────────────────────
// The @uiw wrapper's theme="dark" injects One Dark (blue-gray #282c34 chrome
// + violet/green/blue syntax) which clashes with the palette — so the editor
// gets its OWN theme built from the palette tokens instead (research
// cross-reference: @uiw/react-codemirror getDefaultExtensions.ts maps 'dark'
// → @codemirror/theme-one-dark).
const tokyoTheme = EditorView.theme(
    {
        // Editor well — the deep Night ground for maximum accent pop
        '&': { backgroundColor: PALETTE_WELL, color: PALETTE_TEXT_BODY },
        '.cm-content': {
            caretColor: PALETTE_TERTIARY,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        },
        '.cm-gutters': {
            backgroundColor: PALETTE_WELL,
            color: PALETTE_TEXT_FAINT,
            border: 'none',
            borderRight: `1px solid ${PALETTE_BORDER}`,
        },
        // Active line/gutter/selection — blue accent at low alpha (Tokyo
        // Night's bg_highlight family)
        '.cm-activeLine': { backgroundColor: 'rgba(122, 162, 247, 0.08)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(122, 162, 247, 0.14)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(122, 162, 247, 0.28)',
        },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: PALETTE_TERTIARY },
        '.cm-matchingBracket': {
            backgroundColor: 'rgba(187, 154, 247, 0.25)',
            outline: `1px solid ${PALETTE_SECONDARY}`,
        },
        '.cm-lineNumbers .cm-gutterElement': { color: PALETTE_TEXT_FAINT },
    },
    // dark: true — tells CodeMirror the theme is dark (affects scrollbar
    // rendering and default selection behavior)
    { dark: true },
);

// Syntax highlighting — Tokyo Night accent scale mapped onto Lezer tags
// (mirrors the official tokyonight.nvim Treesitter mapping: keywords purple,
// strings green, numbers/functions blue, types cyan, constants orange).
// Plain text (the dashboard's main payload) renders as text-body; comments
// fade to faint.
const tokyoHighlight = HighlightStyle.define([
    { tag: tags.comment, color: PALETTE_TEXT_FAINT, fontStyle: 'italic' },
    { tag: tags.keyword, color: PALETTE_SECONDARY },
    { tag: tags.string, color: PALETTE_GREEN },
    { tag: tags.number, color: PALETTE_TERTIARY },
    { tag: tags.bool, color: PALETTE_TERTIARY },
    { tag: tags.null, color: PALETTE_TERTIARY },
    { tag: [tags.atom, tags.unit], color: PALETTE_GOLD },
    { tag: tags.function(tags.variableName), color: PALETTE_ACCENT },
    { tag: tags.definition(tags.variableName), color: PALETTE_CYAN },
    { tag: tags.typeName, color: PALETTE_CYAN },
    { tag: tags.propertyName, color: PALETTE_ACCENT },
    { tag: tags.heading, color: PALETTE_TERTIARY, fontWeight: 'bold' },
    { tag: tags.link, color: PALETTE_CYAN, textDecoration: 'underline' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.invalid, color: '#db4b4b' },
]);

// Line wrapping is ALWAYS on: EditorView.lineWrapping makes long lines soft-
// wrap at the editor's width instead of overflowing, so the horizontal
// scrollbar can never appear inside the editor (the .cm-scroller's
// overflowX never engages because content never exceeds the viewport width).
// Passed via the `extensions` prop — the @uiw wrapper's basicSetup does NOT
// include lineWrapping (cross-reference: node_modules/@uiw/codemirror-
// extensions-basic-setup/esm/index.d.ts BasicSetupOptions has no such flag).
// The Tokyo Night theme + highlight style ride the same array (module-level
// constant — extensions are stateless so a stable reference avoids
// unnecessary CodeMirror reconfigurations on re-render).
const editorExtensions = [
    EditorView.lineWrapping,
    tokyoTheme,
    syntaxHighlighting(tokyoHighlight),
];

export type CodeEditorProps = {
    // Controlled document content
    value: string;
    // Called by CodeMirror on every edit — wire this to the file store
    onChange?: (value: string) => void;
    testId?: string;
    // Editor height. '100%' fills the parent (used by full-area sessions);
    // defaults to a fixed 320px card height.
    height?: string;
    // Extra CodeMirror extensions (language packs, linters, custom
    // completion sources) — appended AFTER the base extensions so language
    // config can override the generic setup. Used by the JSON plugin to turn
    // the generic editor into a structure-aware JSON editor.
    extensions?: Extension[];
};

// Code editor surface for opened files, built on CodeMirror 6 via the
// @uiw/react-codemirror wrapper (line numbers, bracket matching, history,
// syntax-aware editing out of the box — no hand-rolled textarea logic).
// theme="none" disables the wrapper's One Dark injection so ONLY the custom
// Tokyo Night theme applies (cross-reference: @uiw/react-codemirror
// esm/index.d.ts — theme accepts 'none' to skip the default extension). The
// vertical scrollbar lives INSIDE the editor window: CodeMirror's internal
// .cm-scroller handles overflow when the editor height is fixed
// (EditorContainer overflow: hidden clips the frame; the '100%' height prop
// pins the editor to the container so the scroller gets a bounded box).
// Horizontal overflow never happens — lineWrapping soft-wraps every line.
export const CodeEditor = ({ value, onChange, testId, height, extensions }: CodeEditorProps) => (
    <EditorContainer data-testid={testId ?? 'code-editor'}>
        <CodeMirror
            value={value}
            onChange={onChange}
            theme="none"
            height={height ?? '320px'}
            // Extra extensions go LAST — later extensions win precedence
            // conflicts in CodeMirror, so language-specific behavior
            // (JSON grammar, linter) reliably overrides the generic setup
            extensions={[...editorExtensions, ...(extensions ?? [])]}
            style={{ height: '100%' }}
        />
    </EditorContainer>
);
