import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the built bundle works on GitHub Pages / any sub-path host
// (see the TODO note in the package root index.ts about GitHub Pages deploys).
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist',
    },
});
