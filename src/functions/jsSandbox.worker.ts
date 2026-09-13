// ─── JS/TS sandbox WORKER body (Vite-bundled module worker) ──────────────────
//
// Runs in a dedicated worker thread: no DOM access from user code, and an
// infinite loop is killable via worker.terminate() from the main thread
// (see jsRunner.ts). The body itself is thin — the REAL sandbox logic
// (transpile + shadowed eval + console capture) lives in jsRuntime.ts's
// runJs so jsdom tests can exercise it directly (jsdom has no Worker).
//
// Message contract in:  { code, isTypeScript, timeoutMs }
// Message contract out: JsRunResult { logs, error, durationMs }
import { runJs } from './jsRuntime';
import type { JsRunResult } from './jsRuntime';

self.onmessage = (
    event: MessageEvent<{ code: string; isTypeScript: boolean; timeoutMs: number }>,
) => {
    const { code, isTypeScript } = event.data;
    // The in-worker timeout is a COOPERATIVE guard (fires only between
    // macrotasks — a sync `while(true)` blocks it); the hard kill is the
    // main thread's terminate (jsRunner.ts). Post the result either way.
    const timer = setTimeout(() => {
        const result: JsRunResult = {
            logs: [],
            error: `Execution timed out after ${event.data.timeoutMs}ms`,
            durationMs: event.data.timeoutMs,
        };
        self.postMessage(result);
        self.close();
    }, event.data.timeoutMs);

    const result = runJs(code, isTypeScript);
    clearTimeout(timer);
    self.postMessage(result);
};
