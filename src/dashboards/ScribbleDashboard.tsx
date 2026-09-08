import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { PluginPanel } from '../components';
import {
    getScribblePlugins,
    readTextFile,
    scribbleFileStore,
    ScribbleFileProvider,
} from '../functions';
import type { ScribbleFile } from '../functions';
// Side-effect import: the features barrel self-registers every plugin
// (see src/features/index.ts and src/functions/pluginRegistry.ts)
import '../features';

// ─── Styled shell ────────────────────────────────────────────────────────────

// Dashboard shell — dark, modern, grid of plugin panels.
// Locked to the exact viewport (100% × 100%) — the html/body/#root chain is
// zero-margin and overflow:hidden via src/app.css, so no window scrollbar.
// The plugin area below scrolls internally instead (ContentArea).
const DashboardRoot = styledComponent('div', {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
});

const HeaderBar = styledComponent('header', {
    padding: '20px 16px',
    background: '#0b1120',
    borderBottom: '1px solid #1e293b',
});

const HeaderInner = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

const HeaderTitle = styledComponent('h1', {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#f8fafc',
});

const HeaderSubtitle = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
});

// Scrollable content region under the fixed header — owns the internal
// scrollbar so the page itself never scrolls (viewport stays 100vh × 100vw)
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    width: '100%',
});

const PluginGrid = styledComponent('div', {
    display: 'grid',
    gridTemplateColumns: () => ({ xs: '1fr', md: '1fr 1fr' }),
    gap: 16,
    padding: 16,
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box' as const,
});

const EmptyState = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 32,
    fontSize: 14,
    color: '#64748b',
});

// Viewport-wide dashed outline — ALWAYS visible so every point on the screen
// reads as droppable. It intensifies (accent border + scrim + label) while a
// drag is in progress. pointerEvents: none keeps the UI underneath clickable.
const DropOutline = styledComponent<{ active: boolean }>('div', {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: ({ active }) => `3px dashed ${active ? '#38bdf8' : '#24344d'}`,
    background: ({ active }) => (active ? 'rgba(15, 23, 42, 0.75)' : 'transparent'),
    fontSize: 20,
    fontWeight: 600,
    color: '#7dd3fc',
    pointerEvents: 'none' as const,
    transition: 'border-color 150ms ease, background 150ms ease',
});

// ─── Dashboard composition ───────────────────────────────────────────────────

// Top-level wrapper: owns the open-file session state and shares it with all
// plugins through the ScribbleFileProvider context (src/functions/fileStore.ts).
export const ScribbleDashboard = React.memo(() => {
    // The currently open file session (name + live editable content)
    const file = useStateHook<ScribbleFile | null>(null);

    // Real session implementation injected into the plugin-facing context.
    // updateContent re-creates the object so subscribers see the new content.
    const session = {
        file: file(),
        openFile: (next: ScribbleFile) => file(next),
        updateContent: (content: string) => {
            const current = file();
            if (current) file({ name: current.name, content });
        },
        closeFile: () => file(null),
    };

    return (
        <ScribbleFileProvider data={session}>
            <DashboardShell />
        </ScribbleFileProvider>
    );
});

// Shell: renders header + plugin grid, and handles drag & drop anywhere on the
// screen (handlers live on the full-viewport root element).
const DashboardShell = () => {
    // Local visual state — kept here (below the provider) so drag hover
    // doesn't churn the shared file context
    const dragOver = useStateHook(false);
    // Capture the shared store during render — calling the accessor inside an
    // event handler would be an invalid hook call
    const store = scribbleFileStore();

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            // Read asynchronously, then open the file session through the
            // shared context so every plugin can react to it
            readTextFile(file).then(store.openFile);
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragOver(true);
    };

    // relatedTarget guard: ignore dragleave events fired when moving between
    // the root's own children (prevents overlay flicker)
    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        const related = event.relatedTarget as HTMLElement | null;
        if (related && event.currentTarget.contains(related)) return;
        dragOver(false);
    };

    const plugins = getScribblePlugins();

    return (
        <DashboardRoot
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            data-testid="dashboard-root"
        >
            <HeaderBar>
                <HeaderInner>
                    <HeaderTitle>Scribble Dashboard</HeaderTitle>
                    <HeaderSubtitle>
                        Drop a .txt file anywhere — it opens in the editor.
                    </HeaderSubtitle>
                </HeaderInner>
            </HeaderBar>
            {/* Content area owns the internal scrollbar — the page itself
                never scrolls, keeping the viewport locked at 100vh × 100vw */}
            <ContentArea>
                {plugins.length === 0 ? (
                    <EmptyState>No plugins registered yet.</EmptyState>
                ) : (
                    <PluginGrid>
                        {plugins.map((plugin) => (
                            <PluginPanel
                                key={plugin.id}
                                title={plugin.title}
                                description={plugin.description}
                            >
                                <plugin.Component />
                            </PluginPanel>
                        ))}
                    </PluginGrid>
                )}
            </ContentArea>
            {/* Viewport-wide dashed outline: always visible (drop anywhere),
                with scrim + label while a drag is active */}
            <DropOutline active={dragOver()} data-testid="drop-outline">
                {dragOver() ? 'Drop to open a file' : null}
            </DropOutline>
        </DashboardRoot>
    );
};
