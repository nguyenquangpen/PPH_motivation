/** Chạy Vitest (JSON reporter) rồi cập nhật passes/overallPass trong BDD JSON. Chạy được trên Windows/macOS/Linux. */
import { spawnSync } from 'node:child_process';

const vitest = spawnSync('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', '--outputFile=.vitest-results.json'], {
  stdio: 'inherit',
  shell: true,
});
const report = spawnSync('npx', ['tsx', 'scripts/bdd-report.ts', ...process.argv.slice(2)], { stdio: 'inherit', shell: true });
process.exit(vitest.status || report.status || 0);
