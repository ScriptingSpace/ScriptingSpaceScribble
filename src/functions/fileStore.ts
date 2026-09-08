import { localContextStore } from '@presource/react';

// A file opened on the dashboard: name for display, content is the live
// editable text (kept in sync as the user edits in the code editor).
export type ScribbleFile = {
    name: string;
    content: string;
};

// Shared "open file" session contract. The dashboard owns the real
// implementation and injects it via the provider `data` prop; plugins consume
// it through scribbleFileStore(). Defaults are no-ops so consumers render
// safely even without a provider.
export type ScribbleFileContext = {
    file: ScribbleFile | null;
    openFile: (file: ScribbleFile) => void;
    updateContent: (content: string) => void;
    closeFile: () => void;
};

// Cross-reference: ScribbleDashboard.tsx wraps the tree in the provider and
// owns the state; features/textReader/TextReaderFeature.tsx consumes it.
export const {
    ContextProvider: ScribbleFileProvider,
    contextStore: scribbleFileStore,
} = localContextStore<ScribbleFileContext>({
    file: null,
    openFile: () => {},
    updateContent: () => {},
    closeFile: () => {},
});
