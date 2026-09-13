import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { styledComponent } from '@presource/react';
import { registerScribblePlugin } from '../../functions';
import {
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_MUTED,
    PALETTE_BORDER,
    PALETTE_WELL,
} from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── Markdown read view ──────────────────────────────────────────────────────

// Full-area markdown surface — fills the content pane edge-to-edge. The
// TabPanel it mounts in (cross-reference: src/dashboards/ScribbleDashboard.tsx
// TabPanel — height 100%, flex column, overflow hidden) gives us a fixed
// frame; the surface owns the VERTICAL scrollbar (markdown is long-form, so
// the scroll container must be this div, not the dashboard pane).
//
// Styling note: styledComponent input does NOT support nested element
// selectors (cross-reference: the comment in
// distribution/ScriptingSpaceFormatter/src/dashboards/FormatterDashboard.tsx
// HeaderMenuRow), so the wrapper carries only FLAT typography styles (color,
// fontSize, lineHeight, padding, maxWidth) and the browser's default element
// styles handle h1/h2/p/code/pre/blockquote/table inside the sanitized HTML.
// Per-element palette overrides (accent headings, secondary links) are
// deliberately skipped to keep this simple and type-safe.
const MarkdownView = styledComponent('div', {
    height: '100%',
    width: '100%',
    boxSizing: 'border-box' as const,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: 24,
    // Long-form reading measure — capped width keeps line lengths sane on
    // very wide panes; margin auto centers the column
    maxWidth: 860,
    margin: '0 auto',
    color: PALETTE_TEXT_BODY,
    fontSize: 15,
    lineHeight: 1.7,
    // Dark well ground so rendered markdown reads like the editor well,
    // not the raised sidebar surfaces
    background: PALETTE_WELL,
    // Hairline frame matching the dashboard's border tokens
    border: `1px solid ${PALETTE_BORDER}`,
});

// ─── Markdown → sanitized HTML ───────────────────────────────────────────────

// Renders markdown to an HTML string:
// 1. marked.parse with gfm (tables/strikethrough/task lists) + breaks
//    (single newlines → <br>, GitHub comment-style rendering). marked.parse
//    returns string | Promise<string> depending on the async option — with
//    NO async option passed the default synchronous call returns a string,
//    hence the `as string` cast.
// 2. DOMPurify.sanitize strips active content (script tags, event handler
//    attributes like onerror, javascript: URLs) — the output is rendered via
//    dangerouslySetInnerHTML, so this sanitize step is the security boundary.
// Palette note: the Tokyo Night tokens (PALETTE_TEXT_BODY/PALETTE_WELL/
// PALETTE_BORDER) style the wrapper above; inner elements keep browser
// defaults (see the styledComponent nested-selector note).
const renderMarkdown = (text: string): string =>
    DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }) as string);

// ─── Content plugin component ────────────────────────────────────────────────

// Renders the file's markdown content as sanitized HTML. Mounted by the
// dashboard inside the content pane as a plugin tab (renderFile output).
// The dangerouslySetInnerHTML payload is ALWAYS the DOMPurify-sanitized
// output of marked — never raw file content (XSS boundary, see tests:
// MarkdownViewerFeature.test.tsx).
export const MarkdownViewerSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    return (
        <MarkdownView
            data-testid="markdown-view"
            // Sanitized once per render — marked is deterministic for a given
            // input, so this stays a pure render (plugin contract requirement)
            dangerouslySetInnerHTML={{ __html: renderMarkdown(file.content) }}
        />
    );
};

// ─── Plugin registration ─────────────────────────────────────────────────────

// Extension matcher: does the file name end in a markdown extension
// (.md / .markdown / .mdown / .mkdn)? Case-insensitive, pure predicate on
// the name — content is never inspected. Used by the dashboard to ORDER the
// content tabs: matching files get the Markdown tab FIRST, e.g.
// [Markdown][Editor][Json] (cross-reference: pluginTypes.ts matches docs).
// The $ anchor (no trailing-content match) is why 'notes.md.bak' fails.
export const isMarkdownFile = (file: ScribbleFileLike): boolean =>
    /\.(md|markdown|mdown|mkdn)$/i.test(file.name);

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Markdown" tab — a read-only rendered view.
// EDGE CASE: renderFile receives ScribbleFileLike {name, content}, but the
// dashboard passes the full ScribbleFile which carries kind/mime
// (cross-reference: src/functions/fileStore.ts). Binary / image / pdf files
// never render markdown: image/pdf content is a data URL and binary is a raw
// dump — parsing either as markdown is meaningless. Narrow on the kind field
// when present; 'text' is the only renderable kind.
registerScribblePlugin({
    id: 'markdown-viewer',
    label: 'Markdown',
    title: 'Markdown Viewer',
    matches: isMarkdownFile,
    renderFile: (file) => {
        // Kind guard — see the EDGE CASE note above. When kind is absent
        // (bare ScribbleFileLike from a test/legacy caller) we render; the
        // sanitizer still guarantees safe HTML either way.
        const kind = (file as ScribbleFileLike & { kind?: string }).kind;
        if (kind !== undefined && kind !== 'text') return null;
        return <MarkdownViewerSurface file={file} />;
    },
});
