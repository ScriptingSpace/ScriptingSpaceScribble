import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { styledComponent } from '@presource/react';

// Container frame for the CodeMirror instance — keeps the editor visually
// consistent with the dark panel theme used across the dashboard.
const EditorContainer = styledComponent('div', {
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
};

// Code editor surface for opened files, built on CodeMirror 6 via the
// @uiw/react-codemirror wrapper (line numbers, bracket matching, history,
// syntax-aware editing out of the box — no hand-rolled textarea logic).
export const CodeEditor = ({ value, onChange, testId }: CodeEditorProps) => (
    <EditorContainer data-testid={testId ?? 'code-editor'}>
        <CodeMirror value={value} onChange={onChange} theme="dark" height="320px" />
    </EditorContainer>
);
