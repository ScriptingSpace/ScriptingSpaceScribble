import { styledComponent } from '@presource/react';
import {
    PALETTE_WELL,
    PALETTE_BORDER,
    PALETTE_TEXT_BODY,
} from '../functions';

// Plain-text output surface. Renders dropped file content verbatim — no
// pattern extraction yet (patterns are a planned plugin capability, see
// readme.md "Roadmap"). Warm palette: deep well background + warm ivory text.
const Pre = styledComponent('pre', {
    margin: 0,
    padding: 12,
    borderRadius: 8,
    background: PALETTE_WELL,
    border: `1px solid ${PALETTE_BORDER}`,
    color: PALETTE_TEXT_BODY,
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: 320,
    overflow: 'auto' as const,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
});

export type PlainTextOutputProps = {
    text: string;
};

export const PlainTextOutput = ({ text }: PlainTextOutputProps) => (
    <Pre data-testid="plain-text-output">{text}</Pre>
);
