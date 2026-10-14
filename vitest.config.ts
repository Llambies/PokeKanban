import { defineConfig } from 'vitest/config';
import { reactIcons } from './vite.config.ts';

export default defineConfig({
  plugins: [reactIcons()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
