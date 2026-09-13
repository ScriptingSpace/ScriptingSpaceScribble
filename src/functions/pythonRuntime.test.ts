import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// The Pyodide access layer is MOCKED at the module boundary — jsdom has no
// WebAssembly workload and the real runtime fetches ~18 MB from a CDN, so
// tests must never touch it. These tests verify the CONTRACT the UI panel
// consumes (status machine, capability guard, result shape) against a fake
// runtime whose behavior mirrors the documented Pyodide API.
// vi.hoisted is REQUIRED: beforeEach calls vi.resetModules(), which clears
// the module registry and re-runs the vi.mock factory on the next import of
// 'pyodide'. A plain module-level const would be captured by the FIRST
// factory run only — every re-run would close over a stale reference and the
// fresh module would receive an unconfigured mock. Hoisting pins ONE mock
// identity that survives every factory re-run.
const { loadPyodideMock } = vi.hoisted(() => ({ loadPyodideMock: vi.fn() }));

vi.mock('pyodide', () => ({
    loadPyodide: (...args: unknown[]) => loadPyodideMock(...args),
}));

// Fresh module state per test (the access layer caches the instance +
// status in module scope) — importDynamic gives an isolated copy
const importFresh = async () => await import('./pythonRuntime');

// A fake Pyodide instance mirroring the API slice pythonRuntime.ts uses:
// runPythonAsync + setStdout/setStderr (batched collectors) +
// loadPackagesFromImports. The fake routes print() output into whatever
// collector is currently installed, exactly like the real runtime.
const makeFakePyodide = (behavior: {
    run?: (code: string) => Promise<unknown> | unknown;
    throwOnLoadPackages?: boolean;
    throwOnRun?: Error;
}) => {
    let stdout: ((line: string) => void) | null = null;
    let stderr: ((line: string) => void) | null = null;
    return {
        runPythonAsync: async (code: string) => {
            if (behavior.throwOnRun) throw behavior.throwOnRun;
            // Simulate print() → batched stdout lines inside the run
            if (code.includes('print(')) stdout?.('printed-line');
            return behavior.run ? await behavior.run(code) : undefined;
        },
        // The runtime calls setStdout()/setStderr() with NO arguments in its
        // finally block to restore Pyodide's default streams — the fake must
        // tolerate the no-arg restore call (options is undefined then)
        setStdout: (options?: { batched: (line: string) => void }) => {
            stdout = options?.batched ?? null;
        },
        setStderr: (options?: { batched: (line: string) => void }) => {
            stderr = options?.batched ?? null;
        },
        loadPackagesFromImports: async () => {
            if (behavior.throwOnLoadPackages) throw new Error('package fetch failed');
        },
        // Probe hooks for assertions (not part of the real API)
        __stdout: () => stdout,
        __stderr: () => stderr,
    };
};

beforeEach(() => {
    loadPyodideMock.mockReset();
    // Reset the module registry so each test's importFresh() re-evaluates
    // pythonRuntime.ts — the access layer caches the instance + status in
    // module scope (ES modules are singletons; a plain dynamic import
    // returns the SAME stateful module across tests)
    vi.resetModules();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('pythonRuntime (mocked Pyodide boundary)', () => {
    it('reports unsupported when WebAssembly is missing (capability guard)', async () => {
        // jsdom HAS WebAssembly in modern Node, so simulate the absence by
        // stubbing the global for this test — the guard must short-circuit
        // BEFORE any import/load attempt
        const original = globalThis.WebAssembly;
        // @ts-expect-error — deleting a global for the guard probe
        delete globalThis.WebAssembly;
        try {
            const runtime = await importFresh();
            const result = await runtime.runPython('print("hi")');
            expect(result.error).toBe(
                'Python runtime unavailable: this environment does not support WebAssembly.',
            );
            expect(result.logs).toEqual([]);
            expect(result.result).toBe('');
            expect(runtime.getPythonStatus()).toBe('error');
            // No load attempt happened
            expect(loadPyodideMock).not.toHaveBeenCalled();
        } finally {
            globalThis.WebAssembly = original;
        }
    });

    it('isPythonSupported reflects the realm capability', async () => {
        const runtime = await importFresh();
        expect(runtime.isPythonSupported()).toBe(true);
    });

    it('loads Pyodide lazily on the first run and flips status to ready', async () => {
        const runtime = await importFresh();
        expect(runtime.getPythonStatus()).toBe('idle');
        loadPyodideMock.mockResolvedValue(makeFakePyodide({}));

        const result = await runtime.runPython('1 + 1');
        expect(loadPyodideMock).toHaveBeenCalledTimes(1);
        // indexURL is the pinned Pyodide CDN distribution (NOT the npm
        // mirror — the npm mirror lacks the package wheels)
        expect(loadPyodideMock.mock.calls[0][0].indexURL).toBe(
            'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/',
        );
        expect(runtime.getPythonStatus()).toBe('ready');
        expect(result.error).toBeNull();
    });

    it('captures stdout lines into logs and returns the repr result', async () => {
        loadPyodideMock.mockResolvedValue(
            makeFakePyodide({ run: () => ({ repr: () => "'42'" }) }),
        );

        const runtime = await importFresh();
        const result = await runtime.runPython('print("hi")\n40 + 2');
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['printed-line']);
        // PyProxy-shaped results are stringified via repr()
        expect(result.result).toBe("'42'");
    });

    it('stringifies plain JS values without a repr method via String()', async () => {
        loadPyodideMock.mockResolvedValue(makeFakePyodide({ run: () => 42 }));

        const runtime = await importFresh();
        const result = await runtime.runPython('40 + 2');
        expect(result.result).toBe('42');
    });

    it('returns an empty result string when the run yields nothing', async () => {
        loadPyodideMock.mockResolvedValue(makeFakePyodide({}));

        const runtime = await importFresh();
        const result = await runtime.runPython('x = 1');
        expect(result.result).toBe('');
        expect(result.error).toBeNull();
    });

    it('prefixes stderr lines in the logs', async () => {
        loadPyodideMock.mockImplementation(async () => {
            const fake = makeFakePyodide({});
            // Simulate Python writing to stderr during the run — the write
            // must go through the PER-RUN collector installed via
            // setStderr (the loadPyodide config.stderr handler is the boot
            // noise route, NOT the run collector — see pythonRuntime.ts)
            const originalRun = fake.runPythonAsync;
            fake.runPythonAsync = async (code: string) => {
                (fake.__stderr() as (line: string) => void)('warning text');
                return await originalRun(code);
            };
            return fake;
        });

        const runtime = await importFresh();
        const result = await runtime.runPython('import sys; sys.stderr.write("x")');
        expect(result.logs).toEqual(['[stderr] warning text']);
    });

    it('surfaces Python exceptions (traceback) as result.error', async () => {
        loadPyodideMock.mockResolvedValue(
            makeFakePyodide({
                throwOnRun: new Error(
                    'Traceback (most recent call last):\n  File "<exec>", line 1\nZeroDivisionError: division by zero',
                ),
            }),
        );

        const runtime = await importFresh();
        const result = await runtime.runPython('1 / 0');
        expect(result.error).toContain('ZeroDivisionError: division by zero');
        expect(result.result).toBe('');
    });

    it('surfaces load failures as result.error and flips status to error', async () => {
        loadPyodideMock.mockRejectedValue(new Error('network down'));

        const runtime = await importFresh();
        const result = await runtime.runPython('1 + 1');
        expect(result.error).toBe('network down');
        expect(runtime.getPythonStatus()).toBe('error');
    });

    it('restores default stdout/stderr after each run (no collector leak)', async () => {
        const fake = makeFakePyodide({});
        loadPyodideMock.mockResolvedValue(fake);

        const runtime = await importFresh();
        const first = await runtime.runPython('print("first")');
        // Run 1's own output landed in run 1's collector
        expect(first.logs).toEqual(['printed-line']);
        // The finally block restored defaults (setStdout() with no args) —
        // the fake models that as the collector hook cleared to null
        expect(fake.__stdout()).toBeNull();
        expect(fake.__stderr()).toBeNull();
        // Second run installs a FRESH collector — output from run 2 must
        // not leak into run 1's logs
        const second = await runtime.runPython('print("second")');
        expect(second.logs).toEqual(['printed-line']);
    });

    it('shares ONE runtime instance across concurrent runs (single load)', async () => {
        // Slow-resolving load — two overlapping runs must trigger ONE load
        loadPyodideMock.mockImplementation(
            () =>
                new Promise((resolve) =>
                    setTimeout(() => resolve(makeFakePyodide({ run: () => 1 })), 20),
                ),
        );

        const runtime = await importFresh();
        const [a, b] = await Promise.all([
            runtime.runPython('1'),
            runtime.runPython('1'),
        ]);
        expect(loadPyodideMock).toHaveBeenCalledTimes(1);
        expect(a.error).toBeNull();
        expect(b.error).toBeNull();
    });
});
