import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { MarkdownViewerSurface, isMarkdownFile } from './MarkdownViewerFeature';
import { getScribblePlugins } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

afterEach(() => {
    cleanup();
});

// Minimal harness: renders the plugin's renderFile output directly (the same
// node the dashboard mounts inside its TabPanel) for a given file-like shape.
// No provider needed — MarkdownViewerSurface is a pure function of the file
// prop (no store access, unlike the editor surfaces).
const RenderHarness = ({ file }: { file: ScribbleFileLike & { kind?: string } }) => {
    // Resolve the renderFile from the registry exactly as the dashboard does
    // (cross-reference: src/dashboards/ScribbleDashboard.tsx — plugins loop,
    // renderFile(activeFile)) so the test exercises the REGISTERED hook,
    // including its kind guard, not just the component.
    const plugin = getScribblePlugins().find((entry) => entry.id === 'markdown-viewer');
    if (!plugin?.renderFile) return null;
    return <>{plugin.renderFile(file)}</>;
};

describe('MarkdownViewerFeature', () => {
    it('registers the markdown-viewer plugin with the exact definition', () => {
        const plugin = getScribblePlugins().find((entry) => entry.id === 'markdown-viewer');
        expect(plugin).toBeDefined();
        expect(plugin?.id).toBe('markdown-viewer');
        expect(plugin?.label).toBe('Markdown');
        expect(plugin?.title).toBe('Markdown Viewer');
        expect(plugin?.matches).toBeDefined();
        expect(plugin?.renderFile).toBeDefined();
    });

    describe('matches()', () => {
        it('claims markdown extensions case-insensitively', () => {
            expect(isMarkdownFile({ name: 'README.md', content: '' })).toBe(true);
            expect(isMarkdownFile({ name: 'readme.markdown', content: '' })).toBe(true);
            expect(isMarkdownFile({ name: 'NOTES.MDOWN', content: '' })).toBe(true);
            expect(isMarkdownFile({ name: 'guide.mkdn', content: '' })).toBe(true);
        });

        it('rejects non-markdown names — including look-alike suffixes', () => {
            expect(isMarkdownFile({ name: 'readme.txt', content: '' })).toBe(false);
            // .bak suffix after .md must NOT match (extension is terminal)
            expect(isMarkdownFile({ name: 'notes.md.bak', content: '' })).toBe(false);
            expect(isMarkdownFile({ name: 'md', content: '' })).toBe(false);
        });
    });

    describe('renderFile()', () => {
        it('returns null for a non-text file (kind: binary)', () => {
            const plugin = getScribblePlugins().find((entry) => entry.id === 'markdown-viewer');
            const node = plugin?.renderFile?.({
                name: 'blob.bin',
                content: 'raw dump',
                kind: 'binary',
            });
            expect(node).toBeNull();
        });

        it('renders sanitized markdown HTML for a text file', () => {
            render(
                <RenderHarness
                    file={{
                        name: 'README.md',
                        content: '# Title\n\n**bold** text',
                        kind: 'text',
                    }}
                />,
            );
            const view = screen.getByTestId('markdown-view');
            // Exact heading + strong rendering through marked
            const h1 = view.querySelector('h1');
            expect(h1?.textContent).toBe('Title');
            const strong = view.querySelector('strong');
            expect(strong?.textContent).toBe('bold');
        });

        it('renders a link with the exact href', () => {
            render(
                <RenderHarness
                    file={{
                        name: 'links.md',
                        content: '[x](http://a)',
                        kind: 'text',
                    }}
                />,
            );
            const link = screen.getByTestId('markdown-view').querySelector('a');
            expect(link).not.toBeNull();
            expect(link?.getAttribute('href')).toBe('http://a');
        });

        it('strips active content — no <script> tags, no onerror handlers', () => {
            render(
                <RenderHarness
                    file={{
                        name: 'evil.md',
                        content:
                            '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n# Safe',
                        kind: 'text',
                    }}
                />,
            );
            const html = screen.getByTestId('markdown-view').innerHTML;
            // XSS boundary assertions — the sanitized payload must contain
            // neither the script tag nor the event-handler attribute
            expect(html).not.toContain('<script');
            expect(html).not.toContain('onerror');
            // Benign content still renders after sanitization
            expect(screen.getByTestId('markdown-view').querySelector('h1')?.textContent).toBe(
                'Safe',
            );
        });
    });
});
