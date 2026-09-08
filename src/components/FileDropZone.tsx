import React from 'react';
import { styledComponent } from '@presource/react';

// Visual + interaction shell of a drop zone. It is fully prop-driven so any
// feature can reuse it: the feature owns the file-reading logic and simply
// wires the drag/keyboard handlers in (see features/textReader).
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
        border: ({ dragOver }) => `2px dashed ${dragOver ? '#38bdf8' : '#334155'}`,
        background: ({ dragOver }) => (dragOver ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.4)'),
        color: '#94a3b8',
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
    color: '#e2e8f0',
});

const ZoneHint = styledComponent('div', {
    fontSize: 12,
    color: '#64748b',
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
