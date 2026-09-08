import React from 'react';
import { styledComponent, useReferenceHook } from '@presource/react';
import { CodeEditor } from '../../components';
import { readTextFile, registerScribblePlugin, scribbleFileStore } from '../../functions';

// Hidden file input behind the drop zone — clicking the zone (or pressing
// Enter/Space on it) opens the native file browser as a fallback to dragging.
// styledComponent forwards refs at runtime, but its TS type is React.FC, so we
// cast to a ForwardRefExoticComponent (documented pattern in presource docs).
const HiddenInput = styledComponent('input', { display: 'none' }) as unknown as
    React.ForwardRefExoticComponent<
        React.RefAttributes<HTMLInputElement> & React.InputHTMLAttributes<HTMLInputElement>
    >;

const FeatureStack = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 0,
});

const SessionHeader = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
});

const FileNameLabel = styledComponent('div', {
    fontSize: 12,
    color: '#7dd3fc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
});

const CloseButton = styledComponent('button', {
    flexShrink: 0,
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'border-color 150ms ease, color 150ms ease',
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Browse affordance shown when no file is open. Drop-anywhere is handled
// globally by the dashboard's viewport-wide dashed outline, so this panel
// only needs a plain button that opens the native file dialog.
const BrowseHint = styledComponent('button', {
    alignSelf: 'flex-start',
    padding: '8px 14px',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid #334155',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'border-color 150ms ease, color 150ms ease',
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

export const TextReaderFeature: React.FC = () => {
    // Shared open-file session — owned by the dashboard, consumed here.
    // When a file is open we show the code editor; otherwise the browse button.
    const store = scribbleFileStore();
    // Ref to the hidden file input so the browse button can open the browser dialog
    const inputReference = useReferenceHook<HTMLInputElement | null>(null);

    // Reads a browsed file and opens it in the shared session
    const openBrowsedFile = (file: File) => {
        readTextFile(file).then(store.openFile);
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) openBrowsedFile(file);
    };

    const file = store.file;

    return (
        <FeatureStack>
            <HiddenInput
                ref={inputReference}
                type="file"
                accept=".txt,.text,text/plain"
                onChange={handleInputChange}
                data-testid="file-input"
            />
            {file ? (
                <>
                    <SessionHeader>
                        <FileNameLabel>Editing: {file.name}</FileNameLabel>
                        <CloseButton
                            type="button"
                            onClick={store.closeFile}
                            data-testid="close-file-button"
                        >
                            Close
                        </CloseButton>
                    </SessionHeader>
                    <CodeEditor
                        value={file.content}
                        onChange={store.updateContent}
                        testId="text-reader-editor"
                    />
                </>
            ) : (
                <BrowseHint
                    type="button"
                    onClick={() => inputReference()?.click()}
                    data-testid="browse-button"
                >
                    Browse for a .txt file — or drop it anywhere
                </BrowseHint>
            )}
        </FeatureStack>
    );
};

// Plug-and-play registration: importing this module plugs the feature into the
// dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
registerScribblePlugin({
    id: 'text-reader',
    title: 'Text File Reader',
    Component: TextReaderFeature,
});
