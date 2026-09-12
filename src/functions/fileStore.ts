import { localContextStore } from '@presource/react';

// A file opened on the dashboard. `name` doubles as the stable id: opening a
// file whose name matches an existing entry replaces that entry's content
// (re-load); a new name appends a new entry.
export type ScribbleFile = {
    name: string;
    content: string;
};

// Shared multi-file session contract. The dashboard owns the real
// implementation and injects it via the provider `data` prop; plugins consume
// it through scribbleFileStore(). Defaults are no-ops / empty so consumers
// render safely even without a provider.
export type ScribbleFileContext = {
    // All open files, in sidebar order
    files: ScribbleFile[];
    // Currently selected entry (a file name), null when nothing is open
    activeFileId: string | null;
    // Drop/paste entry point: appends (or replaces same-name) and focuses it
    openFile: (file: ScribbleFile) => void;
    // Sidebar entry click: make this file the active one
    selectFile: (name: string) => void;
    // Editor edits: update one open file's content
    updateContent: (name: string, content: string) => void;
    // Sidebar × (or legacy tab close): remove the file; if it was active,
    // focus the most recent remaining entry
    closeFile: (name: string) => void;
};

// Cross-reference: ScribbleDashboard.tsx wraps the tree in the provider and
// owns the state; the sidebar feature and the text-reader plugin consume it.
export const {
    ContextProvider: ScribbleFileProvider,
    contextStore: scribbleFileStore,
} = localContextStore<ScribbleFileContext>({
    files: [],
    activeFileId: null,
    openFile: () => {},
    selectFile: () => {},
    updateContent: () => {},
    closeFile: () => {},
});
