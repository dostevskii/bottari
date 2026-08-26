// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDek, wrapDek, unwrapDek, subkey, objectId, checkKdfParams,
} from '../src/crypto/keys.js';

// The full-cost path runs once; every other test uses the cheapest allowed
// parameters so the suite stays fast.
const FAST = { logN: 14, r: 8, p: 1 };

test('wrap/unwrap roundtrip at default cost', () => {
  const dek = generateDek();
  const record = wrapDek(dek, 'correct horse');
  assert.ok(unwrapDek(record, 'correct horse').equals(dek));
});

test('a wrong passphrase fails, and the record survives JSON', () => {
  const dek = generateDek();
  const record = JSON.parse(JSON.stringify(wrapDek(dek, 'right', FAST)));
  assert.ok(unwrapDek(record, 'right').equals(dek));
  assert.throws(() => unwrapDek(record, 'wrong'), /wrong passphrase/);
});

test('hostile cost parameters are refused before any derivation', () => {
  const record = wrapDek(generateDek(), 'pw', FAST);
  for (const logN of [13, 21, 31, 1.5, NaN]) {
    const hostile = { ...record, kdf: { ...record.kdf, logN } };
    const t0 = Date.now();
    // Even with the correct passphrase: the parameters alone are the offence.
    assert.throws(() => unwrapDek(hostile, 'pw'), /refusing scrypt parameters/);
    assert.ok(Date.now() - t0 < 100, 'must fail before deriving, not after');
  }
  assert.throws(() => checkKdfParams({ logN: 17, r: 64, p: 1 }), /refusing/);
  assert.throws(() => checkKdfParams({ logN: 17, r: 8, p: 5 }), /refusing/);
});

test('a corrupted record is an error, not a crash', () => {
  const record = wrapDek(generateDek(), 'pw', FAST);
  assert.throws(() => unwrapDek({ ...record, kdf: { ...record.kdf, algo: 'pbkdf2' } }, 'pw'), /unsupported KDF/);
  assert.throws(() => unwrapDek({ ...record, wrap: { nonce: 'AAAA', data: 'AAAA' } }, 'pw'), /corrupted key record/);
  const tampered = { ...record, wrap: { ...record.wrap, data: Buffer.from('x'.repeat(48)).toString('base64') } };
  assert.throws(() => unwrapDek(tampered, 'pw'), /wrong passphrase/);
});

test('subkeys are deterministic, distinct per purpose, and 32 bytes', () => {
  const dek = generateDek();
  const a = subkey(dek, 'objid');
  const b = subkey(dek, 'objid');
  const c = subkey(dek, 'other');
  assert.equal(a.length, 32);
  assert.ok(a.equals(b));
  assert.ok(!a.equals(c));
  assert.ok(!a.equals(dek));
});

test('object ids are deterministic and reveal nothing without the key', () => {
  const dek = generateDek();
  const key = subkey(dek, 'objid');
  const h = 'ab'.repeat(32);
  assert.equal(objectId(key, h), objectId(key, h));
  assert.notEqual(objectId(key, h), objectId(subkey(generateDek(), 'objid'), h));
  assert.match(objectId(key, h), /^[0-9a-f]{64}$/);
});
