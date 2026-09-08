import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ScribbleDashboard } from './ScribbleDashboard';

afterEach(() => {
    cleanup();
});

describe('ScribbleDashboard', () => {
    it('renders the dashboard header', () => {
        render(<ScribbleDashboard />);

        expect(screen.getByText('Scribble Dashboard')).toBeDefined();
        expect(
            screen.getByText('Drop a .txt file anywhere — it opens in the editor.'),
        ).toBeDefined();
    });

    it('renders every registered plugin as a panel without needless explanation', () => {
        render(<ScribbleDashboard />);

        // The text-reader feature self-registers via the features barrel import
        const panels = screen.getAllByTestId('plugin-panel');
        expect(panels).toHaveLength(1);
        // Title only — the plugin registers without a description line
        expect(screen.getByText('Text File Reader')).toBeDefined();
        expect(screen.queryByText('Drop a .txt file anywhere to open and edit it.')).toBeNull();
    });

    it('opens a file dropped anywhere on the dashboard (global drop → editor)', async () => {
        render(<ScribbleDashboard />);

        const file = new File(['dropped anywhere'], 'anywhere.txt', { type: 'text/plain' });
        // Drop targets the full-viewport root, not any specific panel
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [file] },
        });

        // The file session opens and the plugin renders the code editor
        await waitFor(() => {
            const editor = screen.getByTestId('text-reader-editor');
            expect(editor.querySelector('.cm-content')?.textContent).toBe('dropped anywhere');
        });
        expect(screen.getByText('Editing: anywhere.txt')).toBeDefined();
    });

    it('shows the dashed drop outline across the entire viewport at all times', () => {
        render(<ScribbleDashboard />);

        // The outline is always present (drop-anywhere affordance), idle state
        expect(screen.getByTestId('drop-outline')).toBeDefined();
        // No label / scrim while no drag is in progress
        expect(screen.getByTestId('drop-outline').textContent).toBe('');
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

    it('renders the plugin browse affordance inside its panel', () => {
        render(<ScribbleDashboard />);

        // The text-reader plugin's browse button + hidden input live in the panel
        expect(screen.getByTestId('browse-button')).toBeDefined();
        expect(screen.getByTestId('file-input')).toBeDefined();
    });
});
