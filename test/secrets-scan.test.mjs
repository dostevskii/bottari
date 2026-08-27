// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Fake credentials only: every value below is a hand-typed test string.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BOTTARI_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-scan-'));

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { scanBuffer, assertClean, isForbiddenName, loadAllowed, addAllowed, redactText } =
  await import('../src/scan/secrets.js');

const B = (s) => Buffer.from(s, 'utf8');

test('each pattern family is caught', () => {
  const samples = {
    'openai-key': 'sk-abcdefghijklmnopqrstuvwx',
    'github-token': 'ghp_ABCDEFGHIJKLMNOPQRSTUVWX',
    'slack-token': 'xoxb-1234567890-abcdefghij',
    'google-api-key': 'AIzaSyA1234567890abcdefghijklmnopqrs',
    'google-oauth-refresh': '1//abcdefghijklmnopqrstuvwx',
    'bearer-jwt': 'Bearer eyJhbGciOiJIUzI1NiJ9',
    'private-key-block': '-----BEGIN RSA PRIVATE KEY-----',
    'authorization-header': '"Authorization": "some-long-plain-credential"',
  };
  for (const [kind, sample] of Object.entries(samples)) {
    const found = scanBuffer(B(`prefix ${sample} suffix`));
    assert.ok(found.some((f) => f.kind === kind), `${kind} not caught in: ${sample}`);
  }
});

test('prose containing a prefix mid-word is not a finding (real-data regression)', () => {
  // this exact string tripped the gate on a real skill CSV
  const prose = B('parallel-programming/task-based-asynchronous-programming and risk-based-assessment-notes');
  assert.deepEqual(scanBuffer(prose), []);
  // the same shape after a quote or space is still caught
  assert.equal(scanBuffer(B('key="sk-based-asynchronous-prog"'))[0]?.kind, 'openai-key');
  assert.equal(scanBuffer(B('token sk-abcdefghijklmnopqrstuv'))[0]?.kind, 'openai-key');
});

test('a placeholder is not a finding, binary is not scanned', () => {
  assert.deepEqual(scanBuffer(B('"Authorization": "${BOTTARI_SECRET:api-auth}"')), []);
  assert.deepEqual(scanBuffer(Buffer.from([0, 1, 2, 115, 107, 45])), []);
});

test('assertClean is fail-closed and names the fingerprint', () => {
  const dirty = B('key = "sk-abcdefghijklmnopqrstuvwx"');
  let err;
  try { assertClean('claude/settings.json', dirty); } catch (e) { err = e; }
  assert.match(err.message, /Upload refused/);
  assert.match(err.message, /fingerprint [0-9a-f]{16}/);
});

test('an allowed fingerprint passes, everything else still fails', () => {
  const dirty = B('example key: sk-abcdefghijklmnopqrstuvwx');
  const fp = scanBuffer(dirty)[0].fingerprint;
  addAllowed(fp);
  assert.ok(loadAllowed().has(fp));
  assertClean('docs/example.md', dirty, loadAllowed()); // must not throw
  assert.throws(
    () => assertClean('x', B('other: ghp_ABCDEFGHIJKLMNOPQRSTUVWX'), loadAllowed()),
    /Upload refused/,
  );
});

test('redaction strips every credential shape, keeps the rest', () => {
  const text = 'key = "sk-abcdefghijklmnopqrstuvwx" and token ghp_ABCDEFGHIJKLMNOPQRSTUVWX kept-text';
  const out = redactText(text);
  assert.ok(!out.includes('sk-abcdefghijklmnop') && !out.includes('ghp_'));
  assert.ok(out.includes('kept-text') && out.includes('[redacted]'));
});

test('credential files are refused by name alone', () => {
  for (const name of ['.credentials.json', 'auth.json', 'id_rsa', 'server.pem', 'client_secret_x.json']) {
    assert.ok(isForbiddenName(name), name);
    assert.throws(() => assertClean(`dir/${name}`, B('harmless')), /credential file/);
  }
  assert.ok(!isForbiddenName('settings.json'));
});
