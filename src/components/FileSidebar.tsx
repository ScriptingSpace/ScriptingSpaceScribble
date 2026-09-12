import React from 'react';
import { styledComponent } from '@presource/react';
import {
    scribbleFileStore,
    PALETTE_ACCENT,
    PALETTE_BACKGROUND,
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_SURFACE_HOVER,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_FAINT,
    PALETTE_TEXT_MUTED,
} from '../functions';
import type { ScribbleFile } from '../functions';

// ─── Sidebar chrome ──────────────────────────────────────────────────────────

// LEFT column content rendered into the dashboard's sidebar slot
// (dashboards/ScribbleDashboard.tsx provides the 280px column geometry; this
// root fills it 100%). The list scrolls internally — the page itself never
// scrolls (viewport lock in src/app.css). The divider sits on the RIGHT edge
// of the sidebar since the content lives to its right. Layout mirrors the
// Formatter file sidebar (cross-reference:
// distribution/ScriptingSpaceFormatter/src/plugins/sidebar/FileSidebar.tsx)
// simplified to Scribble's SINGLE-select model (no multi-select / reorder).
const SidebarRoot = styledComponent('aside', {
    width: '100%',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box' as const,
    background: PALETTE_SURFACE,
    borderRight: `1px solid ${PALETTE_BORDER}`,
    overflow: 'hidden' as const,
});

// Header label carries the ORANGE accent (the sidebar's identity color)
const SidebarHeader = styledComponent('div', {
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: PALETTE_ACCENT,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    flexShrink: 0,
});

// Scrollable file list — the only element inside the sidebar that scrolls
const FileList = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

const EmptyHint = styledComponent('div', {
    padding: 16,
    fontSize: 12,
    lineHeight: 1.6,
    color: PALETTE_TEXT_FAINT,
});

// One entry per accepted file. The active entry gets the raised background +
// bright text + ORANGE left accent bar; the rest stay muted and clickable.
const FileEntry = styledComponent<{ active: boolean }>(
    'div',
    {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        fontSize: 13,
        borderRadius: 8,
        border: '1px solid transparent',
        background: ({ active }) => (active ? PALETTE_SURFACE_HOVER : 'transparent'),
        color: ({ active }) => (active ? PALETTE_TEXT_BRIGHT : PALETTE_TEXT_MUTED),
        cursor: 'pointer',
        userSelect: 'none' as const,
        transition: 'background 150ms ease, color 150ms ease',
        minWidth: 0,
        // Active entry carries the orange accent as a 2px left edge
        borderLeft: ({ active }) =>
            active ? `2px solid ${PALETTE_ACCENT}` : '2px solid transparent',
    },
    // The entry element only needs the style props plus passthrough HTML
    // attributes (same cast pattern as FileSidebar.tsx in the Formatter)
) as unknown as React.FC<
    { active: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>;

// Truncates long file names with an ellipsis so the close button never gets
// pushed out of the entry row
const FileName = styledComponent('span', {
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
});

const EntryClose = styledComponent('button', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    fontSize: 12,
    lineHeight: 1,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: PALETTE_TEXT_MUTED,
    cursor: 'pointer',
    flexShrink: 0,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// ─── Sidebar composition ─────────────────────────────────────────────────────

// Sidebar listing every file accepted by the dashboard. Files enter ONLY by
// dropping them onto the page or pasting (the dashboard's global handlers
// read them via readTextFile → openFile). Clicking an entry makes it the
// active one — the plugins' content tabs for it render in the pane to the
// sidebar's right.
export const FileSidebar = ({
    files,
    activeFileId,
    onSelect,
    onClose,
}: {
    files: ScribbleFile[];
    activeFileId: string | null;
    onSelect: (name: string) => void;
    onClose: (name: string) => void;
}) => {
    const handleKeyDown = (name: string) => (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter and Space both select the entry when keyboard-focused
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(name);
        }
    };

    return (
        <SidebarRoot data-testid="file-sidebar">
            <SidebarHeader>Files{files.length > 0 ? ` (${files.length})` : ''}</SidebarHeader>
            <FileList data-testid="file-list">
                {files.length === 0 ? (
                    <EmptyHint data-testid="file-list-empty">
                        No files yet — drop files anywhere on the page to add them here.
                    </EmptyHint>
                ) : (
                    files.map((entry) => (
                        <FileEntry
                            key={entry.name}
                            active={entry.name === activeFileId}
                            onClick={() => onSelect(entry.name)}
                            onKeyDown={handleKeyDown(entry.name)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={entry.name === activeFileId}
                            data-testid={`sidebar-file-${entry.name}`}
                        >
                            <FileName>{entry.name}</FileName>
                            <EntryClose
                                type="button"
                                aria-label={`Remove ${entry.name}`}
                                // Stop propagation so removing a file doesn't
                                // also select it
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onClose(entry.name);
                                }}
                                data-testid={`remove-file-${entry.name}`}
                            >
                                ×
                            </EntryClose>
                        </FileEntry>
                    ))
                )}
            </FileList>
        </SidebarRoot>
    );
};

// Session-wired variant rendered by the sidebar plugin: reads the shared file
// session from the provider (src/functions/fileStore.ts) so the dashboard
// shell stays a dumb layout without prop-drilling the session.
export const ConnectedFileSidebar = () => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <FileSidebar
            files={store.files}
            activeFileId={store.activeFileId}
            onSelect={store.selectFile}
            onClose={store.closeFile}
        />
    );
};
