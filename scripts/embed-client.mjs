// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Embeds an OAuth client into src/auth/client-id.js from a downloaded
// Google client JSON:  node scripts/embed-client.mjs <client_secret.json>
// The encoded form is what ships; see client-id.js for why that is fine.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'auth', 'client-id.js',
);

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('사용법: node scripts/embed-client.mjs <client_secret.json>');
  process.exit(1);
}
const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const { client_id: id, client_secret: secret } = parsed.installed ?? {};
if (!id || !secret) {
  console.error('JSON에서 installed.client_id / client_secret 를 찾지 못했습니다.');
  process.exit(1);
}

const XOR_KEY = 0x5a;
const encode = (s) => {
  const raw = Buffer.from(s, 'utf8');
  for (let i = 0; i < raw.length; i++) raw[i] ^= XOR_KEY;
  return raw.toString('base64');
};

let src = fs.readFileSync(target, 'utf8');
src = src.replace(/const EMBEDDED_ID = '[^']*';/, `const EMBEDDED_ID = '${encode(id)}';`);
src = src.replace(/const EMBEDDED_SECRET = '[^']*';/, `const EMBEDDED_SECRET = '${encode(secret)}';`);
fs.writeFileSync(target, src);
console.log(`내장 완료: ${id.slice(0, 20)}… → src/auth/client-id.js`);
