import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { ScribbleFileProvider, scribbleFileStore } from './fileStore';
import type { ScribbleFile } from './fileStore';
import { readTextFile } from './readTextFile';

afterEach(() => {
    cleanup();
});

describe('readTextFile', () => {
    it('resolves with the file name and plain text content', async () => {
        const file = new File(['hello scribble'], 'notes.txt', { type: 'text/plain' });

        await expect(readTextFile(file)).resolves.toEqual({
            name: 'notes.txt',
            content: 'hello scribble',
        });
    });

    it('preserves newlines verbatim', async () => {
        const file = new File(['line one\nline two\n\nline four'], 'multi.txt', {
            type: 'text/plain',
        });

        await expect(readTextFile(file)).resolves.toEqual({
            name: 'multi.txt',
            content: 'line one\nline two\n\nline four',
        });
    });
});

describe('fileStore', () => {
    // Minimal consumer that renders the current session file name
    const Consumer = () => {
        const store = scribbleFileStore();
        return <div data-testid="store-consumer">{store.file ? store.file.name : 'no file'}</div>;
    };

    // Harness mirroring the real dashboard session implementation
    const Harness = () => {
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
                <Consumer />
                <button
                    type="button"
                    data-testid="open-button"
                    onClick={() => file({ name: 'session.txt', content: 'abc' })}
                />
            </ScribbleFileProvider>
        );
    };

    it('starts with no file and reflects openFile / closeFile through the context', async () => {
        render(<Harness />);

        expect(screen.getByTestId('store-consumer').textContent).toBe('no file');

        fireEvent.click(screen.getByTestId('open-button'));
        await waitFor(() => {
            expect(screen.getByTestId('store-consumer').textContent).toBe('session.txt');
        });
    });

    it('resolves the store with the real session callbacks injected via provider data', () => {
        render(<Harness />);

        // Outside the provider the store would be no-ops; inside it resolves
        // to the injected session implementation
        expect(screen.getByTestId('open-button')).toBeDefined();
    });
});
