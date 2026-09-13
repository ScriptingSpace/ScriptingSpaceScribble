import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { registerScribblePlugin } from '../../functions';
import {
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_TEXT_MUTED,
    PALETTE_WELL,
} from '../../functions';
import type { ScribbleFileLike } from '../../functions';

// ─── Zoom constants ──────────────────────────────────────────────────────────

// Zoom bounds (multiplier, 1 = 100%) and the multiplicative step per click.
// Multiplicative (geometric) stepping keeps equal click counts equidistant in
// log space — the same model the Formatter's PDF viewer uses
// (cross-reference: distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/
// PdfViewer.tsx MIN_ZOOM/MAX_ZOOM/ZOOM_STEP — identical values).
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;

// Clamp helper — zoom never leaves the [MIN_ZOOM, MAX_ZOOM] window (edge
// case: mashing Zoom In at 4× or Zoom Out at 0.25× stays pinned at the bound)
const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

// ─── Styled shell ────────────────────────────────────────────────────────────

// Viewer root — fills the content pane the dashboard hands it (100% × 100%),
// column layout: toolbar row on top, viewport below (same ViewerRoot pattern
// as the Formatter's PdfViewer).
const ViewerRoot = styledComponent('div', {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
    minHeight: 0,
});

// Toolbar row — small control strip above the viewport. Surface chrome
// (PALETTE_SURFACE + hairline border) distinguishes it from the deep-well
// image area underneath; muted text keeps it secondary to the image.
const Toolbar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 8,
    padding: '6px 12px',
    flexShrink: 0,
    background: PALETTE_SURFACE,
    borderBottom: `1px solid ${PALETTE_BORDER}`,
});

// Small toolbar button — mirrors the Formatter PdfViewer's ToolButton family
// (padding '4px 10px', fontSize 12, borderRadius 6, 1px border, pointer
// cursor). No `active` prop needed here: the three zoom controls are momentary
// actions, not toggles.
const ToolButton = styledComponent('button', {
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: `1px solid ${PALETTE_BORDER}`,
    background: PALETTE_SURFACE,
    color: PALETTE_TEXT_MUTED,
    cursor: 'pointer',
    flexShrink: 0,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Zoom % readout — muted label between the zoom buttons; tabular numerals
// keep the width stable while clicking (same ToolLabel pattern as PdfViewer)
const ToolLabel = styledComponent('span', {
    fontSize: 12,
    color: PALETTE_TEXT_MUTED,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
});

// Viewport — the ONLY scrolling region: overflow auto so a zoomed image
// scrolls in both axes (the dashboard root has overflow hidden). Flex
// centering centers the image at 100% zoom; the deep PALETTE_WELL background
// makes the image area read as a "well" behind the surface chrome.
const Viewport = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    overflow: 'auto' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: PALETTE_WELL,
});

// The <img> itself — objectFit contain + maxWidth/maxHeight 100% keep any
// image fully visible at 100% zoom regardless of aspect ratio; display block
// avoids the inline-image baseline gap inside the flex wrapper.
const ImageCanvas = styledComponent('img', {
    display: 'block' as const,
    objectFit: 'contain' as const,
    maxWidth: '100%',
    maxHeight: '100%',
}) as unknown as React.FC<React.ImgHTMLAttributes<HTMLImageElement>>;

// Defensive notice — rendered ONLY when an image-kind file arrives without a
// data URL (should not happen via the normal read pipeline — readTextFile
// stores data URLs for kind 'image', see src/functions/readTextFile.ts — but
// a hand-crafted session state could bypass it). Muted like the JsonViewer's
// invalid hint (cross-reference: JsonViewerFeature.tsx InvalidHint).
const InvalidNotice = styledComponent('div', {
    fontSize: 13,
    color: PALETTE_TEXT_MUTED,
    textAlign: 'center' as const,
    padding: 32,
    margin: 'auto' as const,
});

// ─── Image surface ───────────────────────────────────────────────────────────

// Renders the active image file: a zoom toolbar + a centered, scrollable
// viewport. Mounted by the dashboard inside the content pane as a plugin tab
// (renderFile → this component). Zoom is purely VISUAL state — it never
// touches the shared session (an image is not editable text).
export const ImageViewerSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    // Zoom multiplier state via @presource/react's useStateHook (same hook
    // style as the dashboard + PdfViewer). 1 = 100%.
    const zoom = useStateHook(1);

    // Data-URL guard: the render pipeline guarantees image content is a data
    // URL, but renderFile's contract (check below) tolerates anything — this
    // branch is the defensive fallback so a malformed file degrades to a
    // notice instead of a broken <img>.
    const isDataUrl = file.content.startsWith('data:');

    // Zoom handlers — multiplicative step, clamped to the bounds. Reset snaps
    // exactly back to 1 (100%) regardless of the current value.
    const zoomIn = () => zoom(clampZoom(zoom() * ZOOM_STEP));
    const zoomOut = () => zoom(clampZoom(zoom() / ZOOM_STEP));
    const zoomReset = () => zoom(1);

    // Label rounds to the nearest whole percent (1.2 × 1.2 = 1.44 → '144%',
    // 1 / 1.2 ≈ 0.8333 → '83%')
    const zoomPercent = `${Math.round(zoom() * 100)}%`;

    if (!isDataUrl) {
        return <InvalidNotice data-testid="image-invalid">Image data unavailable.</InvalidNotice>;
    }

    return (
        <ViewerRoot data-testid="image-viewer">
            <Toolbar data-testid="image-toolbar">
                {/* Zoom cluster: out → label → in → reset, mirroring the
                    PdfViewer's zoom cluster ordering */}
                <ToolButton
                    type="button"
                    data-testid="image-zoom-out"
                    aria-label="Zoom out"
                    onClick={zoomOut}
                >
                    −
                </ToolButton>
                <ToolLabel data-testid="image-zoom-label">{zoomPercent}</ToolLabel>
                <ToolButton
                    type="button"
                    data-testid="image-zoom-in"
                    aria-label="Zoom in"
                    onClick={zoomIn}
                >
                    +
                </ToolButton>
                <ToolButton
                    type="button"
                    data-testid="image-zoom-reset"
                    aria-label="Reset zoom"
                    onClick={zoomReset}
                >
                    Reset
                </ToolButton>
            </Toolbar>
            <Viewport data-testid="image-viewport">
                {/* INLINE STYLE EXCEPTION: the transform value is a truly
                    dynamic one-off (changes on every zoom click) — this is the
                    one sanctioned inline style={} in this feature; everything
                    else is styledComponent. The wrapper (not the <img> itself)
                    carries the transform so the img's objectFit/max rules stay
                    in styledComponent untouched. Note: CSS transforms do not
                    affect layout, so the zoomed overflow is scrollable via the
                    viewport's overflow auto. */}
                <div style={{ transform: `scale(${zoom()})` }}>
                    <ImageCanvas
                        data-testid="image-canvas"
                        src={file.content}
                        alt={file.name}
                    />
                </div>
            </Viewport>
        </ViewerRoot>
    );
};

// ─── Plugin registration ─────────────────────────────────────────────────────

// Extension matcher: claims files the read pipeline classified as 'image'
// (detectFileKind returns 'image' for any MIME image/* — which covers .svg
// delivered as image/svg+xml too, so no extension fallback is needed; see
// src/functions/readTextFile.ts). Pure predicate — no side effects.
export const isImageFile = (file: ScribbleFileLike): boolean => file.kind === 'image';

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "Image" tab for image files whose content is a
// data URL (the read pipeline's image strategy); anything else contributes
// nothing (null) so the generic tabs take over.
registerScribblePlugin({
    id: 'image-viewer',
    label: 'Image',
    title: 'Image Viewer',
    matches: isImageFile,
    renderFile: (file) =>
        file.kind === 'image' && file.content.startsWith('data:') ? (
            <ImageViewerSurface file={file} />
        ) : null,
});
