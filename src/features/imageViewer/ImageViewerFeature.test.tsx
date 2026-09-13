import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import {
    ImageViewerSurface,
    isImageFile,
} from './ImageViewerFeature';
import { registerScribblePlugin } from '../../functions';
import type { ScribbleFileLike } from '../../functions';

afterEach(() => {
    cleanup();
});

// The canonical image file shape the read pipeline produces for a dropped
// PNG (readTextFile → kind 'image', content = data URL — see
// src/functions/readTextFile.ts). Reused across the suite.
const pngFile: ScribbleFileLike = {
    name: 'photo.png',
    kind: 'image',
    mime: 'image/png',
    content: 'data:image/png;base64,AAAA',
};

// ─── matches / renderFile contract ───────────────────────────────────────────

describe('ImageViewerFeature plugin contract', () => {
    it('registers the image-viewer plugin with the exact definition', async () => {
        // Import inside the test so vitest module isolation gives a fresh
        // registry (same pattern as TextReaderFeature.test.tsx)
        const { getScribblePlugins } = await import('../../functions');
        await import('./ImageViewerFeature');

        const plugin = getScribblePlugins().find((entry) => entry.id === 'image-viewer');
        expect(plugin).toEqual({
            id: 'image-viewer',
            label: 'Image',
            title: 'Image Viewer',
            description: undefined,
            slots: undefined,
            matches: plugin?.matches,
            renderFile: plugin?.renderFile,
        });
    });

    it('matches() accepts image-kind files and rejects text-kind files', async () => {
        const { getScribblePlugins } = await import('../../functions');
        await import('./ImageViewerFeature');

        const plugin = getScribblePlugins().find((entry) => entry.id === 'image-viewer');
        expect(plugin?.matches?.(pngFile)).toBe(true);
        expect(
            plugin?.matches?.({
                name: 'notes.txt',
                kind: 'text',
                mime: 'text/plain',
                content: 'hello',
            }),
        ).toBe(false);
    });

    it('renderFile() returns the viewer for an image data URL and null otherwise', async () => {
        const { getScribblePlugins } = await import('../../functions');
        await import('./ImageViewerFeature');

        const plugin = getScribblePlugins().find((entry) => entry.id === 'image-viewer');
        expect(plugin?.renderFile?.(pngFile)).not.toBeNull();
        expect(
            plugin?.renderFile?.({ ...pngFile, kind: 'text', content: 'not an image' }),
        ).toBeNull();
        // Image kind but no data URL → null (the defensive notice renders
        // only when the surface itself is mounted directly)
        expect(plugin?.renderFile?.({ ...pngFile, content: 'raw-bytes' })).toBeNull();
    });
});

// ─── Surface behavior ────────────────────────────────────────────────────────

describe('ImageViewerSurface', () => {
    it('mounts the img with the exact data URL src and starts at 100% zoom', () => {
        render(<ImageViewerSurface file={pngFile} />);

        const img = screen.getByTestId('image-canvas') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        expect(img.getAttribute('alt')).toBe('photo.png');
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('100%');
    });

    it('zooms in multiplicatively: two clicks → 144% (1.2 × 1.2 = 1.44, rounded)', () => {
        render(<ImageViewerSurface file={pngFile} />);

        fireEvent.click(screen.getByTestId('image-zoom-in'));
        fireEvent.click(screen.getByTestId('image-zoom-in'));
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('144%');
    });

    it('zooms out from 100% → 83% (1 / 1.2 ≈ 0.8333 → Math.round = 83)', () => {
        render(<ImageViewerSurface file={pngFile} />);

        fireEvent.click(screen.getByTestId('image-zoom-out'));
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('83%');
    });

    it('reset snaps back to 100% after zooming', () => {
        render(<ImageViewerSurface file={pngFile} />);

        fireEvent.click(screen.getByTestId('image-zoom-in'));
        fireEvent.click(screen.getByTestId('image-zoom-in'));
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('144%');
        fireEvent.click(screen.getByTestId('image-zoom-reset'));
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('100%');
    });

    it('clamps zoom at the bounds (0.25–4) instead of escaping them', () => {
        render(<ImageViewerSurface file={pngFile} />);

        // Mash Zoom In well past the 4× ceiling — the label pins at 400%
        for (let index = 0; index < 20; index += 1) {
            fireEvent.click(screen.getByTestId('image-zoom-in'));
        }
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('400%');
        // And back down past the 0.25× floor — pins at 25%
        for (let index = 0; index < 40; index += 1) {
            fireEvent.click(screen.getByTestId('image-zoom-out'));
        }
        expect(screen.getByTestId('image-zoom-label').textContent).toBe('25%');
    });

    it('renders the invalid notice when image content is not a data URL', () => {
        render(
            <ImageViewerSurface
                file={{ ...pngFile, content: 'raw-binary-bytes' }}
            />,
        );

        expect(screen.getByTestId('image-invalid').textContent).toBe(
            'Image data unavailable.',
        );
        expect(screen.queryByTestId('image-canvas')).toBeNull();
    });
});
