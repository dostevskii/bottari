// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The last line of defence before an upload: does this buffer still carry
// a credential? Transformers are supposed to have stripped them — this
// gate assumes they have a bug.
//
// Tier A/B: any finding aborts the whole sync (fail-closed). Tier D
// (session transcripts) only reports: users paste keys into chats, the
// payload is encrypted anyway, and blocking would make session sync
// unusable.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { homeDir, atomicWrite } from '../util/fs.js';

const PATTERNS = [
  { kind: 'openai-key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'google-api-key', re: /AIza[A-Za-z0-9_-]{30,}/g },
  { kind: 'google-oauth-refresh', re: /1\/\/[A-Za-z0-9_-]{20,}/g },
  { kind: 'bearer-jwt', re: /Bearer\s+eyJ[A-Za-z0-9_-]{15,}/g },
  { kind: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'authorization-header', re: /"Authorization"\s*:\s*"(?!\$\{BOTTARI_SECRET:)[^"]{12,}"/g },
];

// Files whose whole purpose is holding credentials: refused by name, no
// matter what a content scan thinks.
const FORBIDDEN_NAMES = [
  /^\.credentials\.json$/, /^auth\.json$/, /^id_(rsa|ed25519|ecdsa)$/,
  /\.pem$/, /\.p12$/, /\.pfx$/, /^client_secret.*\.json$/,
];

export function isForbiddenName(baseName) {
  return FORBIDDEN_NAMES.some((re) => re.test(baseName));
}

// -> [{kind, match, fingerprint}] — the fingerprint identifies a finding
// for the allow list without ever storing the credential itself.
export function scanBuffer(buf) {
  if (buf.includes(0)) return []; // binary: nothing pattern-shaped to find
  const text = buf.toString('utf8');
  const findings = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      findings.push({
        kind,
        match: m[0].slice(0, 12) + '…',
        fingerprint: crypto.createHash('sha256').update(kind + ':' + m[0]).digest('hex').slice(0, 16),
      });
    }
  }
  return findings;
}

// Fingerprints the user explicitly accepted (documentation examples and
// the like). Only fingerprints live here, never the matched text.
const allowPath = () => path.join(homeDir(), '.bottari', 'scan-allow.json');

export function loadAllowed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(allowPath(), 'utf8')));
  } catch {
    return new Set();
  }
}

export function addAllowed(fingerprint) {
  const set = loadAllowed();
  set.add(fingerprint);
  atomicWrite(allowPath(), JSON.stringify([...set], null, 2) + '\n');
}

// tier A/B gate. allowed: Set of fingerprints the user accepted knowingly.
export function assertClean(logical, buf, allowed = new Set()) {
  const base = logical.split('/').at(-1);
  if (isForbiddenName(base)) {
    throw new Error(`업로드 중단: ${logical} 은 자격증명 파일입니다. 동기화 대상에서 제외하세요.`);
  }
  const hits = scanBuffer(buf).filter((f) => !allowed.has(f.fingerprint));
  if (hits.length) {
    const lines = hits.map((f) => `  ${logical}  [${f.kind}]  ${f.match}  (지문 ${f.fingerprint})`);
    throw new Error(
      '업로드 중단: 자격증명으로 보이는 내용이 남아 있습니다.\n' + lines.join('\n') +
      '\n실제 비밀이 아니라면 `bottari sync --allow-finding <지문>` 으로 해당 항목만 허용할 수 있습니다.',
    );
  }
}
