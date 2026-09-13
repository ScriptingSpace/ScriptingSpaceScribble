import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useStateHook } from '@presource/react';
import {
    TypeScriptViewerFeature,
    TypeScriptEditorSurface,
    isTypeScriptFile,
} from './TypeScriptViewerFeature';
import { ScribbleFileProvider, scribbleFileStore } from '../../functions';
import type { ScribbleFile } from '../../functions';

// The run pipeline is MOCKED at the worker-facade boundary — the real
// jsRunner spawns a module worker (jsdom has no Worker; it would fall back
// to main-thread eval, but mocking keeps the test hermetic and lets us
// assert the exact result the panel renders).
const { runJsAsyncMock } = vi.hoisted(() => ({ runJsAsyncMock: vi.fn() }));

vi.mock('../../functions/jsRunner', async (importOriginal) => {
    // Keep the rest of the functions barrel intact (store, palette, …) —
    // only the worker facade is replaced
    const actual = await importOriginal<typeof import('../../functions')>();
    return {
        ...actual,
        runJsAsync: (...args: Parameters<typeof runJsAsyncMock>) => runJsAsyncMock(...args),
    };
});

afterEach(() => {
    cleanup();
});

// Reads the CodeMirror document text out of the TypeScript editor container
// (same .cm-content probe the dashboard tests use — see
// src/dashboards/ScribbleDashboard.test.tsx readEditorText)
const readEditorText = (): string => {
    const editor = screen.getByTestId('typescript-editor');
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
// does. The open-* buttons simulate drops of the respective files.
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
                data-testid="drop-ts"
                onClick={() =>
                    session.openFile({
                        name: 'answer.ts',
                        content: 'const answer: number = 42;',
                        kind: 'text' as const,
                        mime: 'text/plain',
                    })
                }
            />
            <button
                type="button"
                data-testid="drop-js"
                onClick={() =>
                    session.openFile({
                        name: 'script.js',
                        content: 'let x = 1;',
                        kind: 'text' as const,
                        mime: 'text/plain',
                    })
                }
            />
            <button
                type="button"
                data-testid="drop-tsx"
                onClick={() =>
                    session.openFile({
                        name: 'widget.tsx',
                        content: 'const el = <div>hi</div>;',
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
            {/* Selection-only probes: selectFile re-focuses an entry WITHOUT
                re-opening it (openFile with the same name REPLACES the
                content — using it to switch back would silently wipe any
                edit made in between) */}
            <button
                type="button"
                data-testid="select-ts"
                onClick={() => session.selectFile('answer.ts')}
            />
            <button
                type="button"
                data-testid="select-js"
                onClick={() => session.selectFile('script.js')}
            />
            <StoreEditButton />
        </ScribbleFileProvider>
    );
};

describe('isTypeScriptFile (extension matcher)', () => {
    // Pure predicate — no harness needed. Exact contract values: positive
    // cases cover every supported extension + case-insensitivity; negative
    // cases guard against over-matching.
    it('matches .ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs case-insensitively, nothing else', () => {
        expect(isTypeScriptFile({ name: 'answer.ts', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'widget.tsx', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'script.js', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'component.jsx', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'module.mts', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'legacy.cts', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'esm.mjs', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'cjs.cjs', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'COMPONENT.TSX', content: '' })).toBe(true);
        expect(isTypeScriptFile({ name: 'Answer.TS', content: '' })).toBe(true);
        // Negative: lookalike extensions must NOT match (endsWith is exact)
        expect(isTypeScriptFile({ name: 'notes.txt', content: '' })).toBe(false);
        expect(isTypeScriptFile({ name: 'data.json', content: '' })).toBe(false);
        expect(isTypeScriptFile({ name: 'readme.md', content: '' })).toBe(false);
        expect(isTypeScriptFile({ name: 'app.tsw', content: '' })).toBe(false);
        expect(isTypeScriptFile({ name: 'noextension', content: '' })).toBe(false);
    });
});

describe('TypeScriptViewerFeature', () => {
    it('registers itself as a renderFile content plugin in the registry', async () => {
        // Import inside the test so vitest module isolation gives a fresh registry
        const { getScribblePlugins } = await import('../../functions');
        const { TypeScriptViewerFeature: FreshFeature } = await import(
            './TypeScriptViewerFeature'
        );

        render(
            <Harness>
                <FreshFeature />
            </Harness>,
        );

        const plugin = getScribblePlugins().find((entry) => entry.id === 'typescript-viewer');
        // Must exist with the exact definition the dashboard executes —
        // matches (the extension predicate) + renderFile (the editor surface)
        expect(plugin).toEqual({
            id: 'typescript-viewer',
            label: 'Typescript',
            title: 'TypeScript / JavaScript Editor',
            description: undefined,
            slots: undefined,
            matches: isTypeScriptFile,
            renderFile: plugin?.renderFile,
        });
    });

    it('renders nothing when no file is open (drop-only flow)', () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        expect(screen.queryByTestId('typescript-viewer-session')).toBeNull();
        expect(screen.queryByTestId('typescript-editor')).toBeNull();
    });

    it('renders the full-area editor with the file content for an open .ts file', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        // Simulates the dashboard's global drop opening answer.ts
        fireEvent.click(screen.getByTestId('drop-ts'));

        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });
        expect(screen.getByTestId('typescript-viewer-session')).toBeDefined();
        // The feature no longer renders its own tab strip — files live in
        // the LEFT sidebar, plugin tabs are owned by the dashboard
        expect(screen.queryByTestId('tab-bar')).toBeNull();
    });

    it('follows the active file switch between .ts and .js files (grammar re-pick)', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });

        // Switch to the .js file — the editor content follows AND the
        // grammar re-picks (the extensions array is rebuilt per file name;
        // CodeMirror re-parses the doc under the new grammar)
        fireEvent.click(screen.getByTestId('drop-js'));
        await waitFor(() => {
            expect(readEditorText()).toBe('let x = 1;');
        });

        // And back to the .ts file
        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });
    });

    it('renders the editor for a .tsx file (JSX grammar variant)', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-tsx'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const el = <div>hi</div>;');
        });
        expect(screen.getByTestId('typescript-editor')).toBeDefined();
    });

    it('reflects edits pushed through the shared store for the active file', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });

        // Same path the CodeMirror onChange handler uses
        fireEvent.click(screen.getByTestId('store-edit-button'));

        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });

    it('keeps edits in the session: an edit on the .ts file survives switching to .js and back', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        // Open BOTH files first (the latest drop wins focus → .js is active)
        fireEvent.click(screen.getByTestId('drop-ts'));
        fireEvent.click(screen.getByTestId('drop-js'));
        await waitFor(() => {
            expect(readEditorText()).toBe('let x = 1;');
        });

        // Focus the .ts file (selection only) and edit it via the store
        // (the CodeMirror onChange path)
        fireEvent.click(screen.getByTestId('select-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });
        fireEvent.click(screen.getByTestId('store-edit-button'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });

        // Switch to .js (selection only — the .ts entry keeps its edited
        // content) then back — the .ts edit must be intact
        fireEvent.click(screen.getByTestId('select-js'));
        await waitFor(() => {
            expect(readEditorText()).toBe('let x = 1;');
        });
        fireEvent.click(screen.getByTestId('select-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('edited via store');
        });
    });
});

describe('TypeScriptEditorSurface (direct render)', () => {
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
                <TypeScriptEditorSurface
                    file={{ name: 'direct.ts', content: 'type A = string;', kind: 'text' }}
                />
            </ScribbleFileProvider>,
        );

        await waitFor(() => {
            expect(readEditorText()).toBe('type A = string;');
        });
    });
});

describe('Run button + output panel (mocked runJsAsync)', () => {
    it('passes the live editor content + isTypeScript=true for a .ts file and renders the result', async () => {
        runJsAsyncMock.mockResolvedValue({
            logs: ['[log] 42'],
            error: null,
            durationMs: 7,
        });

        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });

        fireEvent.click(screen.getByTestId('typescript-run'));

        // The facade received the CURRENT file content + the TS flag
        // (.ts → isTypeScript true for Sucrase)
        expect(runJsAsyncMock).toHaveBeenCalledTimes(1);
        expect(runJsAsyncMock).toHaveBeenCalledWith('const answer: number = 42;', true);

        // Output panel renders the captured log + duration readout. The
        // panel's textContent includes the "Output" header label — the
        // exact full-panel string is asserted.
        await waitFor(() => {
            expect(screen.getByTestId('typescript-output')).toBeDefined();
        });
        expect(screen.getByTestId('typescript-output').textContent).toBe('Output[log] 42');
        expect(screen.getByTestId('typescript-run').textContent).toBe('Run');
        // No error flag on a clean run
        expect(screen.queryByTestId('typescript-output-error-flag')).toBeNull();
    });

    it('passes isTypeScript=false for a .js file', async () => {
        runJsAsyncMock.mockResolvedValue({ logs: [], error: null, durationMs: 1 });

        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-js'));
        await waitFor(() => {
            expect(readEditorText()).toBe('let x = 1;');
        });

        fireEvent.click(screen.getByTestId('typescript-run'));

        // Pure JS → no TypeScript transform for Sucrase
        await waitFor(() => {
            expect(runJsAsyncMock).toHaveBeenCalledWith('let x = 1;', false);
        });
    });

    it('disables the button while a run is in flight and renders the error line on failure', async () => {
        // Deferred promise — the run stays in flight until we resolve it
        let resolveRun!: (value: { logs: string[]; error: string | null; durationMs: number }) => void;
        runJsAsyncMock.mockReturnValue(
            new Promise((resolve) => {
                resolveRun = resolve;
            }),
        );

        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });

        fireEvent.click(screen.getByTestId('typescript-run'));

        // In flight: label switches, button disabled
        expect(screen.getByTestId('typescript-run').textContent).toBe('Running…');
        expect((screen.getByTestId('typescript-run') as HTMLButtonElement).disabled).toBe(true);

        // Resolve with a failing run — error flag + orange error line
        resolveRun({ logs: [], error: 'TypeError: x is not a function', durationMs: 3 });
        await waitFor(() => {
            expect(screen.getByTestId('typescript-output-error-flag')).toBeDefined();
        });
        expect(screen.getByTestId('typescript-output').textContent).toBe(
            'OutputerrorTypeError: x is not a function',
        );
        // Button re-enabled with the idle label
        expect(screen.getByTestId('typescript-run').textContent).toBe('Run');
        expect((screen.getByTestId('typescript-run') as HTMLButtonElement).disabled).toBe(false);
    });

    it('does not render the output panel before the first run', async () => {
        render(
            <Harness>
                <TypeScriptViewerFeature />
            </Harness>,
        );

        fireEvent.click(screen.getByTestId('drop-ts'));
        await waitFor(() => {
            expect(readEditorText()).toBe('const answer: number = 42;');
        });

        expect(screen.queryByTestId('typescript-output')).toBeNull();
        expect(screen.queryByTestId('typescript-run')).toBeDefined();
    });
});
