// ─── JS/TS run facade — web worker with main-thread fallback ─────────────────
//
// The UI-facing entry for executing TS/JS (see jsRuntime.ts for the pure
// transpile + sandbox logic). Strategy:
// - Browser WITH Worker support (all real browsers): the sandbox body runs
//   in a Vite-bundled MODULE WORKER — no DOM access from user code, and an
//   infinite loop is killable via worker.terminate() (the ONLY reliable
//   hard stop for `while(true)`).
// - Environment WITHOUT Worker (jsdom tests, ancient browsers): falls back
//   to calling runJs() on the main thread — same sandbox shadowing, just no
//   termination kill (timeout surfaces as an error instead).
//
// The worker is created LAZILY on first run (never at module scope) so the
// initial bundle and every existing feature test stay unaffected.
import { runJs, SANDBOX_TIMEOUT_MS } from './jsRuntime';
import type { JsRunResult } from './jsRuntime';

// Lazily-spawned worker instance (null until the first browser run)
let worker: Worker | null = null;

// True when the environment provides the Worker constructor (browsers yes,
// jsdom no — typeof guard keeps the check safe in any realm)
const hasWorkerSupport = (): boolean => typeof Worker !== 'undefined';

// Spawns (or reuses) the sandbox worker. Vite compiles the URL-referenced
// module worker for both dev and build automatically.
const spawnWorker = (): Worker =>
    new Worker(new URL('./jsSandbox.worker.ts', import.meta.url), { type: 'module' });

// Runs the TS/JS source: worker path with a hard terminate-kill on timeout,
// main-thread fallback otherwise. Resolves (never rejects) — failures land
// in result.error so the UI panel renders them uniformly.
export const runJsAsync = async (
    code: string,
    isTypeScript: boolean,
    timeoutMs: number = SANDBOX_TIMEOUT_MS,
): Promise<JsRunResult> => {
    // ── Fallback: no Worker in this realm → main-thread eval ──
    if (!hasWorkerSupport()) {
        return runJs(code, isTypeScript);
    }

    // ── Worker path ──
    // A previous run that timed out TERMINATED its worker — always spawn a
    // fresh one in that case (worker === null after a kill)
    if (!worker) worker = spawnWorker();
    const current = worker;

    return new Promise<JsRunResult>((resolve) => {
        let settled = false;
        const finish = (result: JsRunResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(killTimer);
            current.removeEventListener('message', onMessage);
            resolve(result);
        };
        const onMessage = (event: MessageEvent<JsRunResult>) => finish(event.data);
        current.addEventListener('message', onMessage);
        // Hard kill: terminate the worker (its setTimeout cannot save it —
        // terminate is synchronous and unconditional). The next run spawns
        // a fresh worker (worker is reset below).
        const killTimer = setTimeout(() => {
            current.terminate();
            if (worker === current) worker = null;
            finish({
                logs: [],
                error: `Execution timed out after ${timeoutMs}ms (worker terminated)`,
                durationMs: timeoutMs,
            });
        }, timeoutMs + 500);
        current.postMessage({ code, isTypeScript, timeoutMs });
    });
};
