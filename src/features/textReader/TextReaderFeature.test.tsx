import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { TextReaderFeature } from './TextReaderFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the editor container
const readEditorText = (): string => {
    const editor = screen.getByTestId('text-reader-editor');
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
// does. Files enter ONLY via the dashboard's global drop — the open-* buttons
// here simulate drops of a.txt / b.txt.
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
                data-testid="drop-a"
                onClick={() => session.openFile({ name: 'a.txt', content: 'content a' })}
            />
            <button
                type="button"
                data-testid="drop-b"
                onClick={() => session.openFile({ name: 'b.txt', content: 'content b' })}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('TextReaderFeature', () => {
    it('renders nothing when no file is open (drop-only flow)', () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        // The dashed content-area outline on the dashboard is the only
        // affordance in this state
        expect(screen.queryByTestId('text-reader-session')).toBeNull();
        expect(screen.queryByTestId('tab-bar')).toBeNull();
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
    });

    it('shows a tab and the full-area editor for a dropped file', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening a.txt
        fireEvent.click(screen.getByTestId('drop-a'));

        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });
        expect(screen.getByTestId('tab-bar').textContent).toBe('a.txt×');
        expect(screen.getByTestId('file-tab-a.txt')).toBeDefined();
    });

    it('gives each dropped file its own tab, activating the latest drop', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-a'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });

        fireEvent.click(screen.getByTestId('drop-b'));

        // Two tabs; b.txt (the latest drop) is active and shown in the editor
        await waitFor(() => {
            expect(readEditorText()).toBe('content b');
        });
        expect(screen.getByTestId('file-tab-a.txt')).toBeDefined();
        expect(screen.getByTestId('file-tab-b.txt')).toBeDefined();
        expect(screen.getByTestId('file-tab-a.txt').getAttribute('aria-selected')).toBe('false');
        expect(screen.getByTestId('file-tab-b.txt').getAttribute('aria-selected')).toBe('true');
    });

    it('switches the editor content when a tab is clicked', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-a'));
        fireEvent.click(screen.getByTestId('drop-b'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content b');
        });

        fireEvent.click(screen.getByTestId('file-tab-a.txt'));

        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });
        expect(screen.getByTestId('file-tab-a.txt').getAttribute('aria-selected')).toBe('true');
    });

    it('reflects edits pushed through the shared store for the active file', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-a'));
        fireEvent.click(screen.getByTestId('drop-b'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content b');
        });

        // Same path the CodeMirror onChange handler uses (active file: b.txt)
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });

        // Switch to a.txt — its content must be untouched
        fireEvent.click(screen.getByTestId('file-tab-a.txt'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });
    });

    it('closes a tab via its × and falls back to the most recent remaining tab', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-a'));
        fireEvent.click(screen.getByTestId('drop-b'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content b');
        });

        // Close b.txt (the active tab)
        fireEvent.click(screen.getByTestId('close-tab-b.txt'));

        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });
        expect(screen.queryByTestId('file-tab-b.txt')).toBeNull();
    });

    it('closes the last tab and returns to the empty drop-only state', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-a'));
        await waitFor(() => {
            expect(readEditorText()).toBe('content a');
        });

        fireEvent.click(screen.getByTestId('close-tab-a.txt'));

        await waitFor(() => {
            expect(screen.queryByTestId('text-reader-session')).toBeNull();
        });
    });

    it('registers itself as a plugin in the registry', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        const { TextReaderFeature: FreshFeature } = await import('./TextReaderFeature');

        render(
            <Harness>
                <FreshFeature />
            </Harness>,
        );

        const plugin = getScribblePlugins().find((entry) => entry.id === 'text-reader');
        // Must exist with the exact definition the dashboard renders
        expect(plugin).toEqual({
            id: 'text-reader',
            title: 'Text File Reader',
            description: undefined,
            Component: plugin?.Component,
        });
    });
});
