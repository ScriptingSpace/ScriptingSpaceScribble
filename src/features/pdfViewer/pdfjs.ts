import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

// ─── pdf.js access layer ─────────────────────────────────────────────────────
// Single module that owns every direct pdfjs-dist interaction. Isolating it
// here means tests can mock this ONE module and the rest of the plugin
// (viewer, hook) stays pdfjs-free. Pattern mirrors the proven Formatter
// access layer (cross-reference:
// distribution/ScriptingSpaceFormatter/src/plugins/pdfReader/pdfjs.ts).

// Re-exported so the viewer/hook never import 'pdfjs-dist' themselves —
// this keeps the pdfjs-dist dependency in exactly one module of the plugin.
export { getDocument, GlobalWorkerOptions };

// Resolves the pdf.js worker source. The `?url` import is resolved at Vite
// build time to a hashed asset URL (vite/client's ambient `*?url` module
// declaration keeps `tsc --noEmit` and `tsconfig.build.json` happy — see
// src/vite-env.d.ts, which carries the `/// <reference types="vite/client" />`
// triple-slash directive).
//
// Lazy + guarded on purpose:
// - called only when a PDF is actually opened (no worker fetch for sessions
//   that never use the PDF plugin)
// - a bundler without `?url` support throws on the dynamic import → swallowed,
//   and pdf.js falls back to its main-thread "fake worker" mode
export const configurePdfWorker = async (): Promise<void> => {
    // Already configured (or a previous run succeeded) → no-op. The guard
    // makes repeated opens cheap and keeps the assignment idempotent.
    if (GlobalWorkerOptions.workerSrc) return;
    try {
        const { default: workerUrl } = await import(
            'pdfjs-dist/build/pdf.worker.min.mjs?url'
        );
        GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
        // Fake-worker fallback: pdf.js runs on the main thread. Slower, but
        // every feature keeps working.
    }
};
