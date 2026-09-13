// ─── Python execution runtime (Pyodide access layer) ─────────────────────────
//
// All PYTHON EXECUTION contact lives here (mirrors the pdfjs.ts pattern: one
// access-layer module so tests and consumers mock this ONE module and
// nothing else). Design decisions:
//
// - LAZY: Pyodide is dynamic-imported on the first run request — never at
//   module scope. The ~14 MB npm glue + ~18 MB runtime (wasm/stdlib fetched
//   from the CDN at load time) stay out of the initial bundle and every
//   unrelated test/import path.
// - CDN indexURL: Vite bundles the `pyodide` npm package's JS glue but does
//   NOT emit the wasm/stdlib assets, so the default script-URL-derived
//   indexURL breaks. The official Pyodide CDN distribution (NOT the npm
//   mirror — it lacks the package wheels) is the pragmatic default for this
//   GitHub-Pages-deployed package. Full version pinned.
// - CAPABILITY GUARD: `WebAssembly` must exist (jsdom has no wasm workload;
//   real-world ancient browsers too) — guarded BEFORE any import so the
//   status machine reports an error without touching the network.
// - STATUS MACHINE: idle → loading → ready | error, surfaced to the UI so
//   the Run button can disable itself during the (slow, first-time) load.
//
// Cross-reference: src/features/pythonViewer/PythonViewerFeature.tsx (Run
// button + output panel consume this module's exports).

// Pinned Pyodide release — CPython-aligned versioning: 314.x = Python 3.14
// (the npm package version matches the CDN distribution version exactly).
const PYODIDE_VERSION = '314.0.6';
// The Pyodide DISTRIBUTION path on jsdelivr (wheels included) — not
// /npm/pyodide@ which is the runtime-only npm mirror.
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// UI-facing loader status
export type PythonStatus = 'idle' | 'loading' | 'ready' | 'error';

// Result contract shared with the UI panel (same shape as JsRunResult so
// both output panels render uniformly).
export type PyRunResult = {
    // Captured stdout lines ("[stderr] …" prefixed for stderr)
    logs: string[];
    // Python traceback / load failure message — null on a clean run
    error: string | null;
    // repr() of the final expression's value, '' when there is none
    result: string;
};

// Minimal structural slice of the Pyodide API this module uses — declared
// locally (instead of importing the type) so the STATIC type surface stays
// decoupled from the dynamic import (the pyodide package is only touched
// inside the guarded lazy path).
type PyodideLike = {
    runPythonAsync: (code: string) => Promise<unknown>;
    // setStdout/setStderr accept an OPTIONAL options object — calling them
    // with NO arguments restores Pyodide's default streams (the reset path
    // in runPython's finally block relies on this)
    setStdout: (options?: { batched: (line: string) => void }) => void;
    setStderr: (options?: { batched: (line: string) => void }) => void;
    loadPackagesFromImports: (code: string) => Promise<void>;
};

// Singleton runtime + in-flight load promise (concurrent Run presses share
// ONE load — reload is expensive)
let instance: PyodideLike | null = null;
let loadPromise: Promise<PyodideLike> | null = null;
let status: PythonStatus = 'idle';

// Current loader status — the UI reads this to drive its Run-button state
export const getPythonStatus = (): PythonStatus => status;

// True when this realm can EVER run Pyodide (jsdom and wasm-less browsers
// fail here — the UI shows the unavailable message without any fetch)
export const isPythonSupported = (): boolean => typeof WebAssembly !== 'undefined';

// Loads (or returns the cached) Pyodide instance. The dynamic import keeps
// the pyodide glue out of the entry chunk; the CDN indexURL supplies the
// wasm/stdlib at runtime. Startup output is captured via the config-level
// stdout/stderr handlers (the ONLY place Pyodide's own boot noise is
// visible) — routed to console so it lands in devtools, not a lost void.
const loadPythonRuntime = (): Promise<PyodideLike> => {
    if (instance) return Promise.resolve(instance);
    if (!loadPromise) {
        loadPromise = (async () => {
            const { loadPyodide } = await import('pyodide');
            const created = (await loadPyodide({
                indexURL: PYODIDE_INDEX_URL,
                stdout: (line: string) => console.log(`[py] ${line}`),
                stderr: (line: string) => console.warn(`[py] ${line}`),
            })) as unknown as PyodideLike;
            instance = created;
            return created;
        })();
    }
    return loadPromise;
};

// Runs Python source through the shared Pyodide instance. Mechanics:
// - stdout/stderr are redirected to per-run batched collectors (one call
//   per complete line) and RESTORED afterwards — leaking a run's collector
//   would route every later print into a dead array.
// - loadPackagesFromImports pre-fetches wheels the code imports (numpy etc.)
//   so runPythonAsync does not die on the first `import x`.
// - runPythonAsync (not runPython) supports top-level await in snippets.
// - Python exceptions arrive as JS Errors whose message is the full
//   traceback — surfaced verbatim in result.error.
// - The final expression's value may be a PyProxy; it is stringified via
//   repr() in Python (never via .toJs()) so the panel shows a plain string
//   and no proxy handle leaks.
export const runPython = async (code: string): Promise<PyRunResult> => {
    // Capability guard FIRST — no network, no import attempt
    if (!isPythonSupported()) {
        status = 'error';
        return {
            logs: [],
            error:
                'Python runtime unavailable: this environment does not support WebAssembly.',
            result: '',
        };
    }
    status = 'loading';
    try {
        const py = await loadPythonRuntime();
        status = 'ready';
        const logs: string[] = [];
        py.setStdout({ batched: (line: string) => logs.push(line) });
        py.setStderr({ batched: (line: string) => logs.push(`[stderr] ${line}`) });
        try {
            await py.loadPackagesFromImports(code);
            // runPythonAsync returns the final expression's value — a
            // PyProxy for Python objects. Stringify via repr() in Python
            // when the value is a proxy; plain values pass through.
            const raw = await py.runPythonAsync(code);
            let result = '';
            if (raw !== null && raw !== undefined) {
                // PyProxy exposes a repr() method; plain JS values do not
                const proxy = raw as { repr?: () => string };
                result = typeof proxy.repr === 'function' ? proxy.repr() : String(raw);
            }
            return { logs, error: null, result };
        } catch (err) {
            return {
                logs,
                error: err instanceof Error ? err.message : String(err),
                result: '',
            };
        } finally {
            py.setStdout();
            py.setStderr();
        }
    } catch (err) {
        status = 'error';
        return {
            logs: [],
            error: err instanceof Error ? err.message : String(err),
            result: '',
        };
    }
};
