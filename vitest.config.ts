import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/test-setup.ts']
  },
  resolve: {
    alias: {
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/components': path.resolve(__dirname, 'components'),
      '@/prompts': path.resolve(__dirname, 'prompts'),
      '@/config': path.resolve(__dirname, 'config'),
      '@/scripts': path.resolve(__dirname, 'scripts')
    }
  }
});
