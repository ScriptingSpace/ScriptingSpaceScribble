// ─── JS/TS execution runtime (access layer) ──────────────────────────────────
//
// All TypeScript/JavaScript EXECUTION contact lives here (mirrors the
// pdfjs.ts pattern: one access-layer module so tests and consumers mock this
// ONE module and nothing else). Two pieces:
//
// 1. `transpile` — Sucrase TS→JS stripping. Pure, synchronous, browser-safe
//    (sucrase ships an ESM browser entry; its CLI-only deps never enter the
//    bundle). NOT a type checker: invalid TS may throw or produce garbage —
//    callers wrap in try/catch and surface the message.
// 2. `runInSandbox` — evaluates transpiled JS inside a shadowed scope with a
//    capture-only console. PURE function (takes a console recorder, returns
//    a result) so BOTH the web worker body and jsdom tests call it directly
//    (jsdom has no Worker — see jsRunner.ts for the worker facade).
//
// Cross-reference: src/features/typescriptViewer/TypeScriptViewerFeature.tsx
// (Run button + output panel consume runJs via jsRunner.ts).
import { transform } from 'sucrase';

// Result contract shared by the sandbox, the worker and the UI panel.
export type JsRunResult = {
    // Formatted console lines, in emission order ("[level] message")
    logs: string[];
    // First uncaught error ("TypeError: x is not a function") or timeout
    // message — null on a clean run
    error: string | null;
    // Wall-clock execution time in milliseconds (transpile excluded)
    durationMs: number;
};

// Sucrase options rationale:
// - transforms: ['typescript'] strips type annotations (JS passes through
//   untouched with an empty transform list)
// - disableESTransforms: modern browsers run optional chaining/class fields
//   natively — downleveling is pointless bundle/behavior noise
// - keepUnusedImports: type-stripping must not delete imports the user
//   "isn't using yet" (side-effect imports, future use while drafting)
// - jsxRuntime: 'automatic' lets .tsx snippets run without React in scope
export const transpile = (source: string, isTypeScript: boolean): string => {
    const { code } = transform(source, {
        transforms: isTypeScript ? ['typescript'] : [],
        disableESTransforms: true,
        keepUnusedImports: true,
        jsxRuntime: 'automatic',
    });
    return code;
};

// Formats one console call's arguments into a single line. Objects are
// JSON-stringified (2-space pretty) — good enough for a log panel; strings
// pass through verbatim; null/undefined stringify to their literals.
export const formatLog = (...args: unknown[]): string =>
    args
        .map((arg) => {
            if (typeof arg === 'string') return arg;
            try {
                return JSON.stringify(arg, null, 2) ?? String(arg);
            } catch {
                // Circular structures etc. — fall back to toString
                return String(arg);
            }
        })
        .join(' ');

// Timeout for sandboxed runs (ms). Long enough for real work, short enough
// that an accidental `while(true)` does not hang the panel forever (the
// worker facade enforces the hard kill — see jsRunner.ts).
export const SANDBOX_TIMEOUT_MS = 5000;

// Runs ALREADY-TRANSPILED JS inside a shadowed scope. Sandbox mechanics:
// - `new Function(...shadowNames, body)` — the parameter list SHADOWS the
//   globals user code must not reach (window/document/fetch/storage/…).
//   This is NOT a security boundary (constructor chains can escape); it is
//   a footgun guard for a local scripting playground.
// - console is REPLACED by a capture recorder writing into the result's
//   `logs` — user output lands in the panel, never the devtools.
// - sync throw / async rejection → error string; clean run → null.
// - durationMs measures ONLY the eval (transpile is excluded).
export const runInSandbox = (js: string): JsRunResult => {
    const logs: string[] = [];
    const result: JsRunResult = { logs, error: null, durationMs: 0 };
    // Capture-only console — every level funnels into the same log list
    const capture = (level: string) => (...args: unknown[]) => {
        logs.push(`[${level}] ${formatLog(...args)}`);
    };
    const sandboxConsole = {
        log: capture('log'),
        info: capture('info'),
        warn: capture('warn'),
        error: capture('error'),
        debug: capture('debug'),
    };
    const start = Date.now();
    try {
        // Parameter names shadow the blocked globals; values are undefined
        const run = new Function(
            'console',
            'window',
            'document',
            'globalThis',
            'fetch',
            'XMLHttpRequest',
            'localStorage',
            'sessionStorage',
            'indexedDB',
            'importScripts',
            `"use strict";\n${js}`,
        );
        run(
            sandboxConsole,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        );
    } catch (err) {
        result.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    result.durationMs = Date.now() - start;
    return result;
};

// Full pipeline: TS/JS source → transpile → sandbox eval. The single entry
// the worker body and tests call. Transpile errors (invalid TS) surface as
// result.error with the Sucrase message.
export const runJs = (code: string, isTypeScript: boolean): JsRunResult => {
    try {
        const js = transpile(code, isTypeScript);
        return runInSandbox(js);
    } catch (err) {
        return {
            logs: [],
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            durationMs: 0,
        };
    }
};
