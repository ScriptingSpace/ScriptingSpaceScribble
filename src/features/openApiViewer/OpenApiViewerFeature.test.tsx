import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { OpenApiViewerSurface, isOpenApiFile } from './OpenApiViewerFeature';
import type { ScribbleFileLike } from '../../functions';

afterEach(() => {
    cleanup();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Canonical OpenAPI 3 YAML doc (inline, per task spec) — the minimal doc that
// must match: openapi key + info + one path with one method.
const PET_STORE_YAML = [
    'openapi: 3.0.0',
    'info:',
    '  title: Pet Store',
    '  version: 1.0.0',
    'paths:',
    '  /pets:',
    '    get: {}',
].join('\n');

// The same document serialized as JSON — the parser fallback path (YAML pass
// handles JSON in practice, but the JSON.parse fallback must not break it).
const PET_STORE_JSON = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Pet Store', version: '1.0.0' },
    paths: { '/pets': { get: {} } },
});

// Swagger 2.0 doc — carries `swagger: '2.0'` instead of `openapi`.
const SWAGGER_2_YAML = "swagger: '2.0'\ninfo:\n  title: X\n  version: '1'";

// Plain YAML config — valid YAML, but no OpenAPI/Swagger marker → no match.
const PLAIN_CONFIG_YAML = 'a: 1';

// Builds a ScribbleFileLike the way the read pipeline produces one
// (cross-reference: src/functions/fileStore.ts — kind/mime ride along; the
// plugin contract's ScribbleFileLike omits them, hence the intersection type).
const textFile = (name: string, content: string): ScribbleFileLike => ({
    name,
    content,
    kind: 'text' as const,
    mime: 'text/plain',
});

// ─── matches() contract ──────────────────────────────────────────────────────

describe('isOpenApiFile (matches)', () => {
    it('accepts an OpenAPI 3 YAML document', () => {
        expect(isOpenApiFile(textFile('spec.yaml', PET_STORE_YAML))).toBe(true);
    });

    it('accepts the same document as JSON (.json extension)', () => {
        expect(isOpenApiFile(textFile('spec.json', PET_STORE_JSON))).toBe(true);
    });

    it('accepts a Swagger 2.0 document (swagger key, exactly 2.0)', () => {
        expect(isOpenApiFile(textFile('api.yml', SWAGGER_2_YAML))).toBe(true);
    });

    it('rejects a plain YAML config without OpenAPI markers', () => {
        expect(isOpenApiFile(textFile('config.yaml', PLAIN_CONFIG_YAML))).toBe(false);
    });

    it('rejects openapi-looking content in a .txt file (extension guard)', () => {
        expect(isOpenApiFile(textFile('notes.txt', PET_STORE_YAML))).toBe(false);
    });

    it('rejects unparseable content and non-object documents', () => {
        expect(isOpenApiFile(textFile('broken.yaml', 'a: [1, 2'))).toBe(false);
        // Scalar YAML parses but is not a record → no match
        expect(isOpenApiFile(textFile('scalar.yaml', 'just a string'))).toBe(false);
    });

    it('rejects swagger values other than exactly 2.0', () => {
        expect(isOpenApiFile(textFile('api.yml', "swagger: '2.1'\ninfo: {}"))).toBe(false);
    });

    it('rejects non-text kinds (binary/image/pdf never parse as specs)', () => {
        expect(
            isOpenApiFile({ ...textFile('spec.yaml', PET_STORE_YAML), kind: 'binary' as const }),
        ).toBe(false);
    });
});

// ─── Summary surface ─────────────────────────────────────────────────────────

describe('OpenApiViewerSurface', () => {
    it('renders exact title, version, spec-version and one path row with a GET badge', () => {
        render(<OpenApiViewerSurface file={textFile('petstore.yaml', PET_STORE_YAML)} />);

        expect(screen.getByTestId('openapi-view')).toBeDefined();
        expect(screen.getByTestId('openapi-title').textContent).toBe('Pet Store');
        expect(screen.getByTestId('openapi-version').textContent).toBe('1.0.0');
        expect(screen.getByTestId('openapi-spec-version').textContent).toBe('3.0.0');
        expect(screen.getByTestId('openapi-path-0').textContent).toContain('/pets');
        expect(screen.getByTestId('openapi-method-get-0').textContent).toBe('GET');
    });

    it('renders three method badges in canonical order with exact texts GET/POST/DELETE', () => {
        // Document order is deliberately scrambled (delete/post/get) — the
        // canonical HTTP_METHODS order must normalize it
        const content = [
            'openapi: 3.0.0',
            'info:',
            '  title: Methods',
            "  version: '2'",
            'paths:',
            '  /things:',
            '    delete: {}',
            '    post: {}',
            '    get: {}',
        ].join('\n');
        render(<OpenApiViewerSurface file={textFile('methods.yaml', content)} />);

        expect(screen.getByTestId('openapi-method-get-0').textContent).toBe('GET');
        expect(screen.getByTestId('openapi-method-post-0').textContent).toBe('POST');
        expect(screen.getByTestId('openapi-method-delete-0').textContent).toBe('DELETE');
    });

    it('renders the muted empty row when paths are missing or empty', () => {
        const emptyPaths = 'openapi: 3.0.0\ninfo: {title: Empty, version: 1.0.0}\npaths: {}';
        render(<OpenApiViewerSurface file={textFile('empty.yaml', emptyPaths)} />);
        expect(screen.getByTestId('openapi-paths-empty').textContent).toBe('No paths defined.');

        cleanup();

        // Absent paths entirely → same fallback
        const noPaths = 'openapi: 3.0.0\ninfo: {title: Empty, version: 1.0.0}';
        render(<OpenApiViewerSurface file={textFile('none.yaml', noPaths)} />);
        expect(screen.getByTestId('openapi-paths-empty').textContent).toBe('No paths defined.');
    });

    it('renders placeholders when a matching spec has no info block', () => {
        // Matches (openapi key) but info is missing entirely — must render
        // 'Untitled API' + '' instead of crashing (robustness requirement)
        const noInfo = 'openapi: 3.0.0\npaths: {}';
        render(<OpenApiViewerSurface file={textFile('bare.yaml', noInfo)} />);
        expect(screen.getByTestId('openapi-title').textContent).toBe('Untitled API');
        expect(screen.getByTestId('openapi-version').textContent).toBe('');
    });

    it('renders OpenAPI 3 server rows with indexed testids', () => {
        const content = [
            'openapi: 3.0.0',
            'info: {title: Servers, version: 1.0.0}',
            'servers:',
            '  - url: https://api.example.com/v1',
            '  - url: https://staging.example.com/v2',
            'paths: {}',
        ].join('\n');
        render(<OpenApiViewerSurface file={textFile('servers.yaml', content)} />);

        expect(screen.getByTestId('openapi-server-0').textContent).toBe(
            'https://api.example.com/v1',
        );
        expect(screen.getByTestId('openapi-server-1').textContent).toBe(
            'https://staging.example.com/v2',
        );
        // No servers section at all → nothing rendered, no crash
        cleanup();
        render(
            <OpenApiViewerSurface
                file={textFile('plain.yaml', 'openapi: 3.0.0\ninfo: {title: S, version: 1}\npaths: {}')}
            />,
        );
        expect(screen.queryByTestId('openapi-server-0')).toBeNull();
    });

    it('renders a combined host+basePath server row for Swagger 2.0 docs', () => {
        const content = [
            "swagger: '2.0'",
            'info: {title: Legacy, version: 1.0.0}',
            'host: api.example.com',
            'basePath: /v2',
            'paths:',
            '  /pets: {get: {}}',
        ].join('\n');
        render(<OpenApiViewerSurface file={textFile('legacy.yaml', content)} />);

        expect(screen.getByTestId('openapi-spec-version').textContent).toBe('2.0');
        expect(screen.getByTestId('openapi-server-0').textContent).toBe('api.example.com/v2');
        expect(screen.getByTestId('openapi-path-0').textContent).toContain('/pets');
    });

    it('renders the description when present, nothing when absent', () => {
        const withDescription = [
            'openapi: 3.0.0',
            'info:',
            '  title: Documented',
            '  version: 1.0.0',
            '  description: A well documented API.',
            'paths: {}',
        ].join('\n');
        render(<OpenApiViewerSurface file={textFile('doc.yaml', withDescription)} />);
        expect(screen.getByTestId('openapi-description').textContent).toBe(
            'A well documented API.',
        );

        cleanup();
        render(<OpenApiViewerSurface file={textFile('petstore.yaml', PET_STORE_YAML)} />);
        expect(screen.queryByTestId('openapi-description')).toBeNull();
    });

    it('skips malformed path values and unknown method keys without crashing', () => {
        const content = JSON.stringify({
            openapi: '3.0.0',
            info: { title: 'Weird', version: '1' },
            paths: {
                '/broken': 'not-an-object',
                '/ok': { get: {}, trace: {}, parameters: [] },
            },
        });
        render(<OpenApiViewerSurface file={textFile('weird.json', content)} />);

        // /broken (non-object value) contributes NO row; /ok renders with
        // only its known method badge — 'trace' has no dedicated badge color
        // (fallback muted) and 'parameters' is not a method at all
        expect(screen.queryByTestId('openapi-path-0')).toBeNull();
        expect(screen.getByTestId('openapi-path-1').textContent).toContain('/ok');
        expect(screen.getByTestId('openapi-method-get-1').textContent).toBe('GET');
        expect(screen.queryByTestId('openapi-method-trace-1')).toBeNull();
    });

    it('degrades to the invalid notice when mounted with unparseable content', () => {
        // renderFile gates on matches(), but a direct caller can bypass the
        // gate — the surface must degrade, not throw
        render(<OpenApiViewerSurface file={textFile('junk.yaml', 'a: [1, 2')} />);
        expect(screen.getByTestId('openapi-invalid').textContent).toBe(
            'This file does not contain a parseable OpenAPI/Swagger document.',
        );
    });
});

// ─── renderFile gate ─────────────────────────────────────────────────────────

describe('renderFile gate', () => {
    it('returns a node for a matching file and null otherwise', async () => {
        const { getScribblePlugins } = await import('../../functions');
        await import('./OpenApiViewerFeature');

        const plugin = getScribblePlugins().find((entry) => entry.id === 'openapi-viewer');
        expect(plugin).toBeDefined();
        expect(plugin?.label).toBe('OpenAPI');
        expect(plugin?.title).toBe('OpenAPI Viewer');
        expect(plugin?.renderFile?.(textFile('spec.yaml', PET_STORE_YAML))).not.toBeNull();
        expect(plugin?.renderFile?.(textFile('config.yaml', PLAIN_CONFIG_YAML))).toBeNull();
        expect(plugin?.renderFile?.(textFile('notes.txt', PET_STORE_YAML))).toBeNull();
    });
});
