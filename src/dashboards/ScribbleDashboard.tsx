import React from 'react';
import { arrayEach } from '@presource/core';
import {
    styledComponent,
    useStateHook,
    useReferenceHook,
} from '@presource/react';
import {
    getScribblePlugins,
    readTextFile,
    scribbleFileStore,
    ScribbleFileProvider,
    // Settings store — configuration state + JSON (de)serialization helpers
    // (see functions/settingsStore.ts). The settings screen (toggled by the
    // footer version button) reads/writes configuration through this store;
    // the configuration JSON panel round-trips it through parse/serialize.
    createDefaultScribbleSettings,
    parseScribbleSettings,
    scribbleSettingsStore,
    ScribbleSettingsProvider,
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
import type { ScribbleFile, ScribbleSettings } from '../functions';
// Side-effect import: the features barrel self-registers every plugin
// (see src/features/index.ts and src/functions/pluginRegistry.ts)
import '../features';
// Side-effect import: the settings feature self-registers as a plugin
// (see src/features/settings/SettingsFeature.tsx). It owns the "Setting"
// sidebar entry, the plugins on/off list and the configuration JSON panel.
import '../features/settings';
// Settings screen components — the configuration surface rendered while the
// settings mode is active (sidebar entry list + plugins on/off + JSON panel).
import { SettingsScreen, SettingsSidebar } from '../features/settings';

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

// ─── Tab overflow ([…] dropdown) ─────────────────────────────────────────────
// With hundreds of possible content plugins, the tab bar shows only the
// FIRST 10 tabs; everything beyond folds into a "[…]" overflow button that
// opens a dropdown listing the remaining tabs.

// MAX_VISIBLE_TABS — how many tabs render directly in the bar before the
// overflow kicks in
const MAX_VISIBLE_TABS = 10;

// Wrapper anchoring the overflow dropdown (position: relative)
const TabOverflowArea = styledComponent('div', {
    position: 'relative' as const,
    flexShrink: 0,
    display: 'flex',
});

// The "[…]" trigger — same visual family as TabButton but always muted
const TabOverflowButton = styledComponent<{ open: boolean }>(
    'button',
    {
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: '8px 8px 0 0',
        border: `1px solid ${PALETTE_BORDER}`,
        borderBottom: 'none' as const,
        background: ({ open }) => (open ? PALETTE_BACKGROUND : 'transparent'),
        color: ({ open }) => (open ? PALETTE_TEXT_BRIGHT : PALETTE_TEXT_MUTED),
        cursor: 'pointer',
        borderTop: ({ open }) => (open ? `2px solid ${PALETTE_ACCENT}` : '2px solid transparent'),
    },
    // Standard button attributes passthrough — same cast pattern as TabButton
) as unknown as React.FC<
    { open: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Dropdown panel — absolutely positioned under the trigger, right-aligned so
// it never overflows the tab bar's right edge
const TabOverflowPanel = styledComponent('div', {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 180,
    maxHeight: 320,
    overflowY: 'auto' as const,
    background: PALETTE_SURFACE,
    border: `1px solid ${PALETTE_BORDER}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
    padding: 6,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    zIndex: 20,
});

// One dropdown row — full-width clickable strip; hover raised via a `hovered`
// prop (styledComponent has no nested-selector support — same pattern as the
// Formatter's HeaderMenuRow)
const TabOverflowRow = styledComponent<{ hovered: boolean; active: boolean }>('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    cursor: 'pointer',
    userSelect: 'none' as const,
    color: ({ active, hovered }) =>
        active ? PALETTE_TEXT_BRIGHT : hovered ? PALETTE_TEXT_BODY : PALETTE_TEXT_MUTED,
    background: ({ active, hovered }) =>
        active ? PALETTE_SURFACE_HOVER : hovered ? PALETTE_BORDER : 'transparent',
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

// The footer version text is a BUTTON: clicking it toggles the settings
// screen (the user asked for "Scribble Dashboard v1.x.x on the bottom right
// should change the screen to configuration/setting format"). Styled as
// plain muted text so the footer's visual identity is unchanged, but it is
// keyboard-focusable + announced as a toggle (aria-pressed) so the
// affordance is discoverable. The `active` prop tints the text with the
// blue accent while the settings screen is open — the only visible cue that
// the button is armed.
const FooterVersionButton = styledComponent<{ active: boolean }>(
    'button',
    {
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        color: ({ active }) => (active ? PALETTE_ACCENT : PALETTE_TEXT_MUTED),
        cursor: 'pointer',
    },
    // Standard button attributes passthrough — same cast pattern as TabButton
) as unknown as React.FC<
    { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

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

// ─── Tab overflow component ──────────────────────────────────────────────────

type OverflowTab = { pluginId: string; label: string };

// The "[…]" overflow: lists the tabs that did not fit in the direct bar.
// Outside-click dismiss (document-level mousedown, armed only while open —
// same pattern as the Formatter's HeaderMenu). Rows carry per-row hover
// state; the currently ACTIVE tab is highlighted inside the dropdown.
const TabOverflow = ({
    tabs,
    activeId,
    onSelect,
}: {
    tabs: OverflowTab[];
    activeId: string | null;
    onSelect: (pluginId: string) => void;
}) => {
    // Open state of the dropdown panel
    const open = useStateHook(false);
    // Ref for the outside-click dismiss
    const areaRef = useReferenceHook<HTMLDivElement | null>(null);
    const AreaWithRef = TabOverflowArea as unknown as React.FC<
        React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }
    >;
    React.useEffect(() => {
        if (!open()) return;
        const handlePointerDown = (event: MouseEvent) => {
            const area = areaRef();
            // Click inside the trigger/panel → leave the menu alone
            if (area && area.contains(event.target as Node)) return;
            open(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open()]);

    return (
        <AreaWithRef ref={areaRef} data-testid="tab-overflow">
            <TabOverflowButton
                type="button"
                open={open()}
                aria-haspopup="menu"
                aria-expanded={open()}
                aria-label="More viewers"
                onClick={() => open(!open())}
                data-testid="tab-overflow-button"
            >
                […]
            </TabOverflowButton>
            {/* Panel mounts ONLY while open */}
            {open() ? (
                <TabOverflowPanel role="menu" data-testid="tab-overflow-panel">
                    {tabs.map((tab) => (
                        <OverflowRow
                            key={tab.pluginId}
                            tab={tab}
                            active={tab.pluginId === activeId}
                            onSelect={() => {
                                onSelect(tab.pluginId);
                                open(false);
                            }}
                        />
                    ))}
                </TabOverflowPanel>
            ) : null}
        </AreaWithRef>
    );
};

// One dropdown row with its own hover tracking — isolated per row so
// hovering one row does not re-render the whole menu
const OverflowRow = ({
    tab,
    active,
    onSelect,
}: {
    tab: OverflowTab;
    active: boolean;
    onSelect: () => void;
}) => {
    const hovered = useStateHook(false);
    const Row = TabOverflowRow as unknown as React.FC<
        { hovered: boolean; active: boolean } & React.HTMLAttributes<HTMLDivElement>
    >;
    return (
        <Row
            hovered={hovered()}
            active={active}
            role="menuitem"
            onMouseOver={() => hovered(true)}
            onMouseOut={() => hovered(false)}
            onClick={onSelect}
            data-testid={`tab-overflow-item-${tab.pluginId}`}
        >
            {tab.label}
        </Row>
    );
};

// ─── Dashboard composition ───────────────────────────────────────────────────

// Top-level wrapper: owns the multi-file session state and shares it with all
// plugins through the ScribbleFileProvider context (src/functions/fileStore.ts).
// Each dropped/pasted file becomes its own sidebar entry; a re-drop of the
// same file name replaces that entry's content. It ALSO owns the settings
// state and shares it through the ScribbleSettingsProvider context
// (src/functions/settingsStore.ts) — the settings screen (footer-button
// toggle) reads/writes configuration through it, and applySettings triggers
// the full-UI refresh (settingsRevision bump → DashboardShell remount).
export const ScribbleDashboard = React.memo(() => {
    // All open files, in sidebar order
    const files = useStateHook<ScribbleFile[]>([]);
    // Currently selected entry (a file name), null when nothing is open
    const activeFileId = useStateHook<string | null>(null);

    // ── Settings state ──
    // Registered plugin snapshot — the settings' plugin keys are always
    // materialized from this list so the Plugins on/off list and the JSON
    // never drift from the registry (unknown ids in a pasted JSON are
    // dropped by sanitizeScribbleSettings)
    const pluginIds = getScribblePlugins().map((plugin) => plugin.id);
    // Current configuration — seeded with every plugin ENABLED
    const settings = useStateHook<ScribbleSettings>(createDefaultScribbleSettings(pluginIds));
    // Revision counter — bumped on every applySettings so the shell's
    // `key` changes and React remounts the ENTIRE dashboard UI (the
    // "refresh the entire UI" contract: editors, tabs, sidebar all rebuild
    // from the new configuration)
    const settingsRevision = useStateHook<number>(0);
    // SETTINGS MODE — lifted here (ABOVE the shell key) so the mode survives
    // the apply-triggered remount: clicking Apply refreshes the UI but the
    // user stays on the settings screen (the status line stays visible).
    // The footer version button flips it on; the sidebar's "← Back to
    // Files" entry flips it off.
    const settingsMode = useStateHook<boolean>(false);

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

    // Real settings implementation injected into the plugin-facing context.
    const settingsSession = {
        settings: settings(),
        // Flip one plugin on/off — re-creates the plugins map so subscribers
        // (the settings screen) re-render with the new state
        setPluginEnabled: (pluginId: string, enabled: boolean) => {
            settings({
                ...settings(),
                plugins: {
                    ...settings().plugins,
                    [pluginId]: { enabled },
                },
            });
        },
        // Replace the WHOLE configuration + bump the revision — the shell
        // key change remounts the entire UI (full refresh)
        applySettings: (next: ScribbleSettings) => {
            settings(next);
            settingsRevision(settingsRevision() + 1);
        },
    };

    return (
        <ScribbleSettingsProvider data={settingsSession}>
            <ScribbleFileProvider data={session}>
                {/* key = revision lives on the WORKSPACE branch inside the
                    shell (not on the shell itself): every settings apply
                    remounts the workspace (fresh editors/tabs/sidebar),
                    while the shell + settings screen stay mounted so the
                    settings + file state and the apply status line all
                    survive. settingsMode + its toggle are passed down —
                    the mode is wrapper-owned state. */}
                <DashboardShell
                    settingsMode={settingsMode()}
                    onToggleSettings={settingsMode}
                    settingsRevision={settingsRevision()}
                />
            </ScribbleFileProvider>
        </ScribbleSettingsProvider>
    );
});

// Shell: renders header + (left sidebar slot area / right content pane with
// plugin-style tabs) + footer, and handles drag & drop + paste anywhere on
// the screen (handlers live on the full-viewport root element / document).
// PROPS: settingsMode + onToggleSettings are OWNED by the top-level
// ScribbleDashboard wrapper (NOT this shell) — applySettings bumps the
// revision which remounts the shell via its `key`, and the mode must
// SURVIVE that remount: otherwise clicking Apply would silently kick the
// user back to the workspace and the "Settings applied — UI refreshed."
// status would never be seen (the exact bug the apply test caught).
const DashboardShell = ({
    settingsMode,
    onToggleSettings,
    settingsRevision,
}: {
    settingsMode: boolean;
    onToggleSettings: (value: boolean) => void;
    settingsRevision: number;
}) => {
    // Local visual state — kept here (below the provider) so drag hover
    // doesn't churn the shared file context
    const dragOver = useStateHook(false);
    // SETTINGS MODE — when true the whole screen swaps to the configuration
    // format: the sidebar shows the "Setting" entry + plugins on/off list,
    // the pane shows the configuration JSON panel. Toggled by the footer
    // version button (the "Scribble Dashboard v1.x.x" text on the bottom
    // right side of the footer). The STATE lives in the top-level wrapper
    // (above the shell key) so it survives the apply-triggered remount;
    // flipping it never touches the shared file session — returning to the
    // workspace keeps every open file intact.
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
                store.openFile({ name: 'Clipboard', content: text, kind: 'text' as const, mime: 'text/plain' });
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
    // The settings store is read here so plugin on/off filtering re-renders
    // the workspace the moment a toggle flips (the settings screen lives in
    // the SAME shell tree, so the store subscription reaches both).
    const settings = scribbleSettingsStore();
    // Only ENABLED plugins execute. The registry snapshot is filtered by
    // the settings' plugins[id].enabled flag — a plugin with no settings
    // entry defaults to ON (defensive; the dashboard materializes every
    // registered id). Disabled plugins lose BOTH their sidebar slot and
    // their content-tab contribution.
    const plugins = getScribblePlugins().filter((plugin) => {
        const entry = settings.settings.plugins[plugin.id];
        return entry ? entry.enabled : true;
    });

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
                    <HeaderSubtitle>
                        {settingsMode ? 'Configuration' : 'Drop a text file anywhere!'}
                    </HeaderSubtitle>
                </HeaderInner>
            </HeaderBar>
            {/* Content area: LEFT column holds the plugins' sidebar slots
                (the file list), RIGHT pane renders the plugins' content tabs
                for the active file (placeholder when nothing is open). The
                dashed outline lives INSIDE here (absolute); the page itself
                never scrolls. In settings mode the WHOLE screen swaps to the
                configuration format: the sidebar shows the "Setting" entry +
                plugins on/off list, the pane shows the configuration JSON
                panel. The workspace render is UNMOUNTED while settings are
                open — editors/CodeMirror instances are torn down and rebuilt
                on return (a fresh full-UI mount), while the file session
                state survives in the dashboard wrapper above. The WORKSPACE
                branch carries the revision key: every settings apply
                remounts it (fresh editors/tabs) while the settings screen
                itself stays mounted — its status line ("Settings applied —
                UI refreshed.") must survive the apply to be visible. */}
            {settingsMode ? (
                <ContentArea>
                    <SidebarColumn data-testid="sidebar-column">
                        <SettingsSidebar onExit={() => onToggleSettings(false)} />
                    </SidebarColumn>
                    <ContentPane data-testid="content-pane">
                        <SettingsScreen />
                    </ContentPane>
                </ContentArea>
            ) : (
            <ContentArea key={`workspace-${settingsRevision}`}>
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
                        plugins first (matches → [Json][General] for .json),
                        then the rest in registration order. With more than
                        MAX_VISIBLE_TABS contributions the bar folds the tail
                        into the […] overflow dropdown. */}
                    {rendered.length === 0 ? (
                        <ContentPlaceholder data-testid="content-placeholder">
                            {store.files.length === 0
                                ? 'Drop a text file anywhere to get started.'
                                : 'No plugin rendered this file.'}
                        </ContentPlaceholder>
                    ) : (
                        <ContentTabs data-testid="content-tabs">
                            <TabBar data-testid="tab-bar">
                                {/* Direct tabs: first MAX_VISIBLE_TABS only */}
                                {rendered
                                    .slice(0, MAX_VISIBLE_TABS)
                                    .map(({ pluginId, label }) => (
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
                                {/* Tail beyond MAX_VISIBLE_TABS → […] dropdown */}
                                {rendered.length > MAX_VISIBLE_TABS ? (
                                    <TabOverflow
                                        tabs={rendered.slice(MAX_VISIBLE_TABS)}
                                        activeId={visibleId}
                                        onSelect={(id) => selectedTab(id)}
                                    />
                                ) : null}
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
            )}
            <FooterBar data-testid="dashboard-footer">
                <FooterInner>
                    {/* RIGHT side carries the version text as a BUTTON: the
                        user asked for "Scribble Dashboard v1.x.x on the
                        bottom right" to open the configuration/setting
                        format. Clicking it toggles the settings screen.
                        While settings are open the button renders as a
                        plain span (settings-mode-indicator) showing the
                        loaded plugin count — exiting happens via the
                        Setting sidebar entry, so the toggle can't be
                        double-armed from inside settings. The version comes
                        from the compile-time __APP_VERSION__ constant
                        injected by vite.config.ts `define` (declared
                        ambient in src/vite-env.d.ts); the lib build
                        (tsconfig.build.json) never sees the constant since
                        the footer lives in this app-only dashboard file. */}
                    {settingsMode ? (
                        <span data-testid="settings-mode-indicator">
                            {plugins.length} plugin{plugins.length === 1 ? '' : 's'} loaded
                        </span>
                    ) : (
                        <FooterVersionButton
                            type="button"
                            active={false}
                            aria-pressed={false}
                            aria-label="Open settings"
                            title="Open settings"
                            onClick={() => onToggleSettings(true)}
                            data-testid="footer-version-button"
                        >
                            Scribble Dashboard v{__APP_VERSION__}
                        </FooterVersionButton>
                    )}
                </FooterInner>
            </FooterBar>
        </DashboardRoot>
    );
};
