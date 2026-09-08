import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
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

// Session session controls + store edit probe rendered inside the provider
const StoreEditButton = () => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = scribbleFileStore();
    return (
        <button
            type="button"
            data-testid="store-edit-button"
            onClick={() => store.updateContent('edited via store')}
        />
    );
};

// Harness mirroring the real dashboard session: owns the open-file state and
// injects it into the shared provider exactly like ScribbleDashboard does.
// The file starts closed; OpenButton simulates the global drop opening it.
const Harness = ({ children }: { children: React.ReactNode }) => {
    const file = useStateHook<ScribbleFile | null>(null);
    const session = {
        file: file(),
        openFile: (next: ScribbleFile) => file(next),
        updateContent: (content: string) => {
            const current = file();
            if (current) file({ name: current.name, content });
        },
        closeFile: () => file(null),
    };
    return (
        <ScribbleFileProvider data={session}>
            {children}
            {/* Simulates the dashboard's global drop opening a file */}
            <button
                type="button"
                data-testid="session-open-button"
                onClick={() => file({ name: 'notes.txt', content: 'hello scribble' })}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('TextReaderFeature', () => {
    it('renders the browse affordance and hidden file input when no file is open', () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        expect(screen.getByTestId('browse-button').textContent).toBe(
            'Browse for a .txt file — or drop it anywhere',
        );
        expect(screen.getByTestId('file-input')).toBeDefined();
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
    });

    it('opens the native file dialog when the browse button is clicked', () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
        fireEvent.click(screen.getByTestId('browse-button'));
        expect(clickSpy).toHaveBeenCalledTimes(1);
        clickSpy.mockRestore();
    });

    it('shows the code editor for the opened file session', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening the file
        fireEvent.click(screen.getByTestId('session-open-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('hello scribble');
        });
        expect(screen.getByText('Editing: notes.txt')).toBeDefined();
        expect(screen.queryByTestId('browse-button')).toBeNull();
    });

    it('reflects edits pushed through the shared store (controlled editor)', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('session-open-button'));
        await waitFor(() => {
            expect(readEditorText()).toBe('hello scribble');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });

    it('closes the file and returns to the browse affordance', async () => {
        render(
            <Harness>
                <TextReaderFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('session-open-button'));
        await waitFor(() => {
            expect(screen.getByTestId('text-reader-editor')).toBeDefined();
        });

        fireEvent.click(screen.getByTestId('close-file-button'));

        await waitFor(() => {
            expect(screen.getByTestId('browse-button')).toBeDefined();
        });
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
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
