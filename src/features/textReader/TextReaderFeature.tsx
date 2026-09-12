import React from 'react';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── Session layout ──────────────────────────────────────────────────────────

// Full-area session layout for the RIGHT content pane: plugin tab strip on
// top, editor fills the rest. ZERO padding/margin — the editor takes the
// pane's FULL size edge-to-edge (the tab strip sits directly on the pane's
// top edge, the editor frame touches the sidebar divider, bottom and right
// edges). The layout is height-locked to 100% (the ContentPane in
// ScribbleDashboard.tsx no longer grows), so the editor gets a FIXED height
// and CodeMirror's internal .cm-scroller owns the vertical scrollbar INSIDE
// the editor window — the dashboard never scrolls for editor content.
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

// Renders the ACTIVE file's editor. Mounted by the dashboard inside the
// content pane — the TAB STRIP above it is owned by the DASHBOARD (plugin
// tabs, one per renderFile contributor), so this component no longer renders
// its own per-file tabs: files live in the LEFT sidebar now (sidebar feature).
export const TextEditorSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Shared multi-file session — owned by the dashboard, consumed here.
    // Edits flow back into the session, keyed by the file's name.
    const store = scribbleFileStore();

    return (
        <SessionLayout data-testid="text-reader-session">
            <EditorStack>
                <CodeEditor
                    value={file.content}
                    onChange={(content) => store.updateContent(file.name, content)}
                    testId="text-reader-editor"
                    height="100%"
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Store-connected wrapper kept for direct-consumption / tests: resolves the
// ACTIVE file from the shared session and renders the editor surface for it.
// Renders nothing when no file is open (the dashed content-area outline on
// the dashboard is the drop affordance in that state).
export const TextReaderFeature: React.FC = () => {
    const store = scribbleFileStore();
    const active =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    return active ? <TextEditorSurface file={active} /> : null;
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes ONE content tab ("Editor") for the active file —
// the dashboard renders it directly when it is the only contributor, or as a
// plugin-style tab once other plugins contribute for the same file.
registerScribblePlugin({
    id: 'text-reader',
    label: 'General',
    title: 'Text File Reader',
    renderFile: (file) => <TextEditorSurface file={file} />,
});

// Default export: the store-connected component (legacy import surface).
export default TextReaderFeature;
