import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { styledComponent } from '@presource/react';

// Container frame for the CodeMirror instance — keeps the editor visually
// consistent with the dark panel theme used across the dashboard. flex: 1 +
// minHeight: 0 let it stretch to the parent's remaining space when used in a
// full-area session layout.
const EditorContainer = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #1e293b',
    background: '#0b1120',
    textAlign: 'left' as const,
    minWidth: 0,
});

export type CodeEditorProps = {
    // Controlled document content
    value: string;
    // Called by CodeMirror on every edit — wire this to the file store
    onChange?: (value: string) => void;
    testId?: string;
    // Editor height. '100%' fills the parent (used by full-area sessions);
    // defaults to a fixed 320px card height.
    height?: string;
};

// Code editor surface for opened files, built on CodeMirror 6 via the
// @uiw/react-codemirror wrapper (line numbers, bracket matching, history,
// syntax-aware editing out of the box — no hand-rolled textarea logic).
export const CodeEditor = ({ value, onChange, testId, height }: CodeEditorProps) => (
    <EditorContainer data-testid={testId ?? 'code-editor'}>
        <CodeMirror
            value={value}
            onChange={onChange}
            theme="dark"
            height={height ?? '320px'}
            style={{ height: '100%' }}
        />
    </EditorContainer>
);
