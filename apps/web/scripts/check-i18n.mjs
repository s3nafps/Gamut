// Fails when a translation key exists in one language but not in another.
import { readFileSync } from 'node:fs';

const load = (l) => JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const langs = ['en', 'fr', 'ar'];
const keys = Object.fromEntries(langs.map((l) => [l, new Set(flat(load(l)))]));
let bad = 0;
for (const a of langs)
  for (const b of langs)
    for (const k of keys[a])
      if (!keys[b].has(k)) {
        console.error(`missing in ${b}: ${k}`);
        bad++;
      }
if (bad) process.exit(1);
console.log(`i18n ok — ${keys.en.size} keys in ${langs.join(', ')}`);

// Every static t('…') key used in the code must exist.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const srcDir = new URL('../src/', import.meta.url).pathname;
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) && files.push(join(d, f))));
walk(srcDir);
const used = new Set();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^'$]+)'/g)) used.add(m[1]);
// Keys built at runtime
for (const s of ['passed', 'in_repair', 'waiting_retest', 'scrapped']) used.add(`status.unit.${s}`);
for (const s of ['waiting_repair', 'in_repair', 'waiting_parts', 'waiting_retest', 'closed', 'scrapped']) used.add(`status.ticket.${s}`);
for (const r of ['tester', 'repairman', 'supervisor', 'admin']) used.add(`roles.${r}`);
for (const s of ['quality', 'repair', 'display']) used.add(`setup.type.${s}`);
for (const s of ['today', 'week', 'month', 'thisMonth', 'custom']) used.add(`reports.range.${s}`);
for (const s of ['used', 'received', 'count']) used.add(`parts.reason.${s}`);
for (const s of ['create', 'update']) used.add(`audit.action.${s}`);
const auditSrc = readFileSync(new URL('../src/pages/audit/AuditPage.tsx', import.meta.url), 'utf8').match(/EVENT_TYPES = \[([\s\S]*?)\]/)[1];
for (const m of auditSrc.matchAll(/'([a-z_]+)'/g)) used.add(`audit.type.${m[1]}`);
const adminSrc = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
for (const m of adminSrc.matchAll(/name: '([a-zA-Z]+)',\n\s+label/g)) used.add(`audit.entity.${m[1]}`);
const helpSrc = readFileSync(new URL('../src/pages/help/HelpPage.tsx', import.meta.url), 'utf8');
for (const m of helpSrc.matchAll(/key: '([a-z]+)'[^\n]*steps: (\d+)/g)) {
  used.add(`help.${m[1]}.title`);
  for (let i = 1; i <= Number(m[2]); i++) used.add(`help.${m[1]}.s${i}`);
}
for (let i = 1; i <= 5; i++) used.add(`help.rules.r${i}`);
const coreErrors = readFileSync(new URL('../../../packages/core/src/errors.ts', import.meta.url), 'utf8').match(/ERROR_CODES = \[([\s\S]*?)\]/)[1];
for (const m of coreErrors.matchAll(/'([a-z_]+)'/g)) used.add(`errors.${m[1]}`);
const missing = [...used].filter((k) => !keys.en.has(k));
if (missing.length) {
  console.error('used in code but missing:', missing.join(', '));
  process.exit(1);
}
console.log(`all ${used.size} keys used in code are translated`);
