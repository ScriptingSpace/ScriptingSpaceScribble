import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import { YamlViewerFeature } from './YamlViewerFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the YAML editor container
// (same .cm-content probe the dashboard tests use — see
// src/dashboards/ScribbleDashboard.test.tsx readEditorText)
const readEditorText = (): string => {
    const editor = screen.getByTestId('yaml-editor');
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

// Second probe: pushes INVALID YAML (`'a: [1, 2'` — unbalanced flow sequence)
// through the same store path, to exercise the parse-error banner without
// typing into contenteditable in jsdom. Also in-provider for the same
// invalid-hook-call reason.
const StoreInvalidButton = () => {
    const store = scribbleFileStore();
    return (
        <button
            type="button"
            data-testid="store-invalid-button"
            onClick={() => {
                const active = store.files.find((entry) => entry.name === store.activeFileId);
                if (active) store.updateContent(active.name, "'a: [1, 2");
            }}
        />
    );
};

// Harness mirroring the real dashboard multi-file session: owns the session
// state and injects it into the shared provider exactly like ScribbleDashboard
// does. Files enter ONLY via the dashboard's global drop — the open-* buttons
// here simulate drops of config.yaml / config.json.
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
                data-testid="drop-yaml"
                onClick={() =>
                    session.openFile({
                        name: 'config.yaml',
                        content: 'a: 1',
                        kind: 'text' as const,
                        mime: 'text/yaml',
                    })
                }
            />
            <button
                type="button"
                data-testid="drop-json"
                onClick={() =>
                    session.openFile({
                        name: 'config.json',
                        content: '{"a": 1}',
                        kind: 'text' as const,
                        mime: 'application/json',
                    })
                }
            />
            <StoreEditButton />
            <StoreInvalidButton />
        </ScribbleFileProvider>
    );
};

describe('YamlViewerFeature', () => {
    it('matches exactly .yaml/.yml names (case-insensitive), nothing else', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { YamlViewerFeature: FreshFeature } = await import('./YamlViewerFeature');
        const { getScribblePlugins } = await import('../../functions');
        const plugin = getScribblePlugins().find((entry) => entry.id === 'yaml-viewer');
        expect(plugin).toBeDefined();

        const matches = (name: string) => plugin!.matches!({ name, content: '' });
        // Exact contract values — positive cases cover both extensions and
        // case-insensitivity; negative cases guard against over-matching
        expect(matches('config.yaml')).toBe(true);
        expect(matches('deploy.YML')).toBe(true);
        expect(matches('config.json')).toBe(false);
        expect(matches('readme.md')).toBe(false);
        expect(FreshFeature).toBeDefined();
    });

    it('renders the editor with the file content for an open yaml file', async () => {
        render(
            <Harness>
                <YamlViewerFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening config.yaml
        fireEvent.click(screen.getByTestId('drop-yaml'));

        await waitFor(() => {
            expect(readEditorText()).toBe('a: 1');
        });
        // Valid content → NO error banner (silence is the success state)
        expect(screen.queryByTestId('yaml-error-banner')).toBeNull();
    });

    it('renders the error banner for invalid YAML without unmounting the editor', async () => {
        render(
            <Harness>
                <YamlViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-yaml'));
        await waitFor(() => {
            expect(readEditorText()).toBe('a: 1');
        });

        // Push invalid YAML through the store (same path CodeMirror's
        // onChange uses) — `'a: [1, 2'` is an unbalanced flow sequence.
        // The in-provider button avoids an invalid hook call (the store
        // accessor must be captured during render, not in this test body).
        fireEvent.click(screen.getByTestId('store-invalid-button'));

        // Banner appears with the parser's short message…
        await waitFor(() => {
            expect(screen.getByTestId('yaml-error-banner')).toBeDefined();
        });
        // …and the editor STAYS MOUNTED so the user can fix the structure —
        // parse errors must never block editing
        expect(screen.getByTestId('yaml-editor')).toBeDefined();
    });

    it('renders no error banner for valid YAML', async () => {
        render(
            <Harness>
                <YamlViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-yaml'));
        await waitFor(() => {
            expect(readEditorText()).toBe('a: 1');
        });

        expect(screen.queryByTestId('yaml-error-banner')).toBeNull();
    });

    it('reflects edits pushed through the shared store in the editor', async () => {
        render(
            <Harness>
                <YamlViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-yaml'));
        await waitFor(() => {
            expect(readEditorText()).toBe('a: 1');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });
});
