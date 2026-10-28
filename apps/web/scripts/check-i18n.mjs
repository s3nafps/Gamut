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
const coreErrors = readFileSync(new URL('../../../packages/core/src/errors.ts', import.meta.url), 'utf8').match(/ERROR_CODES = \[([\s\S]*?)\]/)[1];
for (const m of coreErrors.matchAll(/'([a-z_]+)'/g)) used.add(`errors.${m[1]}`);
const missing = [...used].filter((k) => !keys.en.has(k));
if (missing.length) {
  console.error('used in code but missing:', missing.join(', '));
  process.exit(1);
}
console.log(`all ${used.size} keys used in code are translated`);
