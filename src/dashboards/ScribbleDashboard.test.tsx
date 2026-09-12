import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { ScribbleDashboard } from './ScribbleDashboard';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the editor container
const readEditorText = (): string => {
    const editor = screen.getByTestId('text-reader-editor');
    return editor.querySelector('.cm-content')?.textContent ?? '';
};

describe('ScribbleDashboard', () => {
    it('renders the dashboard header', () => {
        render(<ScribbleDashboard />);

        // The title also appears in the footer — assert on the header heading
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scribble Dashboard');
        expect(screen.getByText('Drop a text file anywhere!')).toBeDefined();
    });

    it('renders the empty-state layout: sidebar column + placeholder', () => {
        render(<ScribbleDashboard />);

        // Sidebar column exists with its empty hint; the pane shows the
        // placeholder. NO idle dashed outline — the header subtitle already
        // explains the drop affordance, a persistent frame is noise.
        expect(screen.getByTestId('sidebar-column')).toBeDefined();
        expect(screen.getByTestId('file-list-empty')).toBeDefined();
        expect(screen.getByTestId('content-placeholder').textContent).toBe(
            'Drop a text file anywhere to get started.',
        );
        expect(screen.queryByTestId('tab-bar')).toBeNull();
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
        expect(screen.queryByTestId('drop-overlay')).toBeNull();
    });

    it('opens a file dropped anywhere on the dashboard (global drop → sidebar entry + editor)', async () => {
        render(<ScribbleDashboard />);

        const file = new File(['dropped anywhere'], 'anywhere.txt', { type: 'text/plain' });
        // Drop targets the full-viewport root — files can enter anywhere
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [file] },
        });

        // The file appears in the LEFT sidebar and the editor (single
        // contributor → direct render, no plugin tab bar) fills the pane
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-anywhere.txt')).toBeDefined();
        });
        expect(readEditorText()).toBe('dropped anywhere');
        expect(screen.queryByTestId('tab-bar')).toBeNull();
    });

    it('hides the drop overlay once a file is open', async () => {
        render(<ScribbleDashboard />);

        // Drag in progress → overlay shows even before any file is open
        fireEvent.dragOver(screen.getByTestId('dashboard-root'));
        expect(screen.getByTestId('drop-overlay')).toBeDefined();

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['content'], 'open.txt', { type: 'text/plain' })],
            },
        });

        // Drop resets the drag state → overlay disappears and the editor
        // takes over (waitFor the async file read pipeline to open the file)
        await waitFor(() => {
            expect(screen.getByTestId('text-reader-editor')).toBeDefined();
        });
        expect(screen.queryByTestId('drop-overlay')).toBeNull();
    });

    it('adds each dropped file to the sidebar, activating the latest drop', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        });

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'two.txt', { type: 'text/plain' })] },
        });

        // Two sidebar entries; the latest drop is active in the editor
        await waitFor(() => {
            expect(readEditorText()).toBe('second');
        });
        expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-two.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-two.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(screen.getByTestId('sidebar-file-one.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('loads every file in a single multi-file drop, not just the first', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                    new File(['gamma'], 'gamma.txt', { type: 'text/plain' }),
                ],
            },
        });

        // All three files get their own sidebar entry, in drop order
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-alpha.txt')).toBeDefined();
        });
        expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-gamma.txt')).toBeDefined();

        // The last file in the drop is the active entry and is in the editor
        expect(screen.getByTestId('sidebar-file-gamma.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(readEditorText()).toBe('gamma');
    });

    it('selects a sidebar entry on click and switches the editor content', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha content'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta content'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(readEditorText()).toBe('beta content');
        });

        // Click the alpha entry → it becomes active and the editor switches
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));

        await waitFor(() => {
            expect(readEditorText()).toBe('alpha content');
        });
        expect(screen.getByTestId('sidebar-file-alpha.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(screen.getByTestId('sidebar-file-beta.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('removes a sidebar entry via its × and falls back to the most recent remaining entry', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(readEditorText()).toBe('beta');
        });

        // Remove beta (the active entry) → alpha becomes active
        fireEvent.click(screen.getByTestId('remove-file-beta.txt'));

        await waitFor(() => {
            expect(readEditorText()).toBe('alpha');
        });
        expect(screen.queryByTestId('sidebar-file-beta.txt')).toBeNull();
        expect(screen.getByTestId('sidebar-file-alpha.txt')).toBeDefined();
    });

    it('removes the last sidebar entry and returns to the empty drop-only state', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['alpha'], 'alpha.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(readEditorText()).toBe('alpha');
        });

        fireEvent.click(screen.getByTestId('remove-file-alpha.txt'));

        await waitFor(() => {
            expect(screen.getByTestId('content-placeholder')).toBeDefined();
        });
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
        expect(screen.getByTestId('file-list-empty')).toBeDefined();
    });

    it('shows the dashed overlay only while dragging (no idle-state outline)', async () => {
        render(<ScribbleDashboard />);

        // Idle: no outline at all
        expect(screen.queryByTestId('drop-overlay')).toBeNull();

        // Drag in progress → accent overlay with the label
        fireEvent.dragOver(screen.getByTestId('dashboard-root'));
        expect(screen.getByTestId('drop-overlay').textContent).toBe('Drop to open a file');

        // Drag leaves → overlay unmounts entirely
        fireEvent.dragLeave(screen.getByTestId('dashboard-root'));

        await waitFor(() => {
            expect(screen.queryByTestId('drop-overlay')).toBeNull();
        });
    });

    it('renders the footer with the versioned product name and the loaded plugin count', () => {
        render(<ScribbleDashboard />);

        // Footer layout matches FormatterDashboard: LEFT side = product name
        // with the version suffix, RIGHT side = loaded count. Two plugins
        // register by default (sidebar + text-reader). The version suffix
        // comes from the compile-time __APP_VERSION__ constant
        // (vitest.config.ts `define` reads it from package.json); building
        // the expected string from the SAME constant keeps the assertion
        // version-agnostic so package version bumps never break this test.
        const footer = screen.getByTestId('dashboard-footer');
        expect(footer.textContent).toBe(`Scribble Dashboard v${__APP_VERSION__}2 plugins loaded`);
    });

    it('opens pasted text as a Clipboard sidebar entry', async () => {
        render(<ScribbleDashboard />);

        // Simulate a paste with a text payload — the dashboard's
        // document-level paste listener turns it into a "Clipboard" entry
        fireEvent.paste(document.body, {
            clipboardData: {
                getData: (type: string) => (type === 'text/plain' ? 'pasted content' : ''),
                items: [],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-Clipboard')).toBeDefined();
        });
        // The Clipboard entry is active and its content fills the editor
        expect(screen.getByTestId('sidebar-file-Clipboard').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(readEditorText()).toBe('pasted content');
    });

    it('replaces the Clipboard entry content on a repeated paste instead of duplicating it', async () => {
        render(<ScribbleDashboard />);

        fireEvent.paste(document.body, {
            clipboardData: {
                getData: (type: string) => (type === 'text/plain' ? 'first paste' : ''),
                items: [],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-Clipboard')).toBeDefined();
        });

        fireEvent.paste(document.body, {
            clipboardData: {
                getData: (type: string) => (type === 'text/plain' ? 'second paste' : ''),
                items: [],
            },
        });

        // Same name → openFile replaces the entry's content; still exactly
        // one Clipboard entry, now showing the newest paste
        await waitFor(() => {
            expect(readEditorText()).toBe('second paste');
        });
        expect(screen.getAllByTestId('sidebar-file-Clipboard')).toHaveLength(1);
    });

    it('opens pasted files through the normal drop pipeline alongside text', async () => {
        render(<ScribbleDashboard />);

        const file = new File(['file payload'], 'pasted.txt', { type: 'text/plain' });
        fireEvent.paste(document.body, {
            clipboardData: {
                getData: (type: string) => (type === 'text/plain' ? 'text payload' : ''),
                items: [
                    {
                        kind: 'file',
                        getAsFile: () => file,
                    },
                ],
            },
        });

        // Both payloads processed: text → Clipboard entry, file → its own
        // entry. The file entry is opened LAST, so it wins focus (richer
        // payload).
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-pasted.txt').getAttribute('aria-pressed')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('sidebar-file-Clipboard')).toBeDefined();
        expect(readEditorText()).toBe('file payload');
    });

    it('ignores paste events with an empty clipboard', () => {
        render(<ScribbleDashboard />);

        fireEvent.paste(document.body, {
            clipboardData: {
                getData: () => '',
                items: [],
            },
        });

        // Nothing usable → no Clipboard entry, no session change
        expect(screen.queryByTestId('sidebar-file-Clipboard')).toBeNull();
        expect(screen.queryByTestId('drop-overlay')).toBeNull();
    });
});
