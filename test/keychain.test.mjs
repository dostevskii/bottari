// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// BOTTARI_HOME points at a temp dir before any import, so no vault file
// ever lands in the real home directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BOTTARI_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-kc-'));

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');

test('file fallback store: set/get/remove roundtrip', async () => {
  process.env.BOTTARI_KEYCHAIN = 'file';
  const kc = await import('../src/keychain/index.js');
  await kc.setSecret('t-alpha', 'value-1');
  await kc.setSecret('t-beta', '한글 값도 그대로');
  assert.equal(await kc.getSecret('t-alpha'), 'value-1');
  assert.equal(await kc.getSecret('t-beta'), '한글 값도 그대로');
  await kc.deleteSecret('t-alpha');
  assert.equal(await kc.getSecret('t-alpha'), null);
  assert.equal(await kc.getSecret('never-set'), null);
});

test('platform backend roundtrip (real DPAPI on Windows)', { skip: process.platform !== 'win32' }, async () => {
  const win = await import('../src/keychain/win.js');
  win.set('bottari-selftest', 'secret-value-123');
  assert.equal(win.get('bottari-selftest'), 'secret-value-123');
  // the value must not sit in the vault file as plaintext
  const vault = fs.readFileSync(
    path.join(process.env.BOTTARI_HOME, '.bottari', 'vault.win.json'), 'utf8');
  assert.ok(!vault.includes('secret-value-123'));
  win.remove('bottari-selftest');
  assert.equal(win.get('bottari-selftest'), null);
});
