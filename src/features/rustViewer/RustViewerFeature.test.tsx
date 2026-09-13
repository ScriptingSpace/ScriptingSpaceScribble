import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { RustViewerFeature, RustEditorSurface, isRustFile } from './RustViewerFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the Rust editor container
// (same .cm-content probe the dashboard tests use — see
// src/dashboards/ScribbleDashboard.test.tsx readEditorText)
const readEditorText = (): string => {
    const editor = screen.getByTestId('rust-editor');
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
                data-testid="drop-rust"
                onClick={() =>
                    session.openFile({
                        name: 'main.rs',
                        content: 'fn main() { println!("hi"); }',
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
                data-testid="select-rust"
                onClick={() => session.selectFile('main.rs')}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('isRustFile (extension matcher)', () => {
    // Pure predicate — no harness needed. Exact contract values: positive
    // cases cover the extension + case-insensitivity; negative cases guard
    // against over-matching.
    it('matches exactly .rs names (case-insensitive), nothing else', () => {
        expect(isRustFile({ name: 'main.rs', content: '' })).toBe(true);
        expect(isRustFile({ name: 'LIB.RS', content: '' })).toBe(true);
        // Negative: lookalike extensions must NOT match (endsWith is exact)
        expect(isRustFile({ name: 'notes.txt', content: '' })).toBe(false);
        expect(isRustFile({ name: 'car.cars', content: '' })).toBe(false);
        expect(isRustFile({ name: 'main.rs.bak', content: '' })).toBe(false);
        expect(isRustFile({ name: 'noextension', content: '' })).toBe(false);
    });
});

describe('RustViewerFeature', () => {
    it('registers itself as a renderFile content plugin in the registry', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        const { RustViewerFeature: FreshFeature } = await import('./RustViewerFeature');

        render(
            <Harness>
                <FreshFeature />
            </Harness>,
        );

        const plugin = getScribblePlugins().find((entry) => entry.id === 'rust-viewer');
        // Must exist with the exact definition the dashboard executes —
        // matches (the extension predicate) + renderFile (the editor surface)
        expect(plugin).toEqual({
            id: 'rust-viewer',
            label: 'Rust',
            title: 'Rust Editor',
            description: undefined,
            slots: undefined,
            matches: isRustFile,
            renderFile: plugin?.renderFile,
        });
    });

    it('renders nothing when no file is open (drop-only flow)', () => {
        render(
            <Harness>
                <RustViewerFeature />
            </Harness>,
        );

        expect(screen.queryByTestId('rust-viewer-session')).toBeNull();
        expect(screen.queryByTestId('rust-editor')).toBeNull();
    });

    it('renders the full-area editor with the file content for an open .rs file', async () => {
        render(
            <Harness>
                <RustViewerFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening main.rs
        fireEvent.click(screen.getByTestId('drop-rust'));

        await waitFor(() => {
            expect(readEditorText()).toBe('fn main() { println!("hi"); }');
        });
        expect(screen.getByTestId('rust-viewer-session')).toBeDefined();
        // The feature no longer renders its own tab strip — files live in
        // the LEFT sidebar, plugin tabs are owned by the dashboard
        expect(screen.queryByTestId('tab-bar')).toBeNull();
    });

    it('follows the active file switch between .rs and .txt files', async () => {
        render(
            <Harness>
                <RustViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-rust'));
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });

        // Selection-only re-focus of the .rs entry
        fireEvent.click(screen.getByTestId('select-rust'));
        await waitFor(() => {
            expect(readEditorText()).toBe('fn main() { println!("hi"); }');
        });
    });

    it('reflects edits pushed through the shared store for the active file', async () => {
        render(
            <Harness>
                <RustViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-rust'));
        await waitFor(() => {
            expect(readEditorText()).toBe('fn main() { println!("hi"); }');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });

    it('keeps edits in the session: an edit on the .rs file survives switching away and back', async () => {
        render(
            <Harness>
                <RustViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-rust'));
        await waitFor(() => {
            expect(readEditorText()).toBe('fn main() { println!("hi"); }');
        });

        // Edit the .rs file via the store (the CodeMirror onChange path)
        fireEvent.click(screen.getByTestId('store-edit-button'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });

        // Switch to .txt (selection only — the .rs entry keeps its edited
        // content) then back — the .rs edit must be intact
        fireEvent.click(screen.getByTestId('drop-txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('plain');
        });
        fireEvent.click(screen.getByTestId('select-rust'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });
});

describe('RustEditorSurface (direct render)', () => {
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
                <RustEditorSurface
                    file={{
                        name: 'direct.rs',
                        content: 'struct Point { x: i32 }',
                        kind: 'text',
                    }}
                />
            </ScribbleFileProvider>,
        );

        await waitFor(() => {
            expect(readEditorText()).toBe('struct Point { x: i32 }');
        });
    });
});
