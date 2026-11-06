/**
 * Đọc kết quả Vitest JSON (.vitest-results.json) và cập nhật `passes` / `overallPass`
 * trong docs/requirements/2026-11-05-personal-productivity-hub-bdd/*.json.
 * Scenario khớp theo tên test (title) == trường `scenario`. Không có test → false.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BDD_DIR = join(ROOT, 'docs', 'requirements', '2026-11-05-personal-productivity-hub-bdd');
const RESULTS = join(ROOT, '.vitest-results.json');

type Assertion = { title: string; status: string };
type Results = { testResults: { assertionResults: Assertion[] }[] };

if (!existsSync(RESULTS)) {
  console.error('Không tìm thấy .vitest-results.json — chạy `npm run test:bdd`.');
  process.exit(1);
}

const results = JSON.parse(readFileSync(RESULTS, 'utf8')) as Results;
const status = new Map<string, string>();
for (const file of results.testResults) {
  for (const a of file.assertionResults) {
    const prev = status.get(a.title);
    // nếu cùng tên xuất hiện nhiều lần, chỉ pass khi tất cả pass
    status.set(a.title, prev && prev !== 'passed' ? prev : a.status);
  }
}

let total = 0;
let passed = 0;
const missing: string[] = [];
const lines: string[] = [];
for (const file of readdirSync(BDD_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(BDD_DIR, file);
  const data = JSON.parse(readFileSync(path, 'utf8')) as { feature: string; overallPass: boolean; bdd: { scenario: string; passes: boolean }[] }[];
  let fp = 0;
  let ft = 0;
  for (const feature of data) {
    for (const s of feature.bdd) {
      const st = status.get(s.scenario);
      s.passes = st === 'passed';
      if (!st) missing.push(`${file} :: ${s.scenario}`);
      ft++;
      if (s.passes) fp++;
    }
    feature.overallPass = feature.bdd.every((s) => s.passes);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  total += ft;
  passed += fp;
  lines.push(`${fp === ft ? '✔' : '✘'} ${file.padEnd(40)} ${String(fp).padStart(3)}/${ft}`);
}

console.log('\nBDD acceptance report');
console.log(lines.join('\n'));
console.log(`\nTOTAL ${passed}/${total} scenarios pass`);
if (missing.length) console.log(`Chưa có test: ${missing.length} scenario`);
if (process.argv.includes('--missing')) console.log(missing.join('\n'));
