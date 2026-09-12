import type { FC, ReactNode } from 'react';

// A Scribble "plugin" is a self-contained feature unit. The dashboard knows
// nothing about any specific feature — it executes whatever plugins are
// present in the registry (see ./pluginRegistry.ts). This is what makes the
// dashboard plug-and-play: adding a feature = registering a plugin definition.
//
// The contract mirrors the Formatter dashboard's DashboardPlugin shape
// (cross-reference: distribution/ScriptingSpaceFormatter/src/plugins/core/
// pluginTypes.ts): plugins assign STATIC SLOTS (sidebar) and contribute
// CONTENT per active file (renderFile) instead of rendering their own
// free-standing surfaces.
export type ScribblePlugin = {
    // Stable unique id. Re-registering the same id replaces the previous
    // definition (idempotent hot-swap, useful for HMR). Doubles as the
    // content-tab key when several plugins render the same active file.
    id: string;
    // Human label shown on the content tab (defaults to the plugin id)
    label?: string;
    // Display title shown in the plugin panel header (legacy field — kept
    // for registry consumers; the dashboard no longer renders panel chrome)
    title?: string;
    // Short description shown under the title (legacy field, optional)
    description?: string;
    // Static slot assignment — plain React nodes, rendered unconditionally
    // while the plugin is registered. Components that need session access
    // read the store themselves via scribbleFileStore() (they render inside
    // the ScribbleFileProvider).
    slots?: {
        // LEFT column of the content area (the file list, …)
        sidebar?: ReactNode;
    };
    // File hook: called with the ACTIVE file whenever it changes. Every
    // plugin that returns a node contributes a content tab on the RIGHT pane
    // (one contributor → direct render, two or more → plugin-style tabs).
    // Return null / undefined to contribute nothing. Pure render — no side
    // effects, deterministic output for a given file.
    renderFile?: (file: ScribbleFileLike) => ReactNode | null;
    // Extension matcher: given the ACTIVE file's name, does this plugin
    // consider itself the BEST viewer for it? The dashboard uses this to
    // ORDER the content tabs — plugins whose matcher returns true come FIRST
    // (e.g. a .json file renders [Json][Editor]; anything else falls back to
    // registration order, [Editor][Json]). Pure predicate — no side effects.
    // Omit it for plugins that never claim priority (the generic fallbacks).
    matches?: (file: ScribbleFileLike) => boolean;
};

// Structural subset of the session's ScribbleFile the renderFile hook
// receives — declared here (instead of importing from fileStore) to keep
// the plugin contract dependency-light and cycle-free.
export type ScribbleFileLike = {
    name: string;
    content: string;
};

// Legacy component slot — a plugin that only ships a Component renders as a
// free-standing surface (kept for backwards compatibility with the original
// registry contract; the built-in features no longer use it).
export type ScribblePluginComponent = {
    Component: FC;
};
