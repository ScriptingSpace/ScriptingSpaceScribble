import React from 'react';
import { styledComponent, useStateHook, useReferenceHook } from '@presource/react';
import { CodeEditor } from '../../components';
import {
    getScribblePlugins,
    parseScribbleSettings,
    registerScribblePlugin,
    scribbleSettingsStore,
    serializeScribbleSettings,
    // Palette tokens — Tokyo Night Storm (see functions/palette.ts for the
    // full rationale + contrast table)
    PALETTE_ACCENT,
    PALETTE_BORDER,
    PALETTE_GREEN,
    PALETTE_SURFACE,
    PALETTE_SURFACE_HOVER,
    PALETTE_TERTIARY,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_MUTED,
} from '../../functions';

// ─── Settings sidebar (LEFT column while settings mode is active) ────────────

// Same chrome family as the file sidebar (cross-reference:
// src/components/FileSidebar.tsx SidebarRoot/SidebarHeader/FileList) — the
// settings sidebar replaces the file list while the settings screen is open,
// so the LEFT column keeps its 280px geometry + divider from the dashboard's
// SidebarColumn (ScribbleDashboard.tsx).
const SettingsSidebarRoot = styledComponent('aside', {
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

// Header label carries the ORANGE accent — same treatment as the file
// sidebar's "Files" header, but reading "Setting" (the user asked for the
// "Files" part to change to "Setting" while configuring)
const SettingsSidebarHeader = styledComponent('div', {
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: PALETTE_TERTIARY,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    flexShrink: 0,
});

// Scrollable entry list — the only element inside the sidebar that scrolls
const SettingsList = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

// One entry per settings section. The active entry gets the raised
// background + bright text + orange left accent bar — identical geometry to
// the file sidebar's FileEntry so the two sidebars feel like the same app.
const SettingsEntry = styledComponent<{ active: boolean }>(
    'div',
    {
        display: 'flex',
        alignItems: 'center',
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
        borderLeft: ({ active }) =>
            active ? `2px solid ${PALETTE_TERTIARY}` : '2px solid transparent',
    },
    // Style props + passthrough HTML attributes — same cast pattern as
    // FileSidebar.tsx FileEntry
) as unknown as React.FC<
    { active: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>;

// The "Setting" back entry — clicking it exits the settings screen back to
// the workspace. Muted styling so it reads as a navigation control rather
// than a section entry.
const SettingBackEntry = styledComponent('div', {
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid transparent',
    color: PALETTE_TEXT_MUTED,
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background 150ms ease, color 150ms ease',
});

// ─── Settings pane (RIGHT column while settings mode is active) ──────────────

const SettingsPane = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
});

const SettingsPaneHeader = styledComponent('div', {
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: PALETTE_ACCENT,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
    flexShrink: 0,
});

const SettingsBody = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
});

// Section wrapper for the plugins list
const PluginSection = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
});

const PluginSectionTitle = styledComponent('div', {
    fontSize: 13,
    fontWeight: 600,
    color: PALETTE_TEXT_BODY,
});

// One row per registered plugin: label + on/off toggle button. The toggle
// is a BUTTON (not a checkbox input) so it renders identically across
// browsers and keeps the Tokyo Night styling; aria-pressed carries the
// state for assistive tech + tests.
const PluginRow = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    fontSize: 13,
    borderRadius: 8,
    border: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_SURFACE,
});

// Plugin label — bright while enabled, muted while off (a second visual
// channel next to the toggle pill)
const PluginId = styledComponent<{ enabled: boolean }>(
    'span',
    {
        overflow: 'hidden' as const,
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        color: ({ enabled }) => (enabled ? PALETTE_TEXT_BRIGHT : PALETTE_TEXT_MUTED),
    },
    // Style prop + passthrough span attributes
) as unknown as React.FC<
    { enabled: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>
>;

const PluginToggle = styledComponent<{ on: boolean }>(
    'button',
    {
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 6,
        cursor: 'pointer',
        minWidth: 64,
        // ON → green pill (the palette's success green at low alpha);
        // OFF → muted ghost
        background: ({ on }) => (on ? 'rgba(158, 206, 106, 0.15)' : 'transparent'),
        color: ({ on }) => (on ? PALETTE_GREEN : PALETTE_TEXT_MUTED),
        border: ({ on }) => `1px solid ${on ? PALETTE_GREEN : PALETTE_BORDER}`,
    },
    // Standard button attributes passthrough
) as unknown as React.FC<
    { on: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// ─── Configuration JSON panel (the JSON "tab", last on the sidebar list) ─────

// The JSON editor card. Uses the shared CodeEditor component (CodeMirror 6
// with the Tokyo Night theme) so pasting/typing JSON gets the same editing
// experience as the workspace editors. The Apply button below commits the
// text back into the settings store.
const JsonSection = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flex: 1,
    minHeight: 240,
});

const JsonEditorFrame = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${PALETTE_BORDER}`,
    borderRadius: 8,
    overflow: 'hidden' as const,
    background: PALETTE_SURFACE,
});

const JsonFooter = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
});

const ApplyButton = styledComponent('button', {
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: 'none',
    background: PALETTE_ACCENT,
    color: '#1a1b26',
    cursor: 'pointer',
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Apply feedback: green when the JSON was valid + applied, orange when the
// parse failed (the palette's warning color)
const StatusLine = styledComponent<{ ok: boolean }>(
    'div',
    {
        fontSize: 12,
        color: ({ ok }) => (ok ? PALETTE_GREEN : PALETTE_TERTIARY),
    },
) as unknown as React.FC<
    { ok: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>;

// ─── Components ──────────────────────────────────────────────────────────────

// The LEFT sidebar while settings mode is active: the "Setting" header + the
// section list (Plugins, then Configuration JSON — last on the list per the
// request). The back entry on top returns to the workspace (file list).
export const SettingsSidebar: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    // Which settings entry is highlighted (drives the accent bar; both
    // sections are always rendered in the pane, so this is highlight-only)
    const active = useStateHook<string | null>('plugins');
    return (
        <SettingsSidebarRoot data-testid="settings-sidebar">
            <SettingsSidebarHeader>Setting</SettingsSidebarHeader>
            <SettingsList data-testid="settings-list">
                {/* Back entry — returns to the workspace (file list) */}
                <SettingBackEntry
                    role="button"
                    tabIndex={0}
                    aria-label="Back to files"
                    onClick={onExit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onExit();
                        }
                    }}
                    data-testid="settings-back-entry"
                >
                    ← Back to Files
                </SettingBackEntry>
                {/* Plugins section entry — the on/off list */}
                <SettingsEntry
                    active={active() === 'plugins'}
                    onClick={() => active('plugins')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active() === 'plugins'}
                    data-testid="settings-entry-plugins"
                >
                    Plugins
                </SettingsEntry>
                {/* Configuration JSON entry — LAST on the list per the
                    request ("another tab on the side bar, last on the
                    list") */}
                <SettingsEntry
                    active={active() === 'json'}
                    onClick={() => active('json')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active() === 'json'}
                    data-testid="settings-entry-json"
                >
                    Configuration JSON
                </SettingsEntry>
            </SettingsList>
        </SettingsSidebarRoot>
    );
};

// The RIGHT pane while settings mode is active: the Plugins on/off list on
// top and the configuration JSON panel below (the JSON is the last item on
// the sidebar list, so it renders last in the pane too).
export const SettingsScreen: React.FC = () => {
    // Capture the store during render — calling the accessor inside an
    // event handler would be an invalid hook call
    const settings = scribbleSettingsStore();
    // Registered plugin snapshot — the settings store's plugin keys are
    // always materialized from this list (createDefaultScribbleSettings in
    // the dashboard), so the list and the store stay in sync
    const plugins = getScribblePlugins();
    // Draft JSON text + apply status. The draft FOLLOWS the store until the
    // user edits it manually (then Apply is the only writer — a toggle
    // while a manual draft is pending would otherwise silently discard the
    // user's typing). `dirty` marks a manual edit; `lastSerialized` tracks
    // the store snapshot the draft was last synced from so a store change
    // (toggle flip) re-serializes into the draft.
    const lastSerialized = useReferenceHook<string>(
        serializeScribbleSettings(settings.settings),
    );
    const dirty = useStateHook<boolean>(false);
    const draft = useStateHook<string>(serializeScribbleSettings(settings.settings));
    const status = useStateHook<string | null>(null);
    const statusOk = useStateHook<boolean>(false);

    // Store → draft sync: whenever the settings store changes (a toggle
    // flip) and the draft is not dirty, re-serialize the new settings into
    // the draft. The dependency on serializeScribbleSettings(settings.settings)
    // re-evaluates on every render — the string comparison keeps the draft
    // state update a no-op when nothing changed (avoids a render loop).
    const serialized = serializeScribbleSettings(settings.settings);
    if (!dirty() && serialized !== lastSerialized()) {
        lastSerialized(serialized);
        draft(serialized);
    }

    // Apply handler: parse → sanitize → commit. Invalid JSON surfaces an
    // inline error (tertiary/orange) instead of touching the store — the
    // previous settings stay in effect.
    const handleApply = () => {
        const parsed = parseScribbleSettings(draft(), plugins.map((plugin) => plugin.id));
        if (parsed === null) {
            status('Invalid JSON — nothing was applied.');
            statusOk(false);
            return;
        }
        settings.applySettings(parsed);
        status('Settings applied — UI refreshed.');
        statusOk(true);
    };

    return (
        <SettingsPane data-testid="settings-screen">
            <SettingsPaneHeader>Settings</SettingsPaneHeader>
            <SettingsBody>
                {/* Plugins on/off list — every registered plugin, in
                    registration order, with its on/off toggle */}
                <PluginSection data-testid="settings-plugins-section">
                    <PluginSectionTitle>Plugins</PluginSectionTitle>
                    {plugins.map((plugin) => {
                        // Default ENABLED when the store has no entry yet
                        // (defensive — the dashboard materializes every id,
                        // so this only triggers for plugins registered
                        // after the last settings reset)
                        const entry = settings.settings.plugins[plugin.id];
                        const enabled = entry ? entry.enabled : true;
                        return (
                            <PluginRow key={plugin.id} data-testid={`settings-plugin-${plugin.id}`}>
                                <PluginId enabled={enabled}>{plugin.label ?? plugin.id}</PluginId>
                                <PluginToggle
                                    type="button"
                                    on={enabled}
                                    aria-pressed={enabled}
                                    aria-label={`${enabled ? 'Disable' : 'Enable'} plugin ${plugin.label ?? plugin.id}`}
                                    onClick={() => settings.setPluginEnabled(plugin.id, !enabled)}
                                    data-testid={`settings-plugin-toggle-${plugin.id}`}
                                >
                                    {enabled ? 'On' : 'Off'}
                                </PluginToggle>
                            </PluginRow>
                        );
                    })}
                </PluginSection>
                {/* Configuration JSON — paste a new JSON here and hit
                    Apply to replace every setting and refresh the UI */}
                <JsonSection data-testid="settings-json-section">
                    <PluginSectionTitle>Configuration JSON</PluginSectionTitle>
                    <JsonEditorFrame>
                        <CodeEditor
                            value={draft()}
                            onChange={(next) => {
                                draft(next);
                                // A manual edit marks the draft dirty — the
                                // store→draft sync above stops following
                                // the toggles until Apply commits (or the
                                // panel remounts)
                                dirty(true);
                                // Editing clears the previous apply status
                                status(null);
                            }}
                            testId="settings-json-editor"
                            height="100%"
                        />
                    </JsonEditorFrame>
                    <JsonFooter>
                        <ApplyButton
                            type="button"
                            onClick={handleApply}
                            data-testid="settings-json-apply"
                        >
                            Apply
                        </ApplyButton>
                        {status() ? (
                            <StatusLine ok={statusOk()} data-testid="settings-json-status">
                                {status()}
                            </StatusLine>
                        ) : null}
                    </JsonFooter>
                </JsonSection>
            </SettingsBody>
        </SettingsPane>
    );
};

// Plug-and-play registration: importing this module (the dashboard does a
// side-effect import) plugs the settings feature into the registry. It has
// NO sidebar slot (the dashboard renders the dedicated settings sidebar
// while settings mode is active) and NO renderFile (it never contributes a
// workspace content tab) — registration exists purely so the plugin count
// in the footer stays honest about what is loaded.
registerScribblePlugin({
    id: 'settings',
    label: 'Setting',
    title: 'Settings',
});
