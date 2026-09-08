import React from 'react';
import { styledComponent } from '@presource/react';

// Modular panel that wraps every plugin rendered by the dashboard.
// Gives all features a consistent card look: title, description, content slot.
const Panel = styledComponent('section', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    background: '#111c30',
    border: '1px solid #1e293b',
    boxShadow: '0 8px 24px rgba(2, 6, 23, 0.35)',
    boxSizing: 'border-box' as const,
    minWidth: 0,
});

const PanelTitle = styledComponent('h2', {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#f1f5f9',
});

const PanelDescription = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#94a3b8',
});

export type PluginPanelProps = {
    title: string;
    // Optional — plugins that need no explanation render title only
    description?: string;
    children?: React.ReactNode;
};

export const PluginPanel: React.FC<PluginPanelProps> = ({ title, description, children }) => (
    <Panel data-testid="plugin-panel">
        <PanelTitle>{title}</PanelTitle>
        {description ? <PanelDescription>{description}</PanelDescription> : null}
        {children}
    </Panel>
);
