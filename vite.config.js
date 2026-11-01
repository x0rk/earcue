import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // React, Radix and the audio engine ship as one chunk; splitting it buys little for a single-screen tool.
    chunkSizeWarningLimit: 700,
  },
});
