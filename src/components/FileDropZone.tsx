import React from 'react';
import { styledComponent } from '@presource/react';
import {
    PALETTE_ACCENT,
    PALETTE_BORDER,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_FAINT,
    PALETTE_TEXT_MUTED,
} from '../functions';

// Visual + interaction shell of a drop zone. It is fully prop-driven so any
// feature can reuse it: the feature owns the file-reading logic and simply
// wires the drag/keyboard handlers in (see features/textReader). Tokyo Night
// palette: blue dashed accent on drag-over, muted resting state.
const Zone = styledComponent<{ dragOver: boolean }>(
    'div',
    {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 160,
        padding: 24,
        borderRadius: 12,
        border: ({ dragOver }) => `2px dashed ${dragOver ? PALETTE_ACCENT : PALETTE_BORDER}`,
        background: ({ dragOver }) =>
            dragOver ? 'rgba(122, 162, 247, 0.08)' : 'rgba(26, 27, 38, 0.4)',
        color: PALETTE_TEXT_MUTED,
        cursor: 'pointer',
        textAlign: 'center' as const,
        transition: 'border-color 150ms ease, background 150ms ease',
        boxSizing: 'border-box' as const,
    },
// The Zone element only needs the dragOver style prop plus passthrough HTML
// attributes (title/hint are rendered as children via ZoneTitle/ZoneHint)
) as unknown as React.FC<{ dragOver: boolean } & React.HTMLAttributes<HTMLDivElement>>;

const ZoneTitle = styledComponent('div', {
    fontSize: 15,
    fontWeight: 600,
    color: PALETTE_TEXT_BODY,
});

const ZoneHint = styledComponent('div', {
    fontSize: 12,
    color: PALETTE_TEXT_FAINT,
});

export type FileDropZoneProps = {
    dragOver: boolean;
    title: string;
    hint: string;
    onClick?: () => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
};

// Accessible drop zone: role="button" + keyboard activation so the hidden file
// input can also be opened via Enter/Space when the zone receives focus.
export const FileDropZone: React.FC<FileDropZoneProps> = ({
    dragOver,
    title,
    hint,
    onClick,
    onDrop,
    onDragOver,
    onDragLeave,
}) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter and Space both trigger the click-to-browse behaviour
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
        }
    };

    return (
        <Zone
            dragOver={dragOver}
            onClick={onClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            data-testid="file-drop-zone"
        >
            <ZoneTitle>{title}</ZoneTitle>
            <ZoneHint>{hint}</ZoneHint>
        </Zone>
    );
};
