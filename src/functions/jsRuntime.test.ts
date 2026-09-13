import { describe, it, expect } from 'vitest';
import { transpile, runInSandbox, runJs, formatLog } from './jsRuntime';

describe('transpile (Sucrase TS stripping)', () => {
    it('strips type annotations from TypeScript source', () => {
        const js = transpile('const x: number = 1;\nconst greet = (n: string): string => n;', true);
        // Types are gone, code semantics intact
        expect(js).toContain('const x = 1;');
        expect(js).toContain('const greet = (n) => n;');
        expect(js).not.toContain(': number');
        expect(js).not.toContain(': string');
    });

    it('passes plain JavaScript through with an empty transform list', () => {
        const js = transpile('let a = 2; a += 3;', false);
        expect(js).toContain('let a = 2;');
        expect(js).toContain('a += 3;');
    });

    it('keeps imports the type-strip would otherwise drop (keepUnusedImports)', () => {
        const js = transpile('import { exists } from "./fs";\nconst v: number = 1;', true);
        // The import survives even though `exists` is unused — side-effect
        // imports and drafting-in-progress code must not be mangled
        expect(js).toContain('import');
        expect(js).toContain('./fs');
    });

    it('throws on invalid TypeScript (callers surface the message)', () => {
        expect(() => transpile('const (((', true)).toThrow();
    });
});

describe('formatLog', () => {
    it('joins strings with spaces', () => {
        expect(formatLog('a', 'b')).toBe('a b');
    });

    it('JSON-stringifies objects and arrays (pretty, 2-space)', () => {
        expect(formatLog({ a: 1 })).toBe('{\n  "a": 1\n}');
        expect(formatLog([1, 2])).toBe('[\n  1,\n  2\n]');
    });

    it('stringifies null and numbers via JSON, undefined via fallback', () => {
        expect(formatLog(null)).toBe('null');
        expect(formatLog(42)).toBe('42');
        // undefined has no JSON form → JSON.stringify returns undefined →
        // the fallback String() path renders it
        expect(formatLog(undefined)).toBe('undefined');
    });
});

describe('runInSandbox', () => {
    it('evaluates plain JS and returns a clean result', () => {
        const result = runInSandbox('const a = 40; const b = 2; a + b;');
        expect(result.error).toBeNull();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('captures console.log output in order', () => {
        const result = runInSandbox('console.log("one"); console.log("two", 3);');
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['[log] one', '[log] two 3']);
    });

    it('captures warn/error/info/debug levels with level prefixes', () => {
        const result = runInSandbox(
            'console.warn("w"); console.error("e"); console.info("i"); console.debug("d");',
        );
        expect(result.logs).toEqual([
            '[warn] w',
            '[error] e',
            '[info] i',
            '[debug] d',
        ]);
    });

    it('captures thrown runtime errors as "Name: message"', () => {
        const result = runInSandbox('throw new TypeError("boom");');
        expect(result.error).toBe('TypeError: boom');
    });

    it('captures reference errors for undeclared identifiers', () => {
        const result = runInSandbox('missingVariable;');
        expect(result.error).toBe('ReferenceError: missingVariable is not defined');
    });

    it('shadows window/document/fetch so user code cannot reach them', () => {
        // Each blocked global is undefined inside the sandbox — the
        // shadowing parameters hide the real realm objects
        const result = runInSandbox(
            'console.log(String(window), String(document), String(fetch));',
        );
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['[log] undefined undefined undefined']);
    });

    it('still allows pure computation (no globals needed)', () => {
        const result = runInSandbox(
            'const squares = [1, 2, 3].map((n) => n * n); console.log(squares);',
        );
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['[log] [\n  1,\n  4,\n  9\n]']);
    });
});

describe('runJs (full pipeline)', () => {
    it('runs TypeScript end-to-end: types stripped, output captured', () => {
        const result = runJs(
            'const greet = (name: string): string => `hello ${name}`;\nconsole.log(greet("world"));',
            true,
        );
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['[log] hello world']);
    });

    it('runs plain JavaScript end-to-end', () => {
        const result = runJs('console.log(1 + 1);', false);
        expect(result.error).toBeNull();
        expect(result.logs).toEqual(['[log] 2']);
    });

    it('surfaces transpile errors for invalid TypeScript', () => {
        const result = runJs('const (((', true);
        expect(result.error).not.toBeNull();
        expect(result.logs).toEqual([]);
    });

    it('surfaces runtime errors with the transpiled code executing first', () => {
        const result = runJs('console.log("before");\nnull.crash();', true);
        expect(result.logs).toEqual(['[log] before']);
        expect(result.error).toContain('TypeError');
    });
});
