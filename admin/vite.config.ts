import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    // The help pages are read from the guides in docs/guides.
    fs: { allow: ['.', '../docs/guides'] },
  },
});
