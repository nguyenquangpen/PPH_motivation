import { defineConfig } from 'vitest/config';

/** E2E trên trình duyệt thật (Microsoft Edge qua playwright-core). Chạy tuần tự, timeout dài. */
export default defineConfig({
  test: {
    name: 'e2e',
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
