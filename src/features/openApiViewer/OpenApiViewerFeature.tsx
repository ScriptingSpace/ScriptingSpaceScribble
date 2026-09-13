import React from 'react';
// The `yaml` package is ALREADY a dependency (package.json: yaml ^2.9.1) —
// the same parser the YamlViewer feature uses for validation
// (cross-reference: src/features/yamlViewer/YamlViewerFeature.tsx). No new
// npm dependencies are introduced by this feature.
import { parse } from 'yaml';
// @presource/core iteration utilities — used instead of manual for/for-in
// loops throughout (same convention as src/dashboards/ScribbleDashboard.tsx).
import { arrayEach, objectEach, objectHasKey } from '@presource/core';
import { styledComponent } from '@presource/react';
import { registerScribblePlugin } from '../../functions';
import type { ScribbleFileLike } from '../../functions';
// Tokyo Night Storm palette tokens (cross-reference: src/functions/palette.ts)
import {
    PALETTE_ACCENT,
    PALETTE_BORDER,
    PALETTE_CYAN,
    PALETTE_GOLD,
    PALETTE_GREEN,
    PALETTE_SECONDARY,
    PALETTE_SURFACE,
    PALETTE_SURFACE_HOVER,
    PALETTE_TERTIARY,
    PALETTE_TEXT_BRIGHT,
    PALETTE_TEXT_BODY,
    PALETTE_TEXT_FAINT,
    PALETTE_TEXT_MUTED,
    PALETTE_WELL,
} from '../../functions';

// ─── Spec parsing ────────────────────────────────────────────────────────────

// Structural guard: is the value a plain object (not array/null)? Every field
// access below routes through this — OpenAPI docs in the wild are frequently
// malformed, and a thrown TypeError inside render would crash the whole
// content pane (the plugin contract demands deterministic, side-effect-free
// renders — cross-reference: src/functions/pluginTypes.ts renderFile docs).
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// Parses file content into a spec object: YAML first (the `yaml` package —
// JSON is technically a YAML subset, so most JSON docs parse here too), then
// a JSON.parse fallback for edge cases where the YAML parser rejects valid
// JSON (duplicate keys, tab indentation). Returns null when BOTH fail —
// never throws. Edge case: a scalar YAML document ("just a string") parses
// successfully but is not a record → also null.
const parseSpec = (content: string): Record<string, unknown> | null => {
    // Pass 1: YAML (handles JSON too in practice)
    try {
        const parsed: unknown = parse(content);
        if (isRecord(parsed)) return parsed;
    } catch {
        // YAML failed — fall through to the JSON pass
    }
    // Pass 2: strict JSON
    try {
        const parsed: unknown = JSON.parse(content);
        if (isRecord(parsed)) return parsed;
    } catch {
        // Both parsers failed — not a document we can render
    }
    return null;
};

// OpenAPI marker check on an ALREADY-PARSED spec: OpenAPI 3.x documents carry
// a top-level `openapi` version string; Swagger 2.0 documents carry
// `swagger: '2.0'` (exactly — no other 2.x ever shipped). Anything else is
// just a YAML/JSON file that happens to exist. objectHasKey = own-property
// check (cross-reference: src/functions/pluginRegistry.ts), so inherited
// keys can never masquerade as spec markers.
const isOpenApiSpec = (spec: Record<string, unknown>): boolean =>
    (objectHasKey(spec, 'openapi') && typeof spec.openapi === 'string') ||
    (objectHasKey(spec, 'swagger') && spec.swagger === '2.0');

// Extension guard: only claim .yaml/.yml/.json files (case-insensitive). A
// random .txt/.md file MENTIONING openapi must not match. The $ anchor (no
// trailing content) is why 'spec.yaml.bak' fails — same pattern as
// isMarkdownFile in src/features/markdownViewer/MarkdownViewerFeature.tsx.
const OPENAPI_EXTENSIONS = /\.(yaml|yml|json)$/i;

// ─── Method badge styling ────────────────────────────────────────────────────
// One badge component per HTTP method family, built from a single factory so
// every badge shares the exact same geometry (fontSize/padding/radius) and
// only the COLOR varies. Components are created ONCE at module scope — never
// per render — so React sees stable element types across re-renders.
// Colors follow the task's mapping onto the Tokyo Night palette:
// GET → green, POST → blue (accent), PUT → gold, PATCH → cyan, everything
// else (options/head/…) → muted.

const methodBadge = (color: string): React.FC<React.HTMLAttributes<HTMLSpanElement>> =>
    styledComponent('span', {
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        padding: '2px 6px',
        borderRadius: 4,
        color,
        border: `1px solid ${color}`,
        background: PALETTE_WELL,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineHeight: 1.4,
        whiteSpace: 'nowrap' as const,
    }) as unknown as React.FC<React.HTMLAttributes<HTMLSpanElement>>;

const GET_BADGE = methodBadge(PALETTE_GREEN);
const POST_BADGE = methodBadge(PALETTE_ACCENT);
const PUT_BADGE = methodBadge(PALETTE_GOLD);
// Tokyo Night red — palette.ts exports NO red token, so the hex is inlined
// here deliberately (tokyonight.nvim red1, cross-reference: the palette's
// research comment block in src/functions/palette.ts).
const DELETE_BADGE = methodBadge('#f7768e');
const PATCH_BADGE = methodBadge(PALETTE_CYAN);
// Fallback for methods without a dedicated color (options/head/…)
const OTHER_METHOD_BADGE = methodBadge(PALETTE_TEXT_MUTED);

const METHOD_BADGES: Record<string, React.FC<React.HTMLAttributes<HTMLSpanElement>>> = {
    get: GET_BADGE,
    post: POST_BADGE,
    put: PUT_BADGE,
    delete: DELETE_BADGE,
    patch: PATCH_BADGE,
};

// Canonical method iteration order — NOT document key order. A fixed order
// keeps renders deterministic (plugin contract) and makes badge sequences
// stable/predictable for tests (OpenApiViewerFeature.test.tsx).
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

// ─── Layout ──────────────────────────────────────────────────────────────────

// Root fills the content pane edge-to-edge and owns the VERTICAL scrollbar
// (spec documents are long-form, so the scroll container must be this div —
// same ownership model as MarkdownView in
// src/features/markdownViewer/MarkdownViewerFeature.tsx). The deep well
// background grounds the summary like a rendered document, not an editor.
const Root = styledComponent('div', {
    height: '100%',
    width: '100%',
    boxSizing: 'border-box' as const,
    overflowY: 'auto' as const,
    padding: 16,
    background: PALETTE_WELL,
    color: PALETTE_TEXT_BODY,
    fontSize: 13,
    lineHeight: 1.6,
    textAlign: 'left' as const,
});

// Header block — title + version chips + optional description, closed by an
// orange (PALETTE_TERTIARY) accent rule. The TERTIARY token (drop-overlay
// accent in the palette) gives the header a single warm anchor without
// shouting a full-width alarm.
const Header = styledComponent('div', {
    borderBottom: `2px solid ${PALETTE_TERTIARY}`,
    paddingBottom: 12,
    marginBottom: 16,
});

// API title — the brightest token in the feature (headings own
// PALETTE_TEXT_BRIGHT per the palette's contrast table)
const Title = styledComponent('div', {
    fontSize: 20,
    fontWeight: 600,
    color: PALETTE_TEXT_BRIGHT,
    lineHeight: 1.3,
});

// Chip row under the title: info.version + spec version (openapi/swagger)
const MetaRow = styledComponent('div', {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
});

// Chip factory — same geometry, two color variants below. The border uses
// the chip color at reading strength; the fill stays the surface token so
// chips read as metadata, not buttons.
const chip = (color: string): React.FC<React.HTMLAttributes<HTMLSpanElement>> =>
    styledComponent('span', {
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
        color,
        border: `1px solid ${color}`,
        background: PALETTE_SURFACE,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineHeight: 1.4,
        whiteSpace: 'nowrap' as const,
    }) as unknown as React.FC<React.HTMLAttributes<HTMLSpanElement>>;

// info.version chip — purple (SECONDARY accent: "subtitle/links/info" per
// the palette)
const VersionChip = chip(PALETTE_SECONDARY);
// openapi/swagger version chip — blue (PRIMARY accent)
const SpecChip = chip(PALETTE_ACCENT);

// Optional info.description — plain text only (never dangerouslySetInnerHTML;
// a spec description is untrusted input). pre-wrap preserves the author's
// line breaks without needing a markdown pass.
const Description = styledComponent('div', {
    marginTop: 10,
    color: PALETTE_TEXT_BODY,
    whiteSpace: 'pre-wrap' as const,
});

// Section label — small uppercase faint caption ("Servers", "Paths").
// PALETTE_TEXT_FAINT is decorative-only per the palette's contrast table,
// which is exactly what a section caption is.
const SectionLabel = styledComponent('div', {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: PALETTE_TEXT_FAINT,
});

// Server row — one per server URL. Monospace + cyan (the palette's
// "strings/syntax pop" token) so URLs read as addresses. Surface fill keeps
// rows grounded against the well.
const ServerRow = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 10px',
    marginBottom: 6,
    background: PALETTE_SURFACE,
    border: `1px solid ${PALETTE_BORDER}`,
    borderRadius: 6,
    color: PALETTE_CYAN,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12,
});

// Path row — one per spec.paths entry. Slightly raised fill
// (PALETTE_SURFACE_HOVER — the palette's hover/raised token) distinguishes
// the paths table from the server rows above it. Flex + wrap keeps long path
// strings and their method badges on one visual line when space allows.
const PathRow = styledComponent('div', {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    marginBottom: 6,
    background: PALETTE_SURFACE_HOVER,
    border: `1px solid ${PALETTE_BORDER}`,
    borderRadius: 6,
});

// The path string itself — bright monospace (it is the row's identity)
const PathText = styledComponent('span', {
    color: PALETTE_TEXT_BRIGHT,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
});

// Empty-paths fallback — muted + italic so it reads as absence, not error
// (distinct from the YamlViewer's gold error banner, which signals a PARSE
// failure; an empty paths table is a valid document state).
const EmptyRow = styledComponent('div', {
    padding: '8px 10px',
    color: PALETTE_TEXT_MUTED,
    fontStyle: 'italic' as const,
    fontSize: 12,
});

// Defensive notice — rendered ONLY when the surface is mounted directly with
// content that matches() would have rejected (renderFile gates on matches,
// but a direct caller can bypass it). Mirrors the JsonViewer's InvalidHint
// pattern (cross-reference: src/features/jsonViewer/JsonViewerFeature.tsx).
const InvalidNotice = styledComponent('div', {
    padding: 16,
    fontSize: 13,
    lineHeight: 1.6,
    color: PALETTE_TEXT_MUTED,
});

// ─── Content plugin component ────────────────────────────────────────────────

// Renders the parsed OpenAPI/Swagger document as a read-only summary:
// header (title/version/spec-version/description), server rows, and a paths
// table with per-method badges. Mounted by the dashboard as a plugin tab via
// renderFile (registration below). PURE render — the file is never edited
// here (the Yaml/Editor tabs own editing).
export const OpenApiViewerSurface: React.FC<{ file: ScribbleFileLike }> = ({ file }) => {
    const spec = parseSpec(file.content);

    // Defensive: renderFile only mounts this surface when matches() passed,
    // so spec is normally non-null — but a direct caller (test / legacy
    // import) can bypass the gate. Degrade to a notice instead of crashing.
    if (!spec) {
        return (
            <InvalidNotice data-testid="openapi-invalid">
                This file does not contain a parseable OpenAPI/Swagger document.
            </InvalidNotice>
        );
    }

    // ── Header fields — every access guarded (info may be missing entirely;
    // a spec that matches but lacks info still renders with placeholders:
    // title 'Untitled API', version '').
    const info = isRecord(spec.info) ? spec.info : {};
    const title =
        typeof info.title === 'string' && info.title.length > 0 ? info.title : 'Untitled API';
    const version = typeof info.version === 'string' ? info.version : '';
    const description = typeof info.description === 'string' ? info.description : null;
    // Spec dialect version: `openapi` for 3.x docs, `swagger` for 2.0 docs
    const specVersion =
        typeof spec.openapi === 'string'
            ? spec.openapi
            : typeof spec.swagger === 'string'
              ? spec.swagger
              : '';

    // ── Servers — OpenAPI 3: spec.servers[].url. Swagger 2.0 folds the
    // server into top-level host + basePath, so a combined row is appended
    // when host exists (basePath may be absent → host alone). ONE index
    // counter runs across BOTH sources so the openapi-server-<index> testids
    // stay unique even in the pathological both-present case.
    const serverUrls: string[] = [];
    if (Array.isArray(spec.servers)) {
        arrayEach(spec.servers, ({ value }) => {
            // Non-object entries / url-less entries are skipped quietly —
            // malformed server arrays must not crash the pane
            if (isRecord(value) && typeof value.url === 'string' && value.url.length > 0) {
                serverUrls.push(value.url);
            }
        });
    }
    if (objectHasKey(spec, 'host') && typeof spec.host === 'string' && spec.host.length > 0) {
        const basePath = typeof spec.basePath === 'string' ? spec.basePath : '';
        serverUrls.push(`${spec.host}${basePath}`);
    }
    const serverRows: React.ReactNode[] = [];
    arrayEach(serverUrls, ({ value: url, index }) => {
        serverRows.push(
            <ServerRow key={url} data-testid={`openapi-server-${index}`}>
                {url}
            </ServerRow>,
        );
    });

    // ── Paths — BOTH 3.x and 2.0 keep the path table at spec.paths. Rows are
    // built eagerly (data → nodes) so the empty fallback can be decided
    // before anything renders.
    const paths = isRecord(spec.paths) ? spec.paths : null;
    const pathRows: React.ReactNode[] = [];
    if (paths) {
        objectEach(paths, ({ key, value, index }) => {
            // Path values may be non-objects in malformed docs — skip quietly
            if (!isRecord(value)) return;
            const badges: React.ReactNode[] = [];
            arrayEach(HTTP_METHODS, ({ value: method }) => {
                // objectHasKey = own-property check, so prototype keys like
                // 'constructor' can never masquerade as HTTP methods
                if (objectHasKey(value, method)) {
                    const Badge = METHOD_BADGES[method] ?? OTHER_METHOD_BADGE;
                    badges.push(
                        <Badge key={method} data-testid={`openapi-method-${method}-${index}`}>
                            {method.toUpperCase()}
                        </Badge>,
                    );
                }
            });
            pathRows.push(
                <PathRow key={key} data-testid={`openapi-path-${index}`}>
                    <PathText>{key}</PathText>
                    {badges.length > 0 ? badges : null}
                </PathRow>,
            );
        });
    }

    return (
        <Root data-testid="openapi-view">
            <Header>
                <Title data-testid="openapi-title">{title}</Title>
                <MetaRow>
                    {/* Both chips ALWAYS render (empty text when the field is
                        missing) so the testids are stable for consumers */}
                    <VersionChip data-testid="openapi-version">{version}</VersionChip>
                    <SpecChip data-testid="openapi-spec-version">{specVersion}</SpecChip>
                </MetaRow>
                {description !== null ? (
                    <Description data-testid="openapi-description">{description}</Description>
                ) : null}
            </Header>

            {/* Servers section is skipped entirely when no server rows exist
                (absent servers array AND no Swagger 2.0 host) */}
            {serverRows.length > 0 ? (
                <>
                    <SectionLabel>Servers</SectionLabel>
                    {serverRows}
                </>
            ) : null}

            <SectionLabel>Paths</SectionLabel>
            {/* Missing OR empty paths → the muted empty row (a valid document
                state, not an error) */}
            {pathRows.length > 0 ? (
                pathRows
            ) : (
                <EmptyRow data-testid="openapi-paths-empty">No paths defined.</EmptyRow>
            )}
        </Root>
    );
};

// ─── Plugin registration ─────────────────────────────────────────────────────

// Extension matcher: text-kind files with a .yaml/.yml/.json extension whose
// CONTENT parses to an object carrying an `openapi` (3.x) or `swagger: 2.0`
// marker. Two gates, both required:
// 1. Kind gate — renderFile receives the full ScribbleFile (which carries
//    kind/mime, see src/functions/fileStore.ts), but the ScribbleFileLike
//    contract omits it (cross-reference: src/functions/pluginTypes.ts), so
//    the kind is narrowed ONLY when present (lenient for bare test objects —
//    same pattern as MarkdownViewerFeature.tsx's renderFile). Binary/image/
//    pdf content is a data URL or raw dump — parsing either is meaningless.
// 2. Extension gate — without it, any .txt file containing the word-shaped
//    structure would claim a tab.
// Pure predicate — parse failures are caught and reported as false.
export const isOpenApiFile = (file: ScribbleFileLike): boolean => {
    const kind = (file as ScribbleFileLike & { kind?: string }).kind;
    if (kind !== undefined && kind !== 'text') return false;
    if (!OPENAPI_EXTENSIONS.test(file.name)) return false;
    const spec = parseSpec(file.content);
    return spec !== null && isOpenApiSpec(spec);
};

// Plug-and-play registration: importing this module plugs the feature into
// the dashboard (registry is read by src/dashboards/ScribbleDashboard.tsx).
// renderFile contributes the "OpenAPI" tab ONLY for files that pass every
// matches() gate — anything else contributes nothing (null) so the Yaml/Json/
// Editor tabs take over. Registration order matters: this module must be
// imported AFTER yaml-viewer (cross-reference: src/features/index.ts) — the
// dashboard's matches-first ordering then pulls the OpenAPI tab to the front
// for genuine spec files while generic YAML keeps its own ordering.
registerScribblePlugin({
    id: 'openapi-viewer',
    label: 'OpenAPI',
    title: 'OpenAPI Viewer',
    matches: isOpenApiFile,
    renderFile: (file) => (isOpenApiFile(file) ? <OpenApiViewerSurface file={file} /> : null),
});
