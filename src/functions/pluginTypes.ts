import type { FC } from 'react';

// A Scribble "plugin" is a self-contained feature unit. The dashboard knows
// nothing about any specific feature — it only renders whatever plugins are
// present in the registry (see ./pluginRegistry.ts). This is what makes the
// dashboard plug-and-play: adding a feature = registering a plugin definition.
export type ScribblePlugin = {
    // Stable unique id. Re-registering the same id replaces the previous
    // definition (idempotent hot-swap, useful for HMR).
    id: string;
    // Display title shown in the plugin panel header
    title: string;
    // Short description shown under the title. Optional — omit it for plugins
    // that need no explanation (renders title only).
    description?: string;
    // The React component rendered inside the plugin panel. Plugins own their
    // internal state — the dashboard never passes props into them.
    Component: FC;
};
