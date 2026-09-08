import { objectHasKey } from '@presource/core';
import type { ScribblePlugin } from './pluginTypes';

// Module-level plugin registry. A Map keeps insertion order so the dashboard
// renders plugins in the order they were registered. Cross-reference:
// src/dashboards/ScribbleDashboard.tsx reads this via getScribblePlugins().
const registry = new Map<string, ScribblePlugin>();

// Registers (or replaces, by id) a plugin definition. Called at module scope
// by each feature (e.g. src/features/textReader/TextReaderFeature.tsx) so a
// feature "plugs itself in" the moment its module is imported.
export const registerScribblePlugin = (plugin: ScribblePlugin): void => {
    registry.set(plugin.id, plugin);
};

// Removes a plugin by id — used when a feature is unplugged / in tests.
export const removeScribblePlugin = (id: string): void => {
    registry.delete(id);
};

// Snapshot of all registered plugins in registration order.
export const getScribblePlugins = (): ScribblePlugin[] => Array.from(registry.values());

// Checks whether a plugin id is currently registered.
export const hasScribblePlugin = (id: string): boolean => objectHasKey(Object.fromEntries(registry), id);
