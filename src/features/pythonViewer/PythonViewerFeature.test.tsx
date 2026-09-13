import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import {
    PythonViewerFeature,
    PythonEditorSurface,
    isPythonFile,
} from './PythonViewerFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the Python editor container
// (same .cm-content probe the dashboard tests use — see
// src/dashboards/ScribbleDashboard.test.tsx readEditorText)
const readEditorText = (): string => {
    const editor = screen.getByTestId('python-editor');
    return editor.querySelector('.cm-content')?.textContent ?? '';
};

// Session edit probe rendered inside the provider — pushes an edit through
// the shared store for the ACTIVE file, simulating the CodeMirror onChange
// path without typing into contenteditable in jsdom
const StoreEditButton = () => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <button
            type="button"
            data-testid="store-edit-button"
            onClick={() => {
                const active = store.files.find((entry) => entry.name === store.activeFileId);
                if (active) store.updateContent(active.name, 'edited via store');
            }}
        />
    );
};

// Harness mirroring the real dashboard multi-file session: owns the session
// state and injects it into the shared provider exactly like ScribbleDashboard
// does. The open-* buttons simulate drops of the respective files; the
// select-* buttons re-focus entries WITHOUT re-opening them (openFile with
// the same name REPLACES content — selection keeps edits intact).
const Harness = ({ children }: { children: React.ReactNode }) => {
    const files = useStateHook<ScribbleFile[]>([]);
    const activeFileId = useStateHook<string | null>(null);
    const session = {
        files: files(),
        activeFileId: activeFileId(),
        openFile: (next: ScribbleFile) => {
            const current = files();
            files(
                current.some((entry) => entry.name === next.name)
                    ? current.map((entry) => (entry.name === next.name ? next : entry))
                    : [...current, next],
            );
            activeFileId(next.name);
        },
        selectFile: (name: string) => activeFileId(name),
        updateContent: (name: string, content: string) => {
            files(files().map((entry) => (entry.name === name ? { ...entry, content } : entry)));
        },
        closeFile: (name: string) => {
            const remaining = files().filter((entry) => entry.name !== name);
            files(remaining);
            if (activeFileId() === name) {
                activeFileId(remaining.length ? remaining[remaining.length - 1].name : null);
            }
        },
    };
    return (
        <ScribbleFileProvider data={session}>
            {children}
            {/* Simulate drops through the session contract */}
            <button
                type="button"
                data-testid="drop-python"
                onClick={() =>
                    session.openFile({
                        // NOTE: single-line content — CodeMirror renders each
                        // line as a separate DOM node, so the .cm-content
                        // textContent probe flattens \n away (multi-line
                        // assertions would need a line-join helper; the
                        // single-line payload keeps the assertion exact)
                        name: 'app.py',
                        content: 'def greet():    return "hi"',
                        kind: 'text' as const,
                        mime: 'text/plain',
                    })
                }
            />
            <button
                type="button"
                data-testid="drop-txt"
                onClick={() =>
                    session.openFile({
                        name: 'notes.txt',
                        content: 'plain',
                        kind: 'text' as const,
                        mime: 'text/plain',
                    })
                }
            />
            <button
                type="button"
                data-testid="select-python"
                onClick={() => session.selectFile('app.py')}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('isPythonFile (extension matcher)', () => {
    // Pure predicate — no harness needed. Exact contract values: positive
    // cases cover the extension + case-insensitivity; negative cases guard
    // against over-matching.
    it('matches exactly .py names (case-insensitive), nothing else', () => {
        expect(isPythonFile({ name: 'app.py', content: '' })).toBe(true);
        expect(isPythonFile({ name: 'MAIN.PY', content: '' })).toBe(true);
        // Negative: lookalike extensions must NOT match (endsWith is exact)
        expect(isPythonFile({ name: 'notes.txt', content: '' })).toBe(false);
        expect(isPythonFile({ name: 'script.python', content: '' })).toBe(false);
        expect(isPythonFile({ name: 'app.pyw', content: '' })).toBe(false);
        expect(isPythonFile({ name: 'noextension', content: '' })).toBe(false);
    });
});

describe('PythonViewerFeature', () => {
    it('registers itself as a renderFile content plugin in the registry', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        const { PythonViewerFeature: FreshFeature } = await import('./PythonViewerFeature');

        render(
            <Harness>
                <FreshFeature />
            </Harness>,
        );

        const plugin = getScribblePlugins().find((entry) => entry.id === 'python-viewer');
        // Must exist with the exact definition the dashboard executes —
        // matches (the extension predicate) + renderFile (the editor surface)
        expect(plugin).toEqual({
            id: 'python-viewer',
            label: 'Python',
            title: 'Python Editor',
            description: undefined,
            slots: undefined,
            matches: isPythonFile,
            renderFile: plugin?.renderFile,
        });
    });

    it('renders nothing when no file is open (drop-only flow)', () => {
        render(
            <Harness>
                <PythonViewerFeature />
            </Harness>,
        );

        expect(screen.queryByTestId('python-viewer-session')).toBeNull();
        expect(screen.queryByTestId('python-editor')).toBeNull();
    });

    it('renders the full-area editor with the file content for an open .py file', async () => {
        render(
            <Harness>
                <PythonViewerFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening app.py
        fireEvent.click(screen.getByTestId('drop-python'));

        await waitFor(() => {
            expect(readEditorText()).toBe('def greet():    return "hi"');
        });
        expect(screen.getByTestId('python-viewer-session')).toBeDefined();
        // The feature no longer renders its own tab strip — files live in
        // the LEFT sidebar, plugin tabs are owned by the dashboard
        expect(screen.queryByTestId('tab-bar')).toBeNull();
    });

    it('follows the active file switch between .py and .txt files', async () => {
        render(
            <Harness>
                <PythonViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-python'));
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });

        // Selection-only re-focus of the .py entry
        fireEvent.click(screen.getByTestId('select-python'));
        await waitFor(() => {
            expect(readEditorText()).toBe('def greet():    return "hi"');
        });
    });

    it('reflects edits pushed through the shared store for the active file', async () => {
        render(
            <Harness>
                <PythonViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-python'));
        await waitFor(() => {
            expect(readEditorText()).toBe('def greet():    return "hi"');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });

    it('keeps edits in the session: an edit on the .py file survives switching away and back', async () => {
        render(
            <Harness>
                <PythonViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-python'));
        await waitFor(() => {
            expect(readEditorText()).toBe('def greet():    return "hi"');
        });

        // Edit the .py file via the store (the CodeMirror onChange path)
        fireEvent.click(screen.getByTestId('store-edit-button'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });

        // Switch to .txt (selection only — the .py entry keeps its edited
        // content) then back — the .py edit must be intact
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });
        fireEvent.click(screen.getByTestId('select-python'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });
});

describe('PythonEditorSurface (direct render)', () => {
    it('renders the editor for a directly-passed file', async () => {
        render(
            <ScribbleFileProvider
                data={{
                    files: [],
                    activeFileId: null,
                    openFile: () => {},
                    selectFile: () => {},
                    updateContent: () => {},
                    closeFile: () => {},
                }}
            >
                <PythonEditorSurface
                    file={{
                        // Single-line payload — see the drop-python note
                        // above (textContent flattens line breaks)
                        name: 'direct.py',
                        content: 'class A:    pass',
                        kind: 'text',
                    }}
                />
            </ScribbleFileProvider>,
        );

        await waitFor(() => {
            expect(readEditorText()).toBe('class A:    pass');
        });
    });
});
