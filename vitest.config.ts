import { defineConfig } from 'vitest/config';

// Matches the vitest setup used by every sibling distribution package
// (template, comfy-dashboard, maths, english): jsdom + globals + src glob.
// setupFiles polyfills ResizeObserver/DOM geometry for CodeMirror in jsdom.
export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        setupFiles: ['./vitest.setup.ts'],
        passWithNoTests: true,
    },
});
