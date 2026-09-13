import {
    isBoolean,
    isObject,
    arrayEach,
    objectHasKey,
} from '@presource/core';
import { localContextStore } from '@presource/react';

// ─── Settings model ──────────────────────────────────────────────────────────

// The "enabled" flag is the plugin on/off switch the settings screen's
// Plugins list toggles. Unknown ids inside `plugins` are ignored at read
// time (see sanitizeSettingsPlugin) so a hand-edited JSON with stale plugin
// ids can never crash the dashboard.
export type ScribbleSettingsPlugin = {
    enabled: boolean;
};

// Full settings shape. Currently only the plugins block exists; adding a
// new configuration group = add a key here + a sanitizer branch below.
// The JSON panel in the settings screen round-trips EXACTLY this shape.
export type ScribbleSettings = {
    plugins: { [pluginId: string]: ScribbleSettingsPlugin };
};

// The plugin registry is defined in ./pluginRegistry.ts, but importing it
// here would create a cycle (pluginRegistry ← pluginTypes ← …). The settings
// store only needs the LIST of registered ids, so the dashboard passes the
// ids in at use time instead (see SettingsFeature.tsx — getScribblePlugins()
// is read there, not here).

// The default settings: EVERY registered plugin starts enabled (on). Built
// from the ids the caller passes in (the dashboard's registry snapshot) so
// new plugins automatically appear in the JSON without edits here.
export const createDefaultScribbleSettings = (pluginIds: string[]): ScribbleSettings => {
    const plugins: { [pluginId: string]: ScribbleSettingsPlugin } = {};
    arrayEach(pluginIds, ({ value: id }) => {
        plugins[id] = { enabled: true };
    });
    return { plugins };
};

// ─── Sanitizer ───────────────────────────────────────────────────────────────

// Normalizes one `plugins[id]` entry. Anything that is not a plain object
// with a boolean `enabled` falls back to ENABLED — the safe default (a
// malformed entry must never silently disable a plugin the user relies on).
const sanitizeSettingsPlugin = (unknown: any): ScribbleSettingsPlugin => {
    if (!isObject(unknown)) return { enabled: true };
    return {
        enabled: isBoolean(unknown.enabled) ? unknown.enabled : true,
    };
};

// Normalizes ANY pasted/loaded value into a valid ScribbleSettings. Every
// field is defensively checked so the JSON panel can accept arbitrary user
// input without ever producing a broken settings object (the "paste a new
// json into that window" flow calls this through parseScribbleSettings).
// Only entries for ids present in `pluginIds` survive — unknown ids are
// dropped so the JSON never accumulates stale plugin entries.
export const sanitizeScribbleSettings = (
    unknown: any,
    pluginIds: string[],
): ScribbleSettings => {
    const source = isObject(unknown) ? unknown : {};
    const rawPlugins = isObject(source.plugins) ? source.plugins : {};
    const plugins: { [pluginId: string]: ScribbleSettingsPlugin } = {};
    arrayEach(pluginIds, ({ value: id }) => {
        // Unknown plugin ids in the pasted JSON are ignored — only the
        // currently-registered ids are materialized
        if (objectHasKey(rawPlugins, id)) {
            plugins[id] = sanitizeSettingsPlugin(rawPlugins[id]);
        } else {
            plugins[id] = { enabled: true };
        }
    });
    return { plugins };
};

// ─── JSON round-trip ─────────────────────────────────────────────────────────

// Serializes the settings into the pretty-printed JSON text shown in the
// configuration panel (2-space indent — the same shape the user pastes back).
export const serializeScribbleSettings = (settings: ScribbleSettings): string =>
    JSON.stringify(settings, null, 2);

// Parses + sanitizes a JSON text into settings. Returns null when the text
// is not valid JSON at all (the panel shows the error instead of crashing
// the dashboard) or when the parsed value is not an object.
export const parseScribbleSettings = (
    text: string,
    pluginIds: string[],
): ScribbleSettings | null => {
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!isObject(parsed)) return null;
    return sanitizeScribbleSettings(parsed, pluginIds);
};

// ─── Shared settings store ───────────────────────────────────────────────────

// The full settings contract shared through the context. The dashboard owns
// the real implementation (like the file session in ./fileStore.ts); the
// settings screen consumes it via scribbleSettingsStore().
export type ScribbleSettingsContext = {
    // Current configuration
    settings: ScribbleSettings;
    // Flip one plugin on/off (the Plugins list checkbox)
    setPluginEnabled: (pluginId: string, enabled: boolean) => void;
    // Replace the WHOLE configuration (the JSON panel apply flow). The
    // dashboard remounts the entire UI when this fires (full refresh).
    applySettings: (settings: ScribbleSettings) => void;
};

// Cross-reference: ScribbleDashboard.tsx wraps the tree in the provider and
// owns the state; the settings feature consumes it.
export const {
    ContextProvider: ScribbleSettingsProvider,
    contextStore: scribbleSettingsStore,
} = localContextStore<ScribbleSettingsContext>({
    settings: { plugins: {} },
    setPluginEnabled: () => {},
    applySettings: () => {},
});
