import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent, useStateHook } from '@presource/react';
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

// Dashboard shell — dark, modern, three-area layout (header / content / footer).
// Locked to the exact viewport (100% × 100%) — the html/body/#root chain is
// zero-margin and overflow:hidden via src/app.css, so no window scrollbar.
// Plugin surfaces render directly in the content area (no panel chrome).
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

// Content region between the header and footer. It is a positioned,
// non-scrolling frame: the dashed drop outline is absolutely positioned
// inside it (covering only this area), and an inner ScrollRegion owns the
// internal scrollbar so the page itself never scrolls (100vh × 100vw lock).
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
    width: '100%',
    overflow: 'hidden' as const,
});

// Inner scroll container — the only element that scrolls
const ScrollRegion = styledComponent('div', {
    height: '100%',
    width: '100%',
    overflowY: 'auto' as const,
});

// Full-area surface each plugin renders into — no card chrome; plugins own
// their layout and fill (or not fill) this region as they see fit
const PluginSurface = styledComponent('div', {
    minHeight: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
});

const EmptyState = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 32,
    fontSize: 14,
    color: '#64748b',
});

// Footer bar — third page area (header / content / footer)
const FooterBar = styledComponent('footer', {
    padding: '10px 16px',
    background: '#0b1120',
    borderTop: '1px solid #1e293b',
});

const FooterInner = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: '#64748b',
});

// Dashed drop outline covering ONLY the content area (absolute inside
// ContentArea — not the viewport), inset 12px so it floats with breathing
// room from the header/footer borders and window edges. ALWAYS visible so
// the whole content region reads as droppable. It intensifies (accent
// border + scrim + label) while a drag is in progress. pointerEvents: none
// keeps the plugin UI underneath fully clickable.
const DropOutline = styledComponent<{ active: boolean }>('div', {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 10,
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

// Top-level wrapper: owns the multi-file session state and shares it with all
// plugins through the ScribbleFileProvider context (src/functions/fileStore.ts).
// Each dropped file becomes its own tab; a re-drop of the same file name
// replaces that tab's content.
export const ScribbleDashboard = React.memo(() => {
    // All open files, in tab order
    const files = useStateHook<ScribbleFile[]>([]);
    // Currently selected tab (a file name), null when nothing is open
    const activeFileId = useStateHook<string | null>(null);

    // Real session implementation injected into the plugin-facing context.
    // Every mutation re-creates the array/object so subscribers see updates.
    const session = {
        files: files(),
        activeFileId: activeFileId(),
        openFile: (next: ScribbleFile) => {
            const current = files();
            // Same name → replace that tab's content (re-load);
            // new name → append a new tab. Either way it becomes active.
            files(
                current.some((entry) => entry.name === next.name)
                    ? current.map((entry) => (entry.name === next.name ? next : entry))
                    : [...current, next],
            );
            activeFileId(next.name);
        },
        selectFile: (name: string) => activeFileId(name),
        updateContent: (name: string, content: string) => {
            files(files().map((entry) => (entry.name === name ? { ...entry, content } : entry)));
        },
        closeFile: (name: string) => {
            const remaining = files().filter((entry) => entry.name !== name);
            files(remaining);
            // If the closed tab was active, fall back to the most recent tab
            if (activeFileId() === name) {
                activeFileId(remaining.length ? remaining[remaining.length - 1].name : null);
            }
        },
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
        // Load EVERY dropped file, not just the first — each becomes its own
        // tab. Promise.all keeps the read order deterministic so the last
        // file in the drop ends up as the active tab.
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        Promise.all(dropped.map(readTextFile)).then((opened) => {
            arrayEach(opened, (entry) => store.openFile(entry.value));
        });
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
            {/* Content area: header / content / footer — the dashed outline
                lives INSIDE here (absolute), the ScrollRegion owns the
                internal scrollbar, the page itself never scrolls. Plugin
                surfaces render directly, no panel chrome. */}
            <ContentArea>
                <ScrollRegion>
                    {plugins.length === 0 ? (
                        <EmptyState>No plugins registered yet.</EmptyState>
                    ) : (
                        plugins.map((plugin) => (
                            <PluginSurface key={plugin.id}>
                                <plugin.Component />
                            </PluginSurface>
                        ))
                    )}
                </ScrollRegion>
                {/* The dashed outline is the empty-state drop affordance: it
                    only shows while NO file is open. Once files are open the
                    tabs + editor take over and the outline disappears
                    (dropping more files still works — the root handles it). */}
                {store.files.length === 0 ? (
                    <DropOutline active={dragOver()} data-testid="drop-outline">
                        {dragOver() ? 'Drop to open a file' : null}
                    </DropOutline>
                ) : null}
            </ContentArea>
            <FooterBar data-testid="dashboard-footer">
                <FooterInner>
                    <span>Scribble Dashboard</span>
                    {/* Right side: loaded plugin count + the package version
                        (compile-time __APP_VERSION__ injected by vite.config.ts
                        `define` — declared ambient in src/vite-env.d.ts). The
                        version shows on the GitHub Pages deploy so users can
                        see which release they are running. The lib build
                        (tsconfig.build.json) never sees the constant since the
                        footer lives in this app-only dashboard file. */}
                    <span>
                        {plugins.length} plugin{plugins.length === 1 ? '' : 's'} loaded ·
                        v{__APP_VERSION__}
                    </span>
                </FooterInner>
            </FooterBar>
        </DashboardRoot>
    );
};
