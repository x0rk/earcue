import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const LICENSE_FILE = 'third-party-licenses.md';
const FONT_PACKAGES = ['@fontsource-variable/geist', '@fontsource-variable/geist-mono'];
// Code that ships without a package of its own. The OGG encoder's WebAssembly binary is libvorbis and
// libogg, built by wasm-media-encoders 0.7.0; their notices are copied from the exact upstream commits it
// builds. The preview's UI kit adapts shadcn/ui's component styles and theme values.
const VENDORED = [
  { name: 'libvorbis', version: '1.3.7', license: 'BSD-3-Clause', file: 'licenses/libvorbis.txt' },
  { name: 'libogg', version: '1.3.4', license: 'BSD-3-Clause', file: 'licenses/libogg.txt' },
  { name: 'shadcn/ui', version: 'styles adapted in the preview kit', license: 'MIT', file: 'licenses/shadcn-ui.txt' },
];

// Vite's license list only covers JavaScript imports. The Geist fonts arrive through CSS, the Xiph
// libraries inside a .wasm file and the shadcn/ui styles as adapted code, so their licenses are appended
// once the build has written the file.
function extraLicenses() {
  const require = createRequire(import.meta.url);
  return {
    name: 'extra-licenses',
    apply: 'build',
    writeBundle({ dir }) {
      const append = (name, version, license, text) => appendFileSync(join(dir, LICENSE_FILE), `\n## ${name} - ${version} (${license})\n\n${text.trim()}\n`);
      for (const name of FONT_PACKAGES) {
        const pkgPath = require.resolve(`${name}/package.json`);
        const { version, license } = JSON.parse(readFileSync(pkgPath, 'utf8'));
        append(name, version, license, readFileSync(join(pkgPath, '..', 'LICENSE'), 'utf8'));
      }
      for (const lib of VENDORED) append(lib.name, lib.version, lib.license, readFileSync(lib.file, 'utf8'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), extraLicenses()],
  build: {
    // React, Radix and the audio engine ship as one chunk; splitting it buys little for a single-screen tool.
    chunkSizeWarningLimit: 700,
    // Lists every bundled package and font with its license, served next to the app.
    license: { fileName: LICENSE_FILE },
  },
});
