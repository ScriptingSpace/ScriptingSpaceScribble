import React from 'react';
import { styledComponent } from '@presource/react';
import { CodeEditor } from '../../components';
import { registerScribblePlugin, scribbleFileStore } from '../../functions';

// ─── Tab strip ───────────────────────────────────────────────────────────────

const TabBar = styledComponent('div', {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
    borderBottom: '1px solid #1e293b',
    overflowX: 'auto' as const,
    minWidth: 0,
});

// One tab per open file. Active tab is raised (solid background, bright text)
// and sits on the tab bar's bottom line.
const Tab = styledComponent<{ active: boolean }>(
    'div',
    {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        fontSize: 12,
        borderRadius: '8px 8px 0 0' as const,
        border: '1px solid #1e293b',
        borderBottom: 'none' as const,
        background: ({ active }) => (active ? '#16233b' : 'transparent'),
        color: ({ active }) => (active ? '#e2e8f0' : '#64748b'),
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        userSelect: 'none' as const,
        transition: 'background 150ms ease, color 150ms ease',
    },
) as unknown as React.FC<
    { active: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>;

const TabClose = styledComponent('button', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    fontSize: 12,
    lineHeight: 1,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    flexShrink: 0,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// ─── Session layout ──────────────────────────────────────────────────────────

// Full-area session layout: tab strip on top, editor fills the rest of the
// content area (CodeMirror height flows to the bottom of the region)
const SessionLayout = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: '16px 16px 24px',
    height: '100%',
    width: '100%',
    boxSizing: 'border-box' as const,
    minWidth: 0,
});

const EditorStack = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    paddingTop: 8,
});

export const TextReaderFeature: React.FC = () => {
    // Shared multi-file session — owned by the dashboard, consumed here.
    // Files enter ONLY by dropping them onto the page (global drop →
    // readTextFile → openFile in the dashboard shell). Each file gets its own
    // tab; the editor shows the active tab's file.
    const store = scribbleFileStore();
    const { files, activeFileId } = store;

    // No open files → render nothing (the dashed content-area outline on the
    // dashboard is the drop affordance in this state)
    if (files.length === 0) return null;

    // Active tab content; falls back to the most recent tab defensively
    const active =
        files.find((entry) => entry.name === activeFileId) ?? files[files.length - 1];

    return (
        <SessionLayout data-testid="text-reader-session">
            <TabBar data-testid="tab-bar" role="tablist">
                {files.map((entry) => (
                    <Tab
                        key={entry.name}
                        active={entry.name === active.name}
                        onClick={() => store.selectFile(entry.name)}
                        role="tab"
                        aria-selected={entry.name === active.name}
                        data-testid={`file-tab-${entry.name}`}
                    >
                        {entry.name}
                        <TabClose
                            type="button"
                            aria-label={`Close ${entry.name}`}
                            // Stop propagation so closing a tab doesn't also
                            // switch the selection to it
                            onClick={(event) => {
                                event.stopPropagation();
                                store.closeFile(entry.name);
                            }}
                            data-testid={`close-tab-${entry.name}`}
                        >
                            ×
                        </TabClose>
                    </Tab>
                ))}
            </TabBar>
            <EditorStack>
                <CodeEditor
                    value={active.content}
                    // Edits flow back into the session, keyed by tab name
                    onChange={(content) => store.updateContent(active.name, content)}
                    testId="text-reader-editor"
                    height="100%"
                />
            </EditorStack>
        </SessionLayout>
    );
};

// Plug-and-play registration: importing this module plugs the feature into the
// dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
registerScribblePlugin({
    id: 'text-reader',
    title: 'Text File Reader',
    Component: TextReaderFeature,
});
