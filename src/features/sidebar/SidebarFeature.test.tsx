import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { ConnectedFileSidebar, FileSidebar } from '../../components/FileSidebar';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

describe('FileSidebar', () => {
    it('renders the header with the file count and one entry per file', () => {
        render(
            <FileSidebar
                files={[
                    { name: 'a.txt', content: 'a' },
                    { name: 'b.txt', content: 'b' },
                ]}
                activeFileId="a.txt"
                onSelect={() => {}}
                onClose={() => {}}
            />,
        );

        expect(screen.getByTestId('file-sidebar')).toBeDefined();
        expect(screen.getByTestId('file-sidebar').textContent).toContain('Files (2)');
        expect(screen.getByTestId('sidebar-file-a.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-b.txt')).toBeDefined();
    });

    it('shows the empty hint when no file is open', () => {
        render(<FileSidebar files={[]} activeFileId={null} onSelect={() => {}} onClose={() => {}} />);

        expect(screen.getByTestId('file-list-empty').textContent).toBe(
            'No files yet — drop files anywhere on the page to add them here.',
        );
        expect(screen.queryByTestId('sidebar-file-a.txt')).toBeNull();
    });

    it('highlights exactly the active entry', () => {
        render(
            <FileSidebar
                files={[
                    { name: 'a.txt', content: 'a' },
                    { name: 'b.txt', content: 'b' },
                ]}
                activeFileId="b.txt"
                onSelect={() => {}}
                onClose={() => {}}
            />,
        );

        expect(screen.getByTestId('sidebar-file-a.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
        expect(screen.getByTestId('sidebar-file-b.txt').getAttribute('aria-pressed')).toBe('true');
    });

    it('fires onSelect when an entry is clicked (and not onClose)', () => {
        const selected: string[] = [];
        const closed: string[] = [];
        render(
            <FileSidebar
                files={[{ name: 'a.txt', content: 'a' }]}
                activeFileId={null}
                onSelect={(name) => selected.push(name)}
                onClose={(name) => closed.push(name)}
            />,
        );

        fireEvent.click(screen.getByTestId('sidebar-file-a.txt'));

        expect(selected).toEqual(['a.txt']);
        expect(closed).toEqual([]);
    });

    it('fires onClose when the × is clicked without selecting the entry', () => {
        const selected: string[] = [];
        const closed: string[] = [];
        render(
            <FileSidebar
                files={[{ name: 'a.txt', content: 'a' }]}
                activeFileId="a.txt"
                onSelect={(name) => selected.push(name)}
                onClose={(name) => closed.push(name)}
            />,
        );

        fireEvent.click(screen.getByTestId('remove-file-a.txt'));

        expect(closed).toEqual(['a.txt']);
        expect(selected).toEqual([]);
    });

    it('fires onSelect for Enter and Space key presses on a focused entry', () => {
        const selected: string[] = [];
        render(
            <FileSidebar
                files={[{ name: 'a.txt', content: 'a' }]}
                activeFileId={null}
                onSelect={(name) => selected.push(name)}
                onClose={() => {}}
            />,
        );

        const entry = screen.getByTestId('sidebar-file-a.txt');
        fireEvent.keyDown(entry, { key: 'Enter' });
        fireEvent.keyDown(entry, { key: ' ' });

        expect(selected).toEqual(['a.txt', 'a.txt']);
    });
});

describe('ConnectedFileSidebar', () => {
    // Harness mirroring the real dashboard multi-file session implementation
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
                <button
                    type="button"
                    data-testid="drop-a"
                    onClick={() => session.openFile({ name: 'a.txt', content: 'aaa' })}
                />
                <button
                    type="button"
                    data-testid="drop-b"
                    onClick={() => session.openFile({ name: 'b.txt', content: 'bbb' })}
                />
            </ScribbleFileProvider>
        );
    };

    it('reads the shared session: opens, selects and closes flow through the store', async () => {
        render(
            <Harness>
                <ConnectedFileSidebar />
            </Harness>,
        );

        // Empty state first
        expect(screen.getByTestId('file-list-empty')).toBeDefined();

        // Simulate drops
        fireEvent.click(screen.getByTestId('drop-a'));
        fireEvent.click(screen.getByTestId('drop-b'));
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-b.txt').getAttribute('aria-pressed')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('sidebar-file-a.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );

        // Click entry a → selects it through the store
        fireEvent.click(screen.getByTestId('sidebar-file-a.txt'));
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-a.txt').getAttribute('aria-pressed')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('sidebar-file-b.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );

        // Remove entry b through its × — flows through store.closeFile
        fireEvent.click(screen.getByTestId('remove-file-b.txt'));
        await waitFor(() => {
            expect(screen.queryByTestId('sidebar-file-b.txt')).toBeNull();
        });
        expect(screen.getByTestId('sidebar-file-a.txt')).toBeDefined();
    });

    it('registers the sidebar plugin into the registry on import', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        await import('./SidebarFeature');

        const plugin = getScribblePlugins().find((entry) => entry.id === 'sidebar');
        // Must exist with the sidebar slot assignment and no content hook
        expect(plugin).toEqual({
            id: 'sidebar',
            label: undefined,
            title: undefined,
            description: undefined,
            slots: plugin?.slots,
            renderFile: undefined,
        });
        // The slot renders the connected sidebar (a React element)
        expect(plugin?.slots?.sidebar).toBeDefined();
    });
});
