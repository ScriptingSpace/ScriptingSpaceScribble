import React from 'react';
import { registerScribblePlugin } from '../../functions';
import type { ScribbleFileLike } from '../../functions';
import { PdfViewer } from './PdfViewer';

// ─── PDF VIEWER FEATURE ──────────────────────────────────────────────────────
// Content hook: renders the PDF viewer (pdf.js canvas surface) whenever the
// ACTIVE file is a kind 'pdf' file carrying a data URL. Everything else yields
// null so the remaining content plugins take over — exactly one kind matches
// per file, so a single contribution renders directly (no tabs).
//
// NOTE ON TYPING: ScribbleFileLike (src/functions/pluginTypes.ts) declares
// only {name, content} — the structural subset the plugin contract receives.
// The dashboard actually passes full ScribbleFile entries (kind/mime
// included, see src/functions/fileStore.ts); the kind check below reads it
// through the optional fields declared on ScribbleFileLike. No shared-file
// change was needed for this.

// Extension check: is this a PDF the viewer can decode? Pure predicate —
// true only for kind 'pdf' files whose content is a data URL (the shape
// readTextFile stores). Content is inspected here (unlike the json-viewer's
// name-only matcher) because a non-data-URL payload cannot be decoded.
export const isPdfFile = (file: ScribbleFileLike): boolean =>
    (file as { kind?: string }).kind === 'pdf' && file.content.startsWith('data:');

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Pdf" content tab for kind 'pdf' files;
// `matches` claims priority so the tab order for PDFs becomes [Pdf][General].
registerScribblePlugin({
    id: 'pdf-viewer',
    label: 'Pdf',
    title: 'PDF Viewer',
    matches: isPdfFile,
    renderFile: (file) => {
        if ((file as { kind?: string }).kind !== 'pdf') return null;
        // A data URL is required to decode the document — anything else
        // contributes NOTHING (render nothing) instead of mounting a broken
        // viewer. Defensive only: readTextFile guarantees kind 'pdf' files
        // carry a data URL (src/functions/readTextFile.ts); a consumer
        // crafting a session by hand could pass anything.
        if (!file.content.startsWith('data:')) return null;
        // Root fills the pane edge-to-edge (PdfViewer's ViewerRoot is
        // 100% × 100% flex column, overflow hidden — the scroll area
        // inside owns the only scrollbar)
        return <PdfViewer name={file.name} content={file.content} />;
    },
});
