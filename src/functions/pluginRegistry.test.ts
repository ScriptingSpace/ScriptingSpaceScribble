import { describe, it, expect } from 'vitest';
import {
    registerScribblePlugin,
    removeScribblePlugin,
    getScribblePlugins,
    hasScribblePlugin,
} from './pluginRegistry';
import type { ScribblePlugin } from './pluginTypes';

// Deterministic plugin factory for registry tests
const makePlugin = (id: string, title: string): ScribblePlugin => ({
    id,
    title,
    description: `description for ${id}`,
    Component: () => null,
});

describe('pluginRegistry', () => {
    it('registers plugins in insertion order', () => {
        registerScribblePlugin(makePlugin('a', 'Plugin A'));
        registerScribblePlugin(makePlugin('b', 'Plugin B'));

        const plugins = getScribblePlugins();

        // Full structural assertion — order and every field
        expect(plugins.map((plugin) => ({ id: plugin.id, title: plugin.title }))).toEqual([
            { id: 'a', title: 'Plugin A' },
            { id: 'b', title: 'Plugin B' },
        ]);
        expect(plugins[0].description).toBe('description for a');
    });

    it('replaces an existing plugin when the same id is registered again', () => {
        registerScribblePlugin(makePlugin('swap', 'Original'));
        registerScribblePlugin(makePlugin('swap', 'Replacement'));

        const plugins = getScribblePlugins().filter((plugin) => plugin.id === 'swap');

        expect(plugins).toEqual([
            {
                id: 'swap',
                title: 'Replacement',
                description: 'description for swap',
                Component: plugins[0].Component,
            },
        ]);
    });

    it('removes a plugin by id', () => {
        registerScribblePlugin(makePlugin('doomed', 'Doomed'));
        expect(hasScribblePlugin('doomed')).toBe(true);

        removeScribblePlugin('doomed');

        expect(hasScribblePlugin('doomed')).toBe(false);
    });

    it('reports unregistered ids as absent', () => {
        expect(hasScribblePlugin('never-registered')).toBe(false);
    });
});
