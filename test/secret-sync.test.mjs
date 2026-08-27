// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Opt-in secret syncing. The values below are hand-typed test strings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-ss-'));
const HOME_A = path.join(tmp, 'a');
const HOME_B = path.join(tmp, 'b');
process.env.BOTTARI_HOME = HOME_A;
process.env.BOTTARI_KEYCHAIN = 'file';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const ss = await import('../src/core/secret-sync.js');
const kc = await import('../src/keychain/index.js');
const { generateDek } = await import('../src/crypto/keys.js');

// minimal in-memory Drive: only what secret-sync touches
function fakeFiles() {
  const nodes = new Map();
  let seq = 0;
  return {
    nodes,
    async findChild(name) {
      for (const [id, n] of nodes) if (n.name === name) return { id, name };
      return null;
    },
    async uploadSmall({ name, data, fileId }) {
      const id = fileId ?? `id${++seq}`;
      nodes.set(id, { name, data: Buffer.from(data) });
      return { id, name };
    },
    async download(id) { return Buffer.from(nodes.get(id).data); },
  };
}

const files = fakeFiles();
const store = { rootId: 'root' };
const dek = generateDek();

const as = (home) => { process.env.BOTTARI_HOME = home; };

test('off by default — nothing is published', async () => {
  as(HOME_A);
  assert.equal(ss.isEnabled(), false);
  await kc.setSecret('secret:api-one', 'token-one-value');
  assert.equal(await ss.syncSecrets(store, files, dek), null);
  assert.equal(await files.findChild('secrets.enc'), null);
});

test('once enabled, secrets travel to a machine that lacks them', async () => {
  as(HOME_A);
  ss.setEnabled(true);
  const r = await ss.syncSecrets(store, files, dek);
  assert.equal(r.pushed, 1);

  as(HOME_B);
  ss.setEnabled(true);
  assert.equal(await kc.getSecret('secret:api-one'), null, 'B starts without it');
  const rb = await ss.syncSecrets(store, files, dek);
  assert.equal(rb.added, 1);
  assert.equal(await kc.getSecret('secret:api-one'), 'token-one-value');
});

test("a machine's own value is never overwritten by the bundle", async () => {
  as(HOME_B);
  await kc.setSecret('secret:api-one', 'B-has-its-own');
  await ss.syncSecrets(store, files, dek);
  assert.equal(await kc.getSecret('secret:api-one'), 'B-has-its-own');
});

test('secrets from both machines survive — union, not replacement', async () => {
  as(HOME_B);
  await kc.setSecret('secret:api-two', 'token-two-value');
  await ss.syncSecrets(store, files, dek);

  as(HOME_A);
  const r = await ss.syncSecrets(store, files, dek);
  assert.ok(r.added >= 1);
  assert.equal(await kc.getSecret('secret:api-two'), 'token-two-value');
  assert.equal(await kc.getSecret('secret:api-one'), 'token-one-value', "A keeps its own");
});

// The whole scheme is worthless if the key that opens the store, or the
// sign-in that reaches it, ever rides inside it.
test('the data key and the Google sign-in are never published', async () => {
  as(HOME_A);
  await kc.setSecret('bottari-dek', 'DEADBEEF-the-data-key');
  await kc.setSecret('google-refresh-token', 'REFRESH-token-value');
  await kc.setSecret('secret:api-three', 'token-three-value');
  await ss.syncSecrets(store, files, dek);

  const { unseal } = await import('../src/crypto/envelope.js');
  const f = await files.findChild('secrets.enc');
  const body = unseal(await files.download(f.id), dek).plain.toString('utf8');
  assert.ok(body.includes('api-three'), 'ordinary secrets are there');
  assert.ok(!body.includes('DEADBEEF'), 'the data key must never be in the bundle');
  assert.ok(!body.includes('REFRESH-token-value'), 'the sign-in must never be in the bundle');
  assert.ok(!body.includes('bottari-dek') && !body.includes('google-refresh-token'));
});

test('disabling stops publishing, and an unreadable file is left alone', async () => {
  as(HOME_A);
  ss.setEnabled(false);
  await kc.setSecret('secret:api-four', 'token-four-value');
  assert.equal(await ss.syncSecrets(store, files, dek), null);

  ss.setEnabled(true);
  const f = await files.findChild('secrets.enc');
  const before = Buffer.from(files.nodes.get(f.id).data);
  files.nodes.get(f.id).data = Buffer.from('not an envelope at all');
  const r = await ss.syncSecrets(store, files, dek);
  assert.equal(r.pushed, 0, 'a file it cannot open must not be clobbered');
  files.nodes.get(f.id).data = before;
});
