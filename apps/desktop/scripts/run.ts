/**
 * Chạy thử bản .stage bằng Electron, dữ liệu nằm TRONG repo (apps/desktop/.run-data), không đụng %APPDATA%.
 *   npx tsx apps/desktop/scripts/run.ts           → mở app (cửa sổ + khay)
 *   npx tsx apps/desktop/scripts/run.ts --smoke   → kiểm tra tự động, ẩn, tự thoát (exit 0 = OK)
 * Biến PPH_PORT để đổi cổng (mặc định 4317).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronExe = require('electron') as unknown as string; // gói npm 'electron' trả về đường dẫn file chạy

const env: NodeJS.ProcessEnv = { ...process.env, PPH_USER_DATA: process.env.PPH_USER_DATA ?? join(DESKTOP, '.run-data') };
// VS Code đặt biến này cho process con → Electron sẽ chạy như Node thuần và không có API app.
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--smoke')) env.PPH_SMOKE = '1';

const child = spawn(electronExe, [join(DESKTOP, '.stage')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
