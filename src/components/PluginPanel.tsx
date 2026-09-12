import React from 'react';
import { styledComponent } from '@presource/react';
import {
    PALETTE_BORDER,
    PALETTE_SURFACE,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_MUTED,
} from '../functions';

// Modular panel that wraps every plugin rendered by the dashboard.
// Gives all features a consistent card look: title, description, content slot.
// Warm palette: raised surface + warm border + soft warm shadow.
const Panel = styledComponent('section', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    background: PALETTE_SURFACE,
    border: `1px solid ${PALETTE_BORDER}`,
    boxShadow: '0 8px 24px rgba(28, 27, 26, 0.35)',
    boxSizing: 'border-box' as const,
    minWidth: 0,
});

const PanelTitle = styledComponent('h2', {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: PALETTE_TEXT_BRIGHT,
});

const PanelDescription = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: PALETTE_TEXT_MUTED,
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
