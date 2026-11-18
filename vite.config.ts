import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages, a custom domain, or inside a phone app shell.
export default defineConfig({ base: './', plugins: [react()] });
