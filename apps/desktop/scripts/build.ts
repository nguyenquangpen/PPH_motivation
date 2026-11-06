/**
 * Build bản desktop.
 *   npx tsx apps/desktop/scripts/build.ts          → .stage/ (chạy thử: npx electron apps/desktop/.stage)
 *   npx tsx apps/desktop/scripts/build.ts --pack   → + bộ cài Windows ở apps/desktop/release/ (chỉ tạo file .exe, KHÔNG chạy)
 *
 * Vì sao có thư mục .stage: better-sqlite3 là module native, phải build lại cho ABI của Electron.
 * Làm việc đó trong .stage (node_modules riêng) để KHÔNG phá bản better-sqlite3 của repo mà test Node đang dùng.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(DESKTOP, '..', '..');
const STAGE = join(DESKTOP, '.stage');
const RELEASE = join(DESKTOP, 'release');
const pack = process.argv.includes('--pack');
const require = createRequire(import.meta.url);

// Mọi cache/tải xuống của quá trình build nằm TRONG repo (apps/desktop/.cache, gitignored),
// không ghi vào %LOCALAPPDATA%, %USERPROFILE% hay cache npm chung của máy.
const CACHE = join(DESKTOP, '.cache');
Object.assign(process.env, {
  npm_config_cache: join(CACHE, 'npm'),          // npm install trong .stage
  npm_config_devdir: join(CACHE, 'node-gyp'),    // header khi phải biên dịch module native
  ELECTRON_CACHE: join(CACHE, 'electron'),       // electron-builder tải Electron để đóng gói
  ELECTRON_BUILDER_CACHE: join(CACHE, 'electron-builder'), // NSIS, winCodeSign
  PREBUILD_INSTALL_CACHE: join(CACHE, 'prebuilds'),
  TEMP: join(CACHE, 'tmp'),                      // electron-builder dựng tạm bộ cài ở đây thay vì %TEMP%
  TMP: join(CACHE, 'tmp'),
});
mkdirSync(join(CACHE, 'tmp'), { recursive: true });

const step = (m: string) => console.log(`\n▶ ${m}`);
const run = (cmd: string, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });

const version = (JSON.parse(readFileSync(join(DESKTOP, 'package.json'), 'utf8')) as { version: string }).version;
const electronVersion = (require('electron/package.json') as { version: string }).version;
const sqliteVersion = (require(require.resolve('better-sqlite3/package.json', { paths: [join(ROOT, 'apps', 'server')] })) as { version: string }).version;

step('Build giao diện web (vite)');
run('npm run build -w @pph/web');

step('Chuẩn bị thư mục .stage');
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
cpSync(join(ROOT, 'apps', 'web', 'dist'), join(STAGE, 'web'), { recursive: true });
cpSync(join(ROOT, 'apps', 'server', 'src', 'migrations'), join(STAGE, 'migrations'), { recursive: true });
cpSync(join(DESKTOP, 'assets'), join(STAGE, 'assets'), { recursive: true });

step('Bundle main process (esbuild)');
await esbuild({
  entryPoints: [join(DESKTOP, 'src', 'main.ts')],
  outfile: join(STAGE, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'better-sqlite3'],
  logLevel: 'warning',
  // db.ts chỉ dùng import.meta.url khi không truyền migrationsDir; bản desktop luôn truyền.
  define: { 'import.meta.url': '"file:///pph-desktop-bundle"' },
});

writeFileSync(join(STAGE, 'package.json'), JSON.stringify({
  name: 'personal-productivity-hub',
  productName: 'Personal Productivity Hub',
  version,
  description: 'Personal Productivity Hub — quản lý mục tiêu, công việc và động lực cá nhân',
  author: 'Nguyen Quang',
  main: 'main.cjs',
  dependencies: { 'better-sqlite3': sqliteVersion },
}, null, 2));

step(`Cài better-sqlite3@${sqliteVersion} và build lại cho Electron ${electronVersion}`);
run('npm install --omit=dev --no-audit --no-fund --no-package-lock', STAGE);
const { rebuild } = (await import('@electron/rebuild')) as typeof import('@electron/rebuild');
await rebuild({ buildPath: STAGE, electronVersion, onlyModules: ['better-sqlite3'] }); // dùng bản prebuilt cho Electron nếu có

console.log(`\n✔ .stage sẵn sàng — chạy thử: npx electron ${STAGE}`);

if (pack) {
  step('Đóng gói bộ cài Windows (electron-builder, NSIS)');
  const { build, Platform } = await import('electron-builder');
  const files = await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], 1 /* x64 */),
    config: {
      appId: 'vn.pph.productivity-hub',
      productName: 'Personal Productivity Hub',
      electronVersion,
      npmRebuild: false, // đã rebuild ở bước trên
      directories: { app: STAGE, output: RELEASE, buildResources: join(DESKTOP, 'assets') },
      files: ['**/*'],
      asar: true,
      asarUnpack: ['**/*.node'],
      win: { icon: join(DESKTOP, 'assets', 'icon.ico'), artifactName: 'PPH-Setup-${version}.${ext}' },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Productivity Hub',
        deleteAppDataOnUninstall: false,
      },
    },
  });
  console.log('\n✔ Bộ cài:');
  for (const f of files.filter((p) => p.endsWith('.exe'))) console.log(`  ${f}`);
  if (!existsSync(RELEASE)) process.exit(1);
}
