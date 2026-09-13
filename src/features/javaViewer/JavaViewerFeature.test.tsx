import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { JavaViewerFeature, JavaEditorSurface, isJavaFile } from './JavaViewerFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the Java editor container
// (same .cm-content probe the dashboard tests use — see
// src/dashboards/ScribbleDashboard.test.tsx readEditorText)
const readEditorText = (): string => {
    const editor = screen.getByTestId('java-editor');
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
                data-testid="drop-java"
                onClick={() =>
                    session.openFile({
                        name: 'Main.java',
                        content: 'class Main { void run() {} }',
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
                data-testid="select-java"
                onClick={() => session.selectFile('Main.java')}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('isJavaFile (extension matcher)', () => {
    // Pure predicate — no harness needed. Exact contract values: positive
    // cases cover the extension + case-insensitivity; negative cases guard
    // against over-matching.
    it('matches exactly .java names (case-insensitive), nothing else', () => {
        expect(isJavaFile({ name: 'Main.java', content: '' })).toBe(true);
        expect(isJavaFile({ name: 'MAIN.JAVA', content: '' })).toBe(true);
        // Negative: lookalike extensions must NOT match (endsWith is exact)
        expect(isJavaFile({ name: 'notes.txt', content: '' })).toBe(false);
        expect(isJavaFile({ name: 'notjava.javac', content: '' })).toBe(false);
        expect(isJavaFile({ name: 'script.js', content: '' })).toBe(false);
        expect(isJavaFile({ name: 'noextension', content: '' })).toBe(false);
    });
});

describe('JavaViewerFeature', () => {
    it('registers itself as a renderFile content plugin in the registry', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        const { JavaViewerFeature: FreshFeature } = await import('./JavaViewerFeature');

        render(
            <Harness>
                <FreshFeature />
            </Harness>,
        );

        const plugin = getScribblePlugins().find((entry) => entry.id === 'java-viewer');
        // Must exist with the exact definition the dashboard executes —
        // matches (the extension predicate) + renderFile (the editor surface)
        expect(plugin).toEqual({
            id: 'java-viewer',
            label: 'Java',
            title: 'Java Editor',
            description: undefined,
            slots: undefined,
            matches: isJavaFile,
            renderFile: plugin?.renderFile,
        });
    });

    it('renders nothing when no file is open (drop-only flow)', () => {
        render(
            <Harness>
                <JavaViewerFeature />
            </Harness>,
        );

        expect(screen.queryByTestId('java-viewer-session')).toBeNull();
        expect(screen.queryByTestId('java-editor')).toBeNull();
    });

    it('renders the full-area editor with the file content for an open .java file', async () => {
        render(
            <Harness>
                <JavaViewerFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening Main.java
        fireEvent.click(screen.getByTestId('drop-java'));

        await waitFor(() => {
            expect(readEditorText()).toBe('class Main { void run() {} }');
        });
        expect(screen.getByTestId('java-viewer-session')).toBeDefined();
        // The feature no longer renders its own tab strip — files live in
        // the LEFT sidebar, plugin tabs are owned by the dashboard
        expect(screen.queryByTestId('tab-bar')).toBeNull();
    });

    it('follows the active file switch between .java and .txt files', async () => {
        render(
            <Harness>
                <JavaViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-java'));
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });

        // Selection-only re-focus of the .java entry
        fireEvent.click(screen.getByTestId('select-java'));
        await waitFor(() => {
            expect(readEditorText()).toBe('class Main { void run() {} }');
        });
    });

    it('reflects edits pushed through the shared store for the active file', async () => {
        render(
            <Harness>
                <JavaViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-java'));
        await waitFor(() => {
            expect(readEditorText()).toBe('class Main { void run() {} }');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });

    it('keeps edits in the session: an edit on the .java file survives switching away and back', async () => {
        render(
            <Harness>
                <JavaViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-java'));
        await waitFor(() => {
            expect(readEditorText()).toBe('class Main { void run() {} }');
        });

        // Edit the .java file via the store (the CodeMirror onChange path)
        fireEvent.click(screen.getByTestId('store-edit-button'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });

        // Switch to .txt (selection only — the .java entry keeps its edited
        // content) then back — the .java edit must be intact
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });
        fireEvent.click(screen.getByTestId('select-java'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });
});

describe('JavaEditorSurface (direct render)', () => {
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
                <JavaEditorSurface
                    file={{
                        name: 'direct.java',
                        content: 'interface A { void x(); }',
                        kind: 'text',
                    }}
                />
            </ScribbleFileProvider>,
        );

        await waitFor(() => {
            expect(readEditorText()).toBe('interface A { void x(); }');
        });
    });
});
