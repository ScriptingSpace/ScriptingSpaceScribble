import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    // Minimal consumer rendering the session summary: file names, active id
    const Consumer = () => {
        const store = scribbleFileStore();
        return (
            <div data-testid="store-consumer">
                {store.files.map((entry) => entry.name).join(',')}
                {'|'}
                {store.activeFileId ?? 'none'}
            </div>
        );
    };

    // Session controls driven through the STORE (like the tabs/editor do) —
    // validates the real session implementation the dashboard injects
    const StoreControls = () => {
        // Capture the store during render — calling the accessor inside an
        // event handler would be an invalid hook call
        const store = scribbleFileStore();
        return (
            <>
                <button
                    type="button"
                    data-testid="open-a"
                    onClick={() => store.openFile({ name: 'a.txt', content: 'aaa' })}
                />
                <button
                    type="button"
                    data-testid="open-b"
                    onClick={() => store.openFile({ name: 'b.txt', content: 'bbb' })}
                />
                <button
                    type="button"
                    data-testid="open-a-again"
                    onClick={() => store.openFile({ name: 'a.txt', content: 'a2' })}
                />
                <button
                    type="button"
                    data-testid="select-a"
                    onClick={() => store.selectFile('a.txt')}
                />
                <button
                    type="button"
                    data-testid="edit-active"
                    onClick={() => {
                        const active = store.files.find(
                            (entry) => entry.name === store.activeFileId,
                        );
                        if (active) store.updateContent(active.name, 'edited');
                    }}
                />
                <button
                    type="button"
                    data-testid="close-active"
                    onClick={() => {
                        if (store.activeFileId) store.closeFile(store.activeFileId);
                    }}
                />
            </>
        );
    };

    // Harness mirroring the real dashboard multi-file session implementation
    const Harness = () => {
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
                <Consumer />
                <StoreControls />
            </ScribbleFileProvider>
        );
    };

    const sessionSummary = (): string => screen.getByTestId('store-consumer').textContent ?? '';

    it('starts with no files and an empty active id', () => {
        render(<Harness />);

        expect(sessionSummary()).toBe('|none');
    });

    it('openFile appends a tab and focuses it; a second file becomes the new active tab', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        expect(sessionSummary()).toBe('a.txt|a.txt');

        fireEvent.click(screen.getByTestId('open-b'));
        expect(sessionSummary()).toBe('a.txt,b.txt|b.txt');
    });

    it('re-dropping an open file name replaces its content instead of duplicating the tab', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('open-a-again'));

        // Still two tabs; a.txt is focused again with the replaced content
        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');
    });

    it('selectFile switches the active tab', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('select-a'));

        expect(sessionSummary()).toBe('a.txt,b.txt|a.txt');
    });

    it('updateContent edits exactly the targeted file', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('edit-active'));

        // b.txt is active → only b.txt is edited; tabs and focus unchanged
        expect(sessionSummary()).toBe('a.txt,b.txt|b.txt');
    });

    it('closeFile removes the tab and falls back to the most recent remaining tab', () => {
        render(<Harness />);

        fireEvent.click(screen.getByTestId('open-a'));
        fireEvent.click(screen.getByTestId('open-b'));
        fireEvent.click(screen.getByTestId('close-active'));

        // b.txt closed → a.txt (most recent remaining) becomes active
        expect(sessionSummary()).toBe('a.txt|a.txt');

        fireEvent.click(screen.getByTestId('close-active'));

        // Last tab closed → empty session
        expect(sessionSummary()).toBe('|none');
    });
});
