/**
 * Personal Productivity Hub — Electron main process.
 * - Chạy Hub (API + scheduler + backup + giao diện web) ngay trong process này, cổng cố định 127.0.0.1:4317.
 * - Cửa sổ chỉ là trình hiển thị http://127.0.0.1:4317; đóng cửa sổ → thu xuống khay, không thoát.
 * - Khay hệ thống: Mở Hub / Khởi động cùng Windows / Thoát. Một instance duy nhất.
 * - Notification của Hub → toast Windows; bấm toast mở đúng trang.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, nativeImage, Notification, shell, Tray } from 'electron';
import { startHub, type Hub, type HubNotification } from '../../server/src/hub.js';

const PORT = Number(process.env.PPH_PORT ?? 4317);
const APP_ID = 'vn.pph.productivity-hub';
/** Smoke test: không tray, không cửa sổ hiện, không toast; tải trang, kiểm tra rồi tự thoát (exit code 0/1). */
const SMOKE = process.env.PPH_SMOKE === '1';
const startHidden = SMOKE || process.argv.includes('--hidden');
// Cho phép đặt thư mục dữ liệu khác %APPDATA% (dùng khi chạy thử trong repo).
if (process.env.PPH_USER_DATA) app.setPath('userData', process.env.PPH_USER_DATA);
// Khi đóng gói, __dirname = thư mục chứa main.cjs (cùng cấp web/, migrations/, assets/)
const RES = __dirname;
const asset = (name: string) => join(RES, 'assets', name);

let hub: Hub | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const logFile = () => join(app.getPath('userData'), 'logs', 'hub.log');
function log(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true });
    appendFileSync(logFile(), line);
  } catch { /* bỏ qua lỗi ghi log */ }
  if (!app.isPackaged) process.stdout.write(line);
}

/** Đường dẫn trong giao diện tương ứng với đối tượng của notification. */
function routeFor(n: Pick<HubNotification, 'type' | 'objectType' | 'objectId'>): string {
  if (n.objectType === 'TASK' && n.objectId) return `/tasks/${n.objectId}`;
  if (n.objectType === 'GOAL' && n.objectId) return `/goals/${n.objectId}`;
  if (n.type === 'LEVEL_UP' || n.type === 'POOL_REWARD') return '/rewards#transactions';
  return '/';
}

function showWindow(route?: string): void {
  if (!hub) return;
  if (!win || win.isDestroyed()) createWindow();
  if (route) void win!.loadURL(hub.url + route);
  if (win!.isMinimized()) win!.restore();
  win!.show();
  win!.focus();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1100, minHeight: 680,
    title: 'Personal Productivity Hub',
    icon: asset('icon.png'),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Liên kết ra ngoài Hub mở bằng trình duyệt mặc định
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(hub!.url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(hub!.url)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win!.hide();
    }
  });
  void win.loadURL(hub!.url);
  win.once('ready-to-show', () => {
    if (!startHidden) win!.show();
  });
}

function autoStartEnabled(): boolean {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  log(`[autostart] ${enabled ? 'on' : 'off'}`);
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Mở Productivity Hub', click: () => showWindow() },
    { label: 'Tổng quan', click: () => showWindow('/') },
    { label: 'Công việc', click: () => showWindow('/tasks') },
    { type: 'separator' },
    {
      label: 'Khởi động cùng Windows', type: 'checkbox', checked: autoStartEnabled(),
      click: (item) => { setAutoStart(item.checked); tray?.setContextMenu(buildTrayMenu()); },
    },
    { label: 'Mở thư mục dữ liệu', click: () => void shell.openPath(join(app.getPath('userData'), 'data')) },
    { type: 'separator' },
    { label: 'Thoát', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')));
  tray.setToolTip('Personal Productivity Hub');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

function toast(n: HubNotification): void {
  if (SMOKE || !Notification.isSupported()) return;
  const t = new Notification({ title: n.title, body: n.body ?? '', icon: asset('icon.png'), silent: false });
  t.on('click', () => showWindow(routeFor(n)));
  t.show();
}

async function boot(): Promise<void> {
  const dataDir = join(app.getPath('userData'), 'data');
  try {
    hub = await startHub({
      dataDir,
      port: PORT,
      webDist: join(RES, 'web'),
      migrationsDir: join(RES, 'migrations'),
      onNotification: toast,
      log,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    log(`[boot] failed: ${err.stack ?? err.message}`);
    const msg = err.code === 'EADDRINUSE'
      ? `Cổng ${PORT} đang được ứng dụng khác sử dụng (có thể bản dev "npm run dev" đang chạy). Hãy tắt nó rồi mở lại Hub.`
      : `Không khởi động được Hub:\n${err.message}\n\nNhật ký: ${logFile()}`;
    quitting = true;
    if (SMOKE) {
      console.log(`SMOKE FAIL: ${msg}`);
      app.exit(1);
      return;
    }
    dialog.showErrorBox('Personal Productivity Hub', msg);
    app.quit();
    return;
  }
  if (SMOKE) return smoke();
  createTray();
  createWindow();
}

/** Kiểm tra bản build: API sống, giao diện tải được trong cửa sổ Electron (ẩn), có style. */
async function smoke(): Promise<void> {
  const fail = (m: string) => { console.log(`SMOKE FAIL: ${m}`); quitting = true; app.exit(1); };
  try {
    const health = (await (await fetch(`${hub!.url}/api/v1/health`)).json()) as { ok: boolean };
    if (!health.ok) return fail('health');
    createWindow();
    await new Promise<void>((resolve) => win!.webContents.once('did-finish-load', () => resolve()));
    // chờ React render Dashboard
    let text = '';
    for (let i = 0; i < 50 && !text.includes('Tổng quan'); i++) {
      await new Promise((r) => setTimeout(r, 200));
      text = (await win!.webContents.executeJavaScript('document.body.innerText')) as string;
    }
    if (!text.includes('Tổng quan')) return fail('dashboard không render');
    const styled = (await win!.webContents.executeJavaScript(
      "getComputedStyle(document.querySelector('aside')).width",
    )) as string;
    if (styled !== '208px') return fail(`thiếu style (aside width ${styled})`);
    console.log(`SMOKE OK: ${hub!.url} userData=${app.getPath('userData')}`);
    quitting = true;
    app.quit();
  } catch (e) {
    fail((e as Error).message);
  }
}

// ---------------- lifecycle ----------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (!SMOKE) app.setAppUserModelId(APP_ID); // cần cho toast Windows
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => showWindow());
  app.on('window-all-closed', () => { /* giữ app chạy nền trong khay */ });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', (e) => {
    if (hub) {
      e.preventDefault();
      const h = hub;
      hub = null;
      void h.stop().catch((err) => log(`[stop] ${(err as Error).message}`)).finally(() => app.exit(0));
    }
  });
  process.on('uncaughtException', (e) => log(`[uncaught] ${e.stack ?? e.message}`));
  void app.whenReady().then(boot);
}
