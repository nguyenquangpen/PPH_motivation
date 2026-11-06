import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startHub } from './hub.js';

const DATA_DIR = resolve(process.env.PPH_DATA_DIR ?? join(process.cwd(), '..', '..', 'data'));
const PORT = Number(process.env.PPH_PORT ?? 4317);
// Nếu đã build web (npm run build), server phục vụ luôn giao diện tại http://127.0.0.1:PORT
const WEB_DIST = resolve(process.env.PPH_WEB_DIST ?? join(process.cwd(), '..', 'web', 'dist'));

startHub({ dataDir: DATA_DIR, port: PORT, webDist: existsSync(join(WEB_DIST, 'index.html')) ? WEB_DIST : undefined }).catch((e) => {
  console.error(e);
  process.exit(1);
});
