import { localContextStore } from '@presource/react';

// Render classification for an accepted file — decides HOW plugins treat it:
// - 'image'  → rendered in an <img> (content is a data URL)
// - 'pdf'    → rendered by the PDF viewer plugin (content is a data URL)
// - 'text'   → rendered as text / code (content is decoded text)
// - 'binary' → NOT rendered; a notice is shown instead
export type ScribbleFileKind = 'image' | 'pdf' | 'text' | 'binary';

// A file opened on the dashboard. `name` doubles as the stable id: opening a
// file whose name matches an existing entry replaces that entry's content
// (re-load); a new name appends a new entry. `kind`/`mime` are detected by
// readTextFile (src/functions/readTextFile.ts) from the browser File's MIME
// type / extension (with a NUL-byte sniff fallback) — mirroring the
// Formatter's file model (cross-reference:
// distribution/ScriptingSpaceFormatter/src/functions/fileStore.ts).
export type ScribbleFile = {
    name: string;
    kind: ScribbleFileKind;
    // Original MIME type as reported by the browser (may be ''); used as the
    // <img> fallback source type
    mime: string;
    // image/pdf → data URL; text → decoded text; binary → raw text dump
    // (never rendered, kept for future features)
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
// owns the state; the sidebar feature and the content plugins consume it.
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
