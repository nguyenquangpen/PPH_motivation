import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], test: { name: 'web', include: ['test/**/*.test.tsx', 'test/**/*.test.ts'], environment: 'jsdom', setupFiles: ['./test/setup.ts'] } });
