import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.js so tests skip the React, Tailwind and license plugins. Files that
// need a DOM opt in with a `// @vitest-environment jsdom` comment.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
