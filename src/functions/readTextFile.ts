import type { ScribbleFile } from './fileStore';

// Reads a browser File as plain text and resolves with the ScribbleFile
// session shape. Shared by the dashboard's global drop handler and the
// text-reader plugin's local drop zone / browse fallback.
export const readTextFile = (file: File): Promise<ScribbleFile> =>
    new Promise<ScribbleFile>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: String(reader.result ?? '') });
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
