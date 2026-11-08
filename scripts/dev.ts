/** Chạy API server (tsx watch) và web (vite) cùng lúc. Ctrl+C dừng cả hai. */
import { spawn, type ChildProcess } from 'node:child_process';

const procs: ChildProcess[] = [
  spawn('npm', ['run', 'dev', '-w', '@pph/server'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev', '-w', '@pph/web'], { stdio: 'inherit', shell: true }),
];

const stop = (code = 0) => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
};
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const p of procs) p.on('exit', (code) => stop(code ?? 0));
