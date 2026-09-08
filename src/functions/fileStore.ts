import { localContextStore } from '@presource/react';

// A file opened on the dashboard. `name` doubles as the stable tab id:
// dropping a file whose name matches an open tab replaces that tab's content
// (re-load); a new name appends a new tab.
export type ScribbleFile = {
    name: string;
    content: string;
};

// Shared multi-file session contract. The dashboard owns the real
// implementation and injects it via the provider `data` prop; plugins consume
// it through scribbleFileStore(). Defaults are no-ops / empty so consumers
// render safely even without a provider.
export type ScribbleFileContext = {
    // All open files, in tab order
    files: ScribbleFile[];
    // Currently selected tab (a file name), null when nothing is open
    activeFileId: string | null;
    // Drop entry point: appends (or replaces same-name) and focuses the tab
    openFile: (file: ScribbleFile) => void;
    // Tab click: make this file the active one
    selectFile: (name: string) => void;
    // Editor edits: update one open file's content
    updateContent: (name: string, content: string) => void;
    // Tab close (×): remove the file; if it was active, focus the latest tab
    closeFile: (name: string) => void;
};

// Cross-reference: ScribbleDashboard.tsx wraps the tree in the provider and
// owns the state; features/textReader/TextReaderFeature.tsx consumes it.
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
