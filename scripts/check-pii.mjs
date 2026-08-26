// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Refuses to let personal identifiers into the repository. Two layers:
//
//   1. Generic patterns — any real-looking home path or email address.
//      Fixtures and docs must use placeholder homes (example) or template
//      forms (<user>, $HOME, %USERPROFILE%).
//   2. .pii-denylist.local — the developer's actual identifiers. The file
//      is gitignored on purpose: committing the list would itself violate
//      the rule it enforces. Its absence only warns, so a fresh clone of
//      the public repo still passes.
//
// The only identity allowed anywhere is the copyright one, and it is
// allowed per line, not per file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'scripts/check-pii.mjs';
const DENYLIST_FILE = '.pii-denylist.local';

const ALLOWED_IDENTITY = ['JUNG HWANGBO', 'dostevskii@gmail.com'];

// Built without literal path text so the scanner cannot flag itself.
const BS = String.fromCharCode(92);
const PLACEHOLDER = '(?!example\\b|<|\\$|%)';
const GENERIC = [
  {
    name: 'windows-home-path',
    // one-or-more separators, so JS-escaped paths ("C:\\Users\\…") match too
    re: new RegExp('[A-Za-z]:[' + BS + BS + '/]+Users[' + BS + BS + '/]+' + PLACEHOLDER + '[A-Za-z0-9._-]+', 'g'),
  },
  { name: 'unix-home-path', re: new RegExp('/home/' + PLACEHOLDER + '[A-Za-z0-9._-]+', 'g') },
  { name: 'mac-home-path', re: new RegExp('/Users/' + PLACEHOLDER + '[A-Za-z0-9._-]+', 'g') },
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

function listFiles() {
  const out = execFileSync(
    'git', ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out.split('\n').filter(Boolean);
}

function loadDenylist() {
  const p = path.join(ROOT, DENYLIST_FILE);
  if (!fs.existsSync(p)) {
    console.warn(`경고: ${DENYLIST_FILE} 이 없어 개발자 식별자 검사는 건너뜁니다 (일반 패턴 검사만 수행).`);
    return [];
  }
  // A tracked denylist would publish the identifiers itself. Hard stop.
  try {
    execFileSync('git', ['check-ignore', '-q', DENYLIST_FILE], { cwd: ROOT });
  } catch {
    console.error(`오류: ${DENYLIST_FILE} 이 gitignore 되어 있지 않습니다. 커밋되면 그 자체가 유출입니다.`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

const denylist = loadDenylist();
const findings = [];

for (const rel of listFiles()) {
  if (rel === SELF || rel === 'LICENSE') continue;
  let text;
  try {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isIdentityLine = ALLOWED_IDENTITY.some((s) => line.includes(s));
    for (const { name, re } of GENERIC) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        if (name === 'email' && isIdentityLine) continue;
        findings.push({ rel, line: i + 1, name, match: m[0] });
      }
    }
    for (const word of denylist) {
      if (line.toLowerCase().includes(word.toLowerCase())) {
        findings.push({ rel, line: i + 1, name: 'denylist', match: word });
      }
    }
  }
}

if (findings.length) {
  console.error(`개인정보 검사 실패 — ${findings.length}건:`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  [${f.name}]  ${f.match}`);
  }
  process.exit(1);
}
console.log('개인정보 검사 통과 (0건).');
