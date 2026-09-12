import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent, useStateHook } from '@presource/react';
import {
    getScribblePlugins,
    readTextFile,
    scribbleFileStore,
    ScribbleFileProvider,
    // Palette tokens — Flexoki-dark-based warm scheme (see functions/palette.ts
    // for the full rationale + contrast table). Imported as a namespace so
    // each styled rule reads `palette.X` instead of loose magic hex strings.
    PALETTE_ACCENT,
    PALETTE_ACCENT_BRIGHT,
    PALETTE_BACKGROUND,
    PALETTE_BORDER,
    PALETTE_SCRIM,
    PALETTE_SECONDARY,
    PALETTE_SURFACE,
    PALETTE_SURFACE_HOVER,
    PALETTE_TERTIARY,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_FAINT,
    PALETTE_TEXT_MUTED,
    PALETTE_WELL,
} from '../functions';
import type { ScribbleFile } from '../functions';
// Side-effect import: the features barrel self-registers every plugin
// (see src/features/index.ts and src/functions/pluginRegistry.ts)
import '../features';

// ─── Styled shell ────────────────────────────────────────────────────────────

// Dashboard shell — dark, modern, three-area layout (header / content / footer).
// Locked to the exact viewport (100% × 100%) — the html/body/#root chain is
// zero-margin and overflow:hidden via src/app.css, so no window scrollbar.
// Layout mirrors the Formatter dashboard: LEFT sidebar column (file list),
// RIGHT pane (plugin-style content tabs).
const DashboardRoot = styledComponent('div', {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: PALETTE_BACKGROUND,
    color: PALETTE_TEXT_BODY,
    fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
});

// Header bar — modest breathing room (12px vertical / 16px horizontal),
// matching the FormatterDashboard header design (cross-reference:
// distribution/ScriptingSpaceFormatter/src/dashboards/FormatterDashboard.tsx
// HeaderBar). Content stays edge-aligned (no maxWidth centering) so the
// title hugs the left side like the Formatter shell.
const HeaderBar = styledComponent('header', {
    padding: '12px 16px',
    background: PALETTE_SURFACE,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
});

const HeaderInner = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

const HeaderTitle = styledComponent('h1', {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: PALETTE_TEXT_BRIGHT,
});

// Subtitle carries the SECONDARY teal — the drop affordance hint doubles as
// the palette's cool counterpoint
const HeaderSubtitle = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    color: PALETTE_SECONDARY,
});

// Content region between the header and footer — a non-scrolling frame split
// into two columns: the LEFT column is the sidebar slot area (file list),
// the RIGHT pane renders the plugins' content tabs for the active file. It
// is also position:relative so the dashed drop outline can be absolutely
// positioned inside it (covering only this area).
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden' as const,
});

// LEFT column — the sidebar slot area. The column owns the geometry (fixed
// 280px, divider on its right edge); sidebar plugins fill it 100% wide.
// Same geometry as the Formatter dashboard's SidebarColumn.
const SidebarColumn = styledComponent('div', {
    width: 280,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box' as const,
    background: PALETTE_SURFACE,
    borderRight: `1px solid ${PALETTE_BORDER}`,
    overflow: 'hidden' as const,
});

// RIGHT pane — renders the plugins' content contributions for the active
// file (placeholder when nothing is open / no plugin contributed). The pane
// never scrolls; full-height plugin surfaces (the editor session) fill it
// and own their internal scrolling.
const ContentPane = styledComponent('div', {
    flex: 1,
    minWidth: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
});

// Empty pane state — shown when nothing is open or no plugin contributed
const ContentPlaceholder = styledComponent('div', {
    fontSize: 14,
    color: PALETTE_TEXT_FAINT,
    textAlign: 'center' as const,
    padding: 32,
});

// ─── Plugin-style content tabs ───────────────────────────────────────────────

// When TWO OR MORE plugins contribute content for the active file, the pane
// switches to tabs: one tab per contributing plugin, in plugin sequence
// order. The tab bar sits on top; the active plugin's node fills the
// remaining space. Tab styling mirrors the Formatter dashboard's TabBar /
// TabButton family (cross-reference:
// distribution/ScriptingSpaceFormatter/src/dashboards/FormatterDashboard.tsx).
const ContentTabs = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
});

const TabBar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    padding: '8px 16px 0',
    flexShrink: 0,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_SURFACE,
});

// One tab per contributing plugin. Active tab gets the raised background +
// bright text + ORANGE top accent (the palette's primary identity color);
// the rest stay muted and clickable.
const TabButton = styledComponent<{ active: boolean }>(
    'button',
    {
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: '8px 8px 0 0',
        border: `1px solid ${PALETTE_BORDER}`,
        borderBottom: 'none' as const,
        background: ({ active }) => (active ? PALETTE_BACKGROUND : 'transparent'),
        color: ({ active }) => (active ? PALETTE_TEXT_BRIGHT : PALETTE_TEXT_MUTED),
        cursor: 'pointer',
        // Active tab carries the orange accent as a 2px top edge
        borderTop: ({ active }) => (active ? `2px solid ${PALETTE_ACCENT}` : '2px solid transparent'),
    },
    // The element only needs the style prop plus passthrough button
    // attributes (type/onClick/data-testid) — same cast pattern as the
    // Formatter dashboard's TabButton
) as unknown as React.FC<
    { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Panel below the tab bar — fills the remaining space; 100%-sized children
// (the editor session) fill it and own their internal scrolling.
const TabPanel = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
});

// Footer bar — modest breathing room (8px vertical / 16px horizontal) to
// match the FormatterDashboard footer design (cross-reference:
// distribution/ScriptingSpaceFormatter/src/dashboards/FormatterDashboard.tsx
// FooterBar); content stays edge-aligned (no maxWidth centering)
const FooterBar = styledComponent('footer', {
    padding: '8px 16px',
    background: PALETTE_SURFACE,
    borderTop: `1px solid ${PALETTE_BORDER}`,
});

const FooterInner = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: PALETTE_TEXT_MUTED,
});

// Dashed drop overlay covering ONLY the content area (absolute inside
// ContentArea — not the viewport), inset 12px. It appears ONLY while a drag
// is in progress (accent border + scrim + label) as live drop feedback —
// there is no idle-state outline: the header subtitle already tells users
// they can drop files, and a persistent dashed frame adds noise without
// information. pointerEvents: none keeps the plugin UI underneath fully
// clickable while the overlay is up.
const DropOverlay = styledComponent<{ active: boolean }>('div', {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `3px dashed ${PALETTE_ACCENT}`,
    background: PALETTE_SCRIM,
    fontSize: 20,
    fontWeight: 600,
    color: PALETTE_ACCENT_BRIGHT,
    pointerEvents: 'none' as const,
});

// ─── Dashboard composition ───────────────────────────────────────────────────

// Top-level wrapper: owns the multi-file session state and shares it with all
// plugins through the ScribbleFileProvider context (src/functions/fileStore.ts).
// Each dropped/pasted file becomes its own sidebar entry; a re-drop of the
// same file name replaces that entry's content.
export const ScribbleDashboard = React.memo(() => {
    // All open files, in sidebar order
    const files = useStateHook<ScribbleFile[]>([]);
    // Currently selected entry (a file name), null when nothing is open
    const activeFileId = useStateHook<string | null>(null);

    // Real session implementation injected into the plugin-facing context.
    // Every mutation re-creates the array/object so subscribers see updates.
    const session = {
        files: files(),
        activeFileId: activeFileId(),
        openFile: (next: ScribbleFile) => {
            const current = files();
            // Same name → replace that entry's content (re-load);
            // new name → append a new entry. Either way it becomes active.
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
            // If the closed entry was active, fall back to the most recent one
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

// Shell: renders header + (left sidebar slot area / right content pane with
// plugin-style tabs) + footer, and handles drag & drop + paste anywhere on
// the screen (handlers live on the full-viewport root element / document).
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
        // sidebar entry. Promise.all keeps the read order deterministic so
        // the last file in the drop ends up as the active one.
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

    // Global paste: a document-level `paste` listener forwards the clipboard
    // payload into the session. Pasted TEXT opens a sidebar entry named
    // "Clipboard" — re-pasting REPLACES that entry's content (the openFile
    // contract: same name → replace + re-focus), so repeated pastes never
    // spawn duplicate Clipboard entries. Pasted FILES ride clipboardData.items
    // and go through the same read pipeline as a drop. The listener is a
    // DOCUMENT-level effect rather than a React prop because paste targets
    // can be anywhere (body focus, not just inside the dashboard tree).
    // Pattern mirrors FormatterDashboard.tsx handlePaste (cross-reference:
    // distribution/ScriptingSpaceFormatter/src/dashboards/FormatterDashboard.tsx).
    React.useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return;
            // 'text/plain' covers plain AND json text — Scribble treats all
            // pasted text the same (plain-text editor)
            const text = clipboard.getData('text/plain');
            // Files ride clipboardData.items; collect every file entry
            const clipboardFiles: File[] = [];
            arrayEach(Array.from(clipboard.items), ({ value: item }) => {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) clipboardFiles.push(file);
                }
            });
            // Nothing usable in the clipboard → no session round-trip
            if (text === '' && clipboardFiles.length === 0) return;
            // 1. Text payload → "Clipboard" entry, opened FIRST so file
            //    entries opened after it win focus (files are the richer
            //    payload); a text-only paste leaves the Clipboard entry
            //    focused.
            if (text !== '') {
                store.openFile({ name: 'Clipboard', content: text });
            }
            // 2. File payloads → identical pipeline to a drop (read + open).
            //    Promise.all keeps the open order deterministic.
            Promise.all(clipboardFiles.map(readTextFile)).then((opened) => {
                arrayEach(opened, (entry) => store.openFile(entry.value));
            });
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [store]);

    // ── Plugin execution ──
    const plugins = getScribblePlugins();

    // Static slots: gather sidebar slot assignments in plugin sequence order
    const sidebarNodes: { pluginId: string; node: React.ReactNode }[] = [];
    // Content hook: run every plugin's renderFile against the ACTIVE file and
    // collect the contributions. Two or more contributions → plugin-style
    // tabs, ORDERED by the plugins' `matches` predicates: plugins that claim
    // the file (e.g. the json-viewer matching .json) come FIRST, the rest
    // keep registration order after them ([Json][Editor] for a .json file,
    // [Editor][Json] for anything else). Stable within each group — the
    // partition preserves relative registration order on both sides.
    const activeFile =
        store.files.find((entry) => entry.name === store.activeFileId) ?? null;
    const rendered: { pluginId: string; label: string; node: React.ReactNode }[] = [];
    if (activeFile) {
        const matched: typeof rendered = [];
        const unmatched: typeof rendered = [];
        arrayEach(plugins, ({ value: plugin }) => {
            if (!plugin.renderFile) return;
            const node = plugin.renderFile(activeFile);
            // null / undefined → the plugin contributes nothing for this file
            if (node !== null && node !== undefined) {
                const entry = {
                    pluginId: plugin.id,
                    label: plugin.label ?? plugin.id,
                    node,
                };
                // matches(file) === true → priority group; everything else
                // (including plugins without a matcher) falls back
                (plugin.matches?.(activeFile) ? matched : unmatched).push(entry);
            }
        });
        rendered.push(...matched, ...unmatched);
    }

    // Active tab = the selected plugin id. Falls back to the first
    // contributor whenever the selection is stale (file changed / plugin set
    // changed / initial render), so the tab state never points at a missing
    // panel.
    const selectedTab = useStateHook<string | null>(null);
    const visibleId = rendered.some((entry) => entry.pluginId === selectedTab())
        ? (selectedTab() as string)
        : rendered.length
          ? rendered[0].pluginId
          : null;

    arrayEach(plugins, ({ value: plugin }) => {
        if (plugin.slots?.sidebar) {
            sidebarNodes.push({ pluginId: plugin.id, node: plugin.slots.sidebar });
        }
    });

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
                    <HeaderSubtitle>Drop a text file anywhere!</HeaderSubtitle>
                </HeaderInner>
            </HeaderBar>
            {/* Content area: LEFT column holds the plugins' sidebar slots
                (the file list), RIGHT pane renders the plugins' content tabs
                for the active file (placeholder when nothing is open). The
                dashed outline lives INSIDE here (absolute); the page itself
                never scrolls. */}
            <ContentArea>
                <SidebarColumn data-testid="sidebar-column">
                    {sidebarNodes.map(({ pluginId, node }) => (
                        <React.Fragment key={pluginId}>{node}</React.Fragment>
                    ))}
                </SidebarColumn>
                <ContentPane data-testid="content-pane">
                    {/* Nothing open (or no contributions) → placeholder.
                        Otherwise ALWAYS render the plugin tab bar (even with
                        a single contributor) — the tabs indicate WHICH
                        plugin is showing, per the dashboard contract. Only
                        the active tab's node mounts. Tab order: matched
                        plugins first (matches → [Json][Editor] for .json),
                        then the rest in registration order. */}
                    {rendered.length === 0 ? (
                        <ContentPlaceholder data-testid="content-placeholder">
                            {store.files.length === 0
                                ? 'Drop a text file anywhere to get started.'
                                : 'No plugin rendered this file.'}
                        </ContentPlaceholder>
                    ) : (
                        <ContentTabs data-testid="content-tabs">
                            <TabBar data-testid="tab-bar">
                                {rendered.map(({ pluginId, label }) => (
                                    <TabButton
                                        key={pluginId}
                                        type="button"
                                        active={pluginId === visibleId}
                                        onClick={() => selectedTab(pluginId)}
                                        data-testid={`content-tab-${pluginId}`}
                                    >
                                        {label}
                                    </TabButton>
                                ))}
                            </TabBar>
                            {/* Only the active plugin's node is mounted */}
                            <TabPanel data-testid={`content-tab-panel-${visibleId}`}>
                                {rendered.find((entry) => entry.pluginId === visibleId)?.node}
                            </TabPanel>
                        </ContentTabs>
                    )}
                </ContentPane>
                {/* The dashed overlay is LIVE drop feedback only: it mounts
                    while a drag is in progress and unmounts on leave — no
                    idle-state outline (the header subtitle already explains
                    the drop affordance). Dropping files still works anywhere
                    on the root regardless of this overlay. */}
                {dragOver() ? (
                    <DropOverlay data-testid="drop-overlay">Drop to open a file</DropOverlay>
                ) : null}
            </ContentArea>
            <FooterBar data-testid="dashboard-footer">
                <FooterInner>
                    {/* Left side: product name with the version suffix —
                        same pattern as FormatterDashboard (left side = name +
                        version, right side = count). The version comes from
                        the compile-time __APP_VERSION__ constant injected by
                        vite.config.ts `define` (declared ambient in
                        src/vite-env.d.ts). The lib build (tsconfig.build.json)
                        never sees the constant since the footer lives in this
                        app-only dashboard file. */}
                    <span>Scribble Dashboard v{__APP_VERSION__}</span>
                    {/* Right side: loaded plugin count */}
                    <span>
                        {plugins.length} plugin{plugins.length === 1 ? '' : 's'} loaded
                    </span>
                </FooterInner>
            </FooterBar>
        </DashboardRoot>
    );
};
