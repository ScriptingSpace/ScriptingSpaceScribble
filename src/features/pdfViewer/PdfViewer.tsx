import React, { useEffect } from 'react';
import { arrayCreate } from '@presource/core';
import { styledComponent, useReferenceHook, useStateHook } from '@presource/react';
// PDFDocumentProxy type import is TYPE-ONLY (erased at build time) — it never
// pulls the pdfjs-dist runtime into the bundle graph
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
    decodeDataUrl,
    PALETTE_ACCENT,
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_MUTED,
    PALETTE_WELL,
} from '../../functions';
import { usePdfDocument } from './usePdfDocument';

// ─── Zoom / rotation constants ───────────────────────────────────────────────

// Zoom bounds (multiplier, 1 = 100%) and multiplicative step per click —
// geometric stepping keeps equal numbers of clicks equidistant in log space.
// Same window the Formatter viewer uses (cross-reference:
// distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/PdfViewer.tsx).
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;

// Clamp helper — zoom never leaves the [MIN_ZOOM, MAX_ZOOM] window
const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

// Rotations cycle through quarter turns only
export type Rotation = 0 | 90 | 180 | 270;

// ─── Styled shell (Scribble palette — see src/functions/palette.ts) ──────────

// Viewer root — fills the content pane the dashboard hands it edge-to-edge
// (100% × 100%, overflow hidden): the scroll area below owns the ONLY
// scrollbar, mirroring how the editor session fills the pane.
const ViewerRoot = styledComponent('div', {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    background: PALETTE_WELL,
    color: PALETTE_TEXT_BODY,
    overflow: 'hidden' as const,
    minHeight: 0,
});

// Toolbar — wraps (narrow panes) instead of clipping controls
const Toolbar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 8,
    padding: '8px 12px',
    flexShrink: 0,
    background: PALETTE_SURFACE,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
});

// Toolbar divider — groups the control clusters (page / zoom / actions)
const ToolbarDivider = styledComponent('span', {
    width: 1,
    height: 20,
    background: PALETTE_BORDER,
    flexShrink: 0,
});

// Generic small toolbar button. Cast mirrors the Formatter's ToolButton /
// the dashboard's TabButton pattern: the element only needs standard button
// attributes (type/onClick/disabled/data-testid).
const ToolButton = styledComponent('button', {
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_WELL,
    color: PALETTE_TEXT_BODY,
    cursor: 'pointer',
    flexShrink: 0,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Muted numeric readouts (page indicator, zoom %) — tabular numerals keep
// the width stable while paging
const ToolLabel = styledComponent('span', {
    fontSize: 12,
    color: PALETTE_TEXT_MUTED,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
});

// Scrollable page column — the only scrolling region in the viewer (both
// axes: zoomed-in pages overflow horizontally too). NO align-items center:
// a flex-centered child WIDER than the container overflows on BOTH sides and
// the left overflow is unreachable by scrolling (the "off-centered page"
// bug the Formatter documents). Children center themselves via auto margins.
const ScrollArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflow: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
    padding: 16,
}) as unknown as React.FC<
    React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }
>;

// Page frame — white "paper" behind the transparent canvas. Width/height come
// from the computed pdf.js viewport as STRING pixel values: function props
// pass through styleStructure, which converts raw NUMBERS to rem (see
// @presource/react styled-component) — strings pass through untouched.
// Cast adds `ref` — styledComponent's React.FC type omits it, but Emotion's
// styled() forwards refs at runtime (same pattern as the Formatter viewer).
const PageFrame = styledComponent<{ width: string; height: string }>('div', {
    position: 'relative' as const,
    background: '#ffffff',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
    flexShrink: 0,
    // Horizontal centering via auto margins — when the frame is WIDER than
    // the container the margins collapse to 0 (flush left, scrollable right)
    margin: '0 auto' as const,
    width: ({ width }: { width: string }) => width,
    height: ({ height }: { height: string }) => height,
}) as unknown as React.FC<
    { width: string; height: string } & React.HTMLAttributes<HTMLDivElement> & {
        ref?: React.Ref<HTMLDivElement>;
    }
>;

// Canvas fill — the canvas backing store is sized by the render effect
// (viewport × devicePixelRatio); CSS stretches it to the frame so the
// resolution can differ from the layout size. MUST be the styled canvas
// (CSS width/height 100%): a plain canvas displays at its ATTRIBUTE
// (backing-store) size and bleeds past the frame on DPR > 1 machines.
const PageCanvas = styledComponent('canvas', {
    display: 'block' as const,
    width: '100%',
    height: '100%',
});

// Loading / error notice — centered. Loading reads as "in progress" in the
// ACCENT blue; errors stay muted (document-level failure text is the message
// itself, no extra alarm styling in this minimal viewer).
const LoadingNotice = styledComponent('div', {
    fontSize: 14,
    color: PALETTE_ACCENT,
    textAlign: 'center' as const,
    padding: 32,
    margin: 'auto' as const,
});

const ErrorNotice = styledComponent('div', {
    fontSize: 14,
    color: PALETTE_TEXT_MUTED,
    textAlign: 'center' as const,
    padding: 32,
    margin: 'auto' as const,
});

// ─── Per-page canvas renderer ────────────────────────────────────────────────

export type PdfPageCanvasProps = {
    doc: PDFDocumentProxy;
    pageNumber: number;
    scale: number;
    rotation: Rotation;
};

// Renders ONE page onto its canvas.
//
// EAGER RENDERING (v1 decision): every mounted page paints immediately —
// no IntersectionObserver gate. The Formatter viewer
// (distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/PdfViewer.tsx)
// has the lazy variant with the `typeof IntersectionObserver === 'undefined'`
// guard (jsdom / ancient browsers fall back to immediate rendering); for this
// first Scribble version eager rendering is simpler and correct everywhere,
// at the cost of painting off-screen pages of large documents.
//
// jsdom note: canvas.getContext('2d') returns null there → the paint no-ops
// safely after the frame is sized; tests assert structural elements only.
const PdfPageCanvas = ({ doc, pageNumber, scale, rotation }: PdfPageCanvasProps) => {
    // Frame element — used to locate the canvas inside it
    const frame = useReferenceHook<HTMLDivElement | null>(null);
    // Viewport dimensions (CSS px) — null until the page proxy resolves
    const dims = useStateHook<{ width: number; height: number } | null>(null);

    // Render effect: load the page proxy, size the frame, paint the canvas at
    // device-pixel-ratio resolution. Cancelled on cleanup (scale/rotation
    // change or unmount) so in-flight paints never write into a stale canvas.
    useEffect(() => {
        let cancelled = false;
        // RenderTask has .cancel(); kept as a loose shape to avoid importing
        // the RenderTask type into every signature
        let task: { cancel: () => void } | null = null;

        doc
            .getPage(pageNumber)
            .then((page) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale, rotation });
                // Size the frame FIRST so layout is correct even while the
                // paint is still in flight
                dims({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
                const canvas = frame()?.querySelector('canvas');
                if (!canvas) return;
                // Backing store at device pixel ratio (capped at 2 — beyond
                // that the memory cost dwarfs the visual gain)
                const ratio = Math.min(window.devicePixelRatio || 1, 2);
                canvas.width = Math.floor(viewport.width * ratio);
                canvas.height = Math.floor(viewport.height * ratio);
                const context = canvas.getContext('2d');
                // jsdom (and canvas-less environments) return null → no-op
                if (!context) return;
                const renderTask = page.render({
                    canvasContext: context,
                    viewport,
                    // Scale the paint by the same ratio the backing store uses
                    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
                });
                task = renderTask;
                // Cancelled renders reject — swallow (cleanup already handled it)
                return renderTask.promise.catch(() => undefined);
            })
            .catch(() => {
                // Page-level failure stays silent here; document-level errors
                // surface through usePdfDocument's error state
            });

        return () => {
            cancelled = true;
            task?.cancel();
        };
        // dims/frame are stable useStateHook/useReferenceHook handles — only
        // the render inputs matter
    }, [doc, pageNumber, scale, rotation]);

    return (
        <PageFrame
            data-testid={`pdf-page-${pageNumber}`}
            // Unknown dims yet → zero-size frame; the first render sizes it
            // (placeholder spinner omitted on purpose)
            width={dims() ? `${dims()!.width}px` : '0px'}
            height={dims() ? `${dims()!.height}px` : '0px'}
            ref={frame as unknown as React.Ref<HTMLDivElement>}
        >
            <PageCanvas data-testid={`pdf-canvas-${pageNumber}`} />
        </PageFrame>
    );
};

// ─── Viewer ──────────────────────────────────────────────────────────────────

export type PdfViewerProps = {
    // Original file name — reused verbatim for the download button
    name: string;
    // PDF content as a data URL (the readTextFile strategy for kind 'pdf')
    content: string;
};

// Simplified but robust PDF viewer. Deliberately OMITTED vs the Formatter
// viewer (cross-reference:
// distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/PdfViewer.tsx):
// text search, fit-width computation and the page-jump input — this first
// version keeps the core toolbar (page nav / zoom / rotate / download) and
// the same rendering robustness patterns (DPR-capped backing store, CSS-sized
// canvas, cancelled-render swallowing).
export const PdfViewer = ({ name, content }: PdfViewerProps) => {
    // Document lifecycle from the data URL
    const document = usePdfDocument(content);
    const { status, doc, numPages, error } = document;

    // ── View state ──
    const zoom = useStateHook(1); // multiplier, 1 = 100%
    const rotation = useStateHook<Rotation>(0);
    const currentPage = useStateHook(1);
    // pageNumber → frame element map, filled by the page refs (scroll target)
    const pageNodes = useReferenceHook<Map<number, HTMLDivElement>>(new Map());

    // Page navigation: clamped, then the target frame is scrolled into view.
    // jsdom has no scrollIntoView — guarded so tests can drive navigation.
    // (The Formatter additionally SYNCs currentPage from the scroll position;
    // this version keeps the indicator state-driven.)
    const goToPage = (target: number) => {
        if (!Number.isFinite(target) || target < 1 || target > numPages) return;
        const node = pageNodes().get(target);
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'start' });
        }
        currentPage(target);
    };

    // Zoom buttons step geometrically, clamped to [MIN_ZOOM, MAX_ZOOM]
    const zoomBy = (factor: number) => {
        zoom(clampZoom(zoom() * factor));
    };

    // Rotate cycles 0 → 90 → 180 → 270 → 0
    const rotateBy = () => rotation(((rotation() + 90) % 360) as Rotation);

    // Download: decode the data URL → Blob → synthetic anchor click (same
    // lifecycle the Formatter's viewer and Export PDF button use). The object
    // URL is revoked right after the click — the browser has already accepted
    // the download by then.
    const handleDownload = () => {
        const bytes = decodeDataUrl(content);
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const anchor = globalThis.document.createElement('a');
        anchor.href = url;
        anchor.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
        globalThis.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    // ── Derived labels ──
    const zoomPercent = `${Math.round(zoom() * 100)}%`;

    return (
        <ViewerRoot data-testid="pdf-viewer">
            <Toolbar data-testid="pdf-toolbar">
                {/* Page navigation cluster */}
                <ToolButton
                    type="button"
                    data-testid="pdf-page-prev"
                    aria-label="Previous page"
                    disabled={status !== 'ready' || currentPage() <= 1}
                    onClick={() => goToPage(currentPage() - 1)}
                >
                    ‹
                </ToolButton>
                <ToolLabel data-testid="pdf-page-indicator">
                    {status === 'ready' ? `${currentPage()} / ${numPages}` : '– / –'}
                </ToolLabel>
                <ToolButton
                    type="button"
                    data-testid="pdf-page-next"
                    aria-label="Next page"
                    disabled={status !== 'ready' || currentPage() >= numPages}
                    onClick={() => goToPage(currentPage() + 1)}
                >
                    ›
                </ToolButton>
                <ToolbarDivider />
                {/* Zoom cluster */}
                <ToolButton
                    type="button"
                    data-testid="pdf-zoom-out"
                    aria-label="Zoom out"
                    disabled={status !== 'ready'}
                    onClick={() => zoomBy(1 / ZOOM_STEP)}
                >
                    −
                </ToolButton>
                <ToolLabel data-testid="pdf-zoom-label">{zoomPercent}</ToolLabel>
                <ToolButton
                    type="button"
                    data-testid="pdf-zoom-in"
                    aria-label="Zoom in"
                    disabled={status !== 'ready'}
                    onClick={() => zoomBy(ZOOM_STEP)}
                >
                    +
                </ToolButton>
                <ToolButton
                    type="button"
                    data-testid="pdf-rotate"
                    aria-label="Rotate clockwise"
                    disabled={status !== 'ready'}
                    onClick={rotateBy}
                >
                    Rotate
                </ToolButton>
                <ToolbarDivider />
                {/* Download cluster */}
                <ToolButton
                    type="button"
                    data-testid="pdf-download"
                    disabled={status !== 'ready'}
                    onClick={handleDownload}
                >
                    Download
                </ToolButton>
            </Toolbar>

            {/* Body: loading / error / page column. The `!doc` guard doubles
                as the type narrowing for the ready branch (status === 'ready'
                implies a document, but TS cannot see that through the hook). */}
            {status === 'loading' ? (
                <LoadingNotice data-testid="pdf-loading">Loading PDF…</LoadingNotice>
            ) : status === 'error' || !doc ? (
                <ErrorNotice data-testid="pdf-error">
                    {name}: {error ?? 'The PDF could not be opened.'}
                </ErrorNotice>
            ) : (
                <ScrollArea
                    data-testid="pdf-scroll"
                    /* EAGER: every page mounts and paints immediately — see
                       the PdfPageCanvas comment for the lazy-render tradeoff */
                >
                    {arrayCreate(numPages).map((_, index) => {
                        const pageNumber = index + 1;
                        return (
                            <div
                                key={pageNumber}
                                ref={(node) => {
                                    // Register/unregister the frame for the
                                    // prev/next scroll navigation
                                    if (node) pageNodes().set(pageNumber, node);
                                    else pageNodes().delete(pageNumber);
                                }}
                            >
                                <PdfPageCanvas
                                    doc={doc}
                                    pageNumber={pageNumber}
                                    scale={zoom()}
                                    rotation={rotation()}
                                />
                            </div>
                        );
                    })}
                </ScrollArea>
            )}
        </ViewerRoot>
    );
};
