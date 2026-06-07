import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  base: '/titanforge-hero-planner/app/',
  plugins: [react()],
  build: {
    outDir: '../../docs/app',
    emptyOutDir: true
  }
});
