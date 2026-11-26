import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * E2E trên trình duyệt thật (Microsoft Edge qua playwright-core). Chạy tuần tự, timeout dài.
 * Thư mục tạm (profile Edge tạm của Playwright, v.v.) nằm TRONG repo: e2e/.tmp (gitignored),
 * không ghi vào %TEMP% của máy.
 */
const TMP = fileURLToPath(new URL('./.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });

export default defineConfig({
  test: {
    name: 'e2e',
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: { TEMP: TMP, TMP, TMPDIR: TMP },
  },
});
