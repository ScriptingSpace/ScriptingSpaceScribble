import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { ScribbleDashboard } from './ScribbleDashboard';

afterEach(() => {
    cleanup();
});

describe('ScribbleDashboard', () => {
    it('renders the dashboard header', () => {
        render(<ScribbleDashboard />);

        // The title also appears in the footer — assert on the header heading
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scribble Dashboard');
        expect(
            screen.getByText('Drop a .txt file anywhere — it opens in the editor.'),
        ).toBeDefined();
    });

    it('renders no plugin chrome when no file is open (drop-only flow)', () => {
        render(<ScribbleDashboard />);

        // No tabs, no editor — only the dashed outline communicates the
        // drop affordance
        expect(screen.queryByTestId('tab-bar')).toBeNull();
        expect(screen.queryByTestId('text-reader-editor')).toBeNull();
        expect(screen.getByTestId('drop-outline')).toBeDefined();
    });

    it('opens a file dropped anywhere on the dashboard (global drop → tab + editor)', async () => {
        render(<ScribbleDashboard />);

        const file = new File(['dropped anywhere'], 'anywhere.txt', { type: 'text/plain' });
        // Drop targets the full-viewport root — files can enter anywhere
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [file] },
        });

        // The file session opens in its own tab, editor fills the content area
        await waitFor(() => {
            const editor = screen.getByTestId('text-reader-editor');
            expect(editor.querySelector('.cm-content')?.textContent).toBe('dropped anywhere');
        });
        expect(screen.getByTestId('file-tab-anywhere.txt')).toBeDefined();
    });

    it('hides the dashed outline once a file is open', async () => {
        render(<ScribbleDashboard />);

        expect(screen.getByTestId('drop-outline')).toBeDefined();

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['content'], 'open.txt', { type: 'text/plain' })],
            },
        });

        // Outline disappears as soon as a file is open
        await waitFor(() => {
            expect(screen.queryByTestId('drop-outline')).toBeNull();
        });
        expect(screen.getByTestId('text-reader-editor')).toBeDefined();
    });

    it('gives each dropped file its own tab', async () => {
        render(<ScribbleDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-tab-one.txt')).toBeDefined();
        });

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'two.txt', { type: 'text/plain' })] },
        });

        // Two tabs; the latest drop is active in the editor
        await waitFor(() => {
            expect(screen.getByTestId('file-tab-two.txt').getAttribute('aria-selected')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('file-tab-one.txt')).toBeDefined();
        const editor = screen.getByTestId('text-reader-editor');
        expect(editor.querySelector('.cm-content')?.textContent).toBe('second');
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

        // All three files get their own tab, in drop order
        await waitFor(() => {
            expect(screen.getByTestId('file-tab-alpha.txt')).toBeDefined();
        });
        expect(screen.getByTestId('file-tab-beta.txt')).toBeDefined();
        expect(screen.getByTestId('file-tab-gamma.txt')).toBeDefined();

        // The last file in the drop is the active tab and is in the editor
        expect(screen.getByTestId('file-tab-gamma.txt').getAttribute('aria-selected')).toBe('true');
        const editor = screen.getByTestId('text-reader-editor');
        expect(editor.querySelector('.cm-content')?.textContent).toBe('gamma');
    });

    it('shows the dashed drop outline across the content area at all times', () => {
        render(<ScribbleDashboard />);

        // The outline lives inside the content area (between header and
        // footer), inset from the edges, and is always present — idle state
        // has no label / scrim
        const outline = screen.getByTestId('drop-outline');
        expect(outline).toBeDefined();
        expect(outline.textContent).toBe('');
    });

    it('intensifies the outline while dragging and calms it on leave', async () => {
        render(<ScribbleDashboard />);

        fireEvent.dragOver(screen.getByTestId('dashboard-root'));

        expect(screen.getByTestId('drop-outline').textContent).toBe('Drop to open a file');

        fireEvent.dragLeave(screen.getByTestId('dashboard-root'));

        await waitFor(() => {
            expect(screen.getByTestId('drop-outline').textContent).toBe('');
        });
    });

    it('renders the footer with the loaded plugin count', () => {
        render(<ScribbleDashboard />);

        const footer = screen.getByTestId('dashboard-footer');
        expect(footer.textContent).toBe('Scribble Dashboard1 plugin loaded');
    });
});
