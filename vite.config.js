import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const LICENSE_FILE = 'third-party-licenses.md';
const FONT_PACKAGES = ['@fontsource-variable/geist', '@fontsource-variable/geist-mono'];

// Vite's license list only covers JavaScript imports. The Geist fonts arrive through CSS, so their
// license is appended once the build has written the file.
function fontLicenses() {
  const require = createRequire(import.meta.url);
  return {
    name: 'font-licenses',
    apply: 'build',
    writeBundle({ dir }) {
      for (const name of FONT_PACKAGES) {
        const pkgPath = require.resolve(`${name}/package.json`);
        const { version, license } = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const text = readFileSync(join(pkgPath, '..', 'LICENSE'), 'utf8').trim();
        appendFileSync(join(dir, LICENSE_FILE), `\n## ${name} - ${version} (${license})\n\n${text}\n`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fontLicenses()],
  build: {
    // React, Radix and the audio engine ship as one chunk; splitting it buys little for a single-screen tool.
    chunkSizeWarningLimit: 700,
    // Lists every bundled package and font with its license, served next to the app.
    license: { fileName: LICENSE_FILE },
  },
});
