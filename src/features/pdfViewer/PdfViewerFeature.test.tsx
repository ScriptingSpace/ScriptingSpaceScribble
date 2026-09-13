import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── pdf.js mock (hoisted before the module imports) ─────────────────────────
// Two pages, deterministic viewports. `render` records its params so paint
// behavior can be asserted without a real canvas.
//
// The mock targets the LOCAL access layer ('./pdfjs') — NOT 'pdfjs-dist'
// directly. pdfjs-dist is externalized (untransformed node_modules ESM), and
// mocked external modules lose their named bindings when another module
// re-imports them by name (verified in the Formatter suite:
// distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/PdfViewer.test.tsx
// — `import { getDocument } from 'pdfjs-dist'` inside pdfjs.ts resolves to
// undefined). ./pdfjs is the single module that touches pdfjs-dist, so
// mocking it covers the whole plugin tree.

const pdfjs = vi.hoisted(() => {
    const renderCalls: { pageNumber: number; transform?: number[] }[] = [];

    // Builds a fake page proxy: 612×792 pt at scale 1 (US Letter portrait),
    // quarter-turn rotation swaps the axes
    const makePage = (pageNumber: number) => ({
        getViewport: ({ scale, rotation }: { scale: number; rotation?: number }) => {
            const swap = rotation === 90 || rotation === 270;
            return {
                width: (swap ? 792 : 612) * scale,
                height: (swap ? 612 : 792) * scale,
                scale,
                rotation,
            };
        },
        render: (params: { transform?: number[] }) => {
            renderCalls.push({ pageNumber, transform: params.transform });
            return { promise: Promise.resolve(), cancel: () => {} };
        },
        getTextContent: async () => ({ items: [] }),
    });

    const pages = [makePage(1), makePage(2)];
    const doc = {
        numPages: pages.length,
        getPage: async (pageNumber: number) => pages[pageNumber - 1],
        destroy: vi.fn(async () => undefined),
    };
    const getDocument = vi.fn(() => ({ promise: Promise.resolve(doc) }));

    return { getDocument, doc, renderCalls, pages };
});

vi.mock('./pdfjs', () => ({
    getDocument: pdfjs.getDocument,
    GlobalWorkerOptions: { workerSrc: '' },
    configurePdfWorker: async () => undefined,
}));

import { PdfViewer } from './PdfViewer';
import { isPdfFile } from './PdfViewerFeature';
import { getScribblePlugins } from '../../functions';

// Valid data URL payload for the fake document — the bytes are never parsed
// by the mocked pdf.js, only the decoding path is exercised
const DATA_URL = 'data:application/pdf;base64,AQIDBA==';

const pdfFile = () => ({
    name: 'doc.pdf',
    kind: 'pdf',
    mime: 'application/pdf',
    content: DATA_URL,
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    pdfjs.renderCalls.length = 0;
});

// ─── Plugin registration (PdfViewerFeature) ──────────────────────────────────

describe('pdf-viewer plugin', () => {
    it('registers itself with the exact definition the dashboard executes', () => {
        // Side-effect import of the feature barrel already happened through
        // './PdfViewerFeature' above — the registry carries the plugin
        const plugin = getScribblePlugins().find((entry) => entry.id === 'pdf-viewer');
        expect(plugin).toEqual({
            id: 'pdf-viewer',
            label: 'Pdf',
            title: 'PDF Viewer',
            description: undefined,
            slots: undefined,
            matches: plugin?.matches,
            renderFile: plugin?.renderFile,
        });
    });

    it('matches() claims kind pdf files only', () => {
        expect(isPdfFile({ name: 'doc.pdf', content: DATA_URL, kind: 'pdf' } as never)).toBe(true);
        expect(isPdfFile({ name: 'note.txt', content: 'plain', kind: 'text' } as never)).toBe(
            false,
        );
    });

    it('renderFile mounts the pdf-viewer for a data-URL pdf', async () => {
        const plugin = getScribblePlugins().find((entry) => entry.id === 'pdf-viewer');
        const node = plugin?.renderFile?.(pdfFile() as never);
        expect(node).not.toBeNull();
        render(<>{node}</>);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });
        expect(screen.getByTestId('pdf-viewer')).toBeDefined();
    });

    it('renderFile contributes nothing for other kinds or non-data content', () => {
        const plugin = getScribblePlugins().find((entry) => entry.id === 'pdf-viewer');
        expect(plugin?.renderFile?.({ ...pdfFile(), kind: 'text', content: 'plain' } as never)).toBeNull();
        // Right kind, wrong content shape → no broken viewer
        expect(plugin?.renderFile?.({ ...pdfFile(), content: '' } as never)).toBeNull();
    });
});

// ─── PdfViewer ───────────────────────────────────────────────────────────────

describe('PdfViewer', () => {
    it('renders the toolbar, page indicator and one frame per page once ready', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);

        // Loading state first, then the full toolbar + page frames
        expect(screen.getByTestId('pdf-loading')).toBeDefined();
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        expect(screen.getByTestId('pdf-page-2')).toBeDefined();
        expect(screen.getByTestId('pdf-canvas-1')).toBeDefined();
        expect(screen.getByTestId('pdf-canvas-2')).toBeDefined();
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
    });

    it('sizes page frames from the pdf.js viewport', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        // Wait for the exact computed frame size — 612×792 at scale 1
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('792px');
    });

    it('navigates pages with the prev/next buttons and clamps at the bounds', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        });

        // Prev on the first page is disabled — no clamping needed
        expect((screen.getByTestId('pdf-page-prev') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByTestId('pdf-page-next'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('2 / 2');

        // Next on the last page is disabled
        expect((screen.getByTestId('pdf-page-next') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByTestId('pdf-page-prev'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
    });

    it('zooms in and out in ×1.2 steps', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
        });

        fireEvent.click(screen.getByTestId('pdf-zoom-in'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('120%');

        // One step back: 120 / 1.2 = 100 (float artifacts rounded away)
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');

        // Out-steps from 100%: first click 83.33… → 83% (Math.round of the
        // float), second click 83 / 1.2 = 69.44 → 69%
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('83%');
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('69%');
    });

    it('clamps zoom at the 25%–400% bounds', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
        });

        // Down-steps: 83% → 69% → 58% → 48% → 40% → 33% → 28%,
        // and the 8th click (23.3) clamps at exactly 25%
        for (let index = 0; index < 7; index += 1) {
            fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        }
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('28%');
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('25%');

        // Up-steps from 25% never display above the ceiling — clamps at 400%
        // (25 × 1.2^15 = 462.6 → clamped on the 15th click)
        for (let index = 0; index < 16; index += 1) {
            fireEvent.click(screen.getByTestId('pdf-zoom-in'));
        }
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('400%');
    });

    it('rotates pages in quarter turns and swaps the frame axes', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });

        fireEvent.click(screen.getByTestId('pdf-rotate'));

        // 90° rotation: 612×792 becomes 792×612
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('792px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('612px');

        // Three more clicks wrap back to 0° — original frame returns
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('792px');
    });

    it('re-renders pages with a device-pixel-ratio transform', async () => {
        // jsdom's canvas has no 2d context (getContext returns null) — stub it
        // so the pdf.js render call actually fires and can be asserted
        const contextSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({ fillRect: () => {} } as unknown as CanvasRenderingContext2D);

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(pdfjs.renderCalls.length).toBe(2);
        });

        // jsdom devicePixelRatio is 1 → no dpr transform is passed
        expect(pdfjs.renderCalls[0].transform).toBeUndefined();
        expect(pdfjs.renderCalls[0].pageNumber).toBe(1);
        expect(pdfjs.renderCalls[1].pageNumber).toBe(2);
        contextSpy.mockRestore();
    });

    it('no-ops the paint safely when the canvas has no 2d context (raw jsdom)', async () => {
        // NO getContext stub here — jsdom returns null and the render effect
        // must size the frames and bail out WITHOUT throwing
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });
        expect(pdfjs.renderCalls.length).toBe(0);
        expect(screen.getByTestId('pdf-page-2').getAttribute('height')).toBe('792px');
    });

    it('shows an error notice when the document cannot be opened', async () => {
        pdfjs.getDocument.mockImplementationOnce(() => ({
            promise: Promise.reject(new Error('Invalid PDF structure')),
        }));

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);

        await waitFor(() => {
            expect(screen.getByTestId('pdf-error')).toBeDefined();
        });
        expect(screen.getByTestId('pdf-error').textContent).toBe(
            'doc.pdf: Invalid PDF structure',
        );
        // No page frames render in the error state
        expect(screen.queryByTestId('pdf-page-1')).toBeNull();
    });

    it('destroys the document when the viewer unmounts', async () => {
        const { unmount } = render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        unmount();
        expect(pdfjs.doc.destroy).toHaveBeenCalledTimes(1);
    });

    it('downloads the document as a PDF blob with the original file name', async () => {
        // jsdom lacks object URLs — stub the lifecycle and capture the click
        URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
        URL.revokeObjectURL = vi.fn();
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        fireEvent.click(screen.getByTestId('pdf-download'));

        expect(clicked).toHaveLength(1);
        expect(clicked[0].download).toBe('doc.pdf');
        expect(clicked[0].href).toBe('blob:mock-pdf-url');
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe('application/pdf');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
    });
});
