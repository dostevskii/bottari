// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { seal, unseal } from '../src/crypto/envelope.js';

const dek = crypto.randomBytes(32);

test('roundtrip preserves bytes exactly', () => {
  const plain = crypto.randomBytes(70000);
  const blob = seal(plain, dek, { oid: 'abc123' });
  const { plain: back, header } = unseal(blob, dek, { expectOid: 'abc123' });
  assert.ok(back.equals(plain));
  assert.equal(header.oid, 'abc123');
  assert.equal(header.gzip, false);
});

test('gzip roundtrip preserves bytes and shrinks compressible data', () => {
  const plain = Buffer.from('{"line":1}\n'.repeat(5000));
  const blob = seal(plain, dek, { gzip: true });
  assert.ok(blob.length < plain.length / 3);
  const { plain: back } = unseal(blob, dek);
  assert.ok(back.equals(plain));
});

test('a single flipped bit anywhere is rejected', () => {
  const blob = seal(Buffer.from('hello'), dek);
  for (const pos of [0, 5, 20, blob.length - 20, blob.length - 1]) {
    const bad = Buffer.from(blob);
    bad[pos] ^= 1;
    assert.throws(() => unseal(bad, dek), /envelope|decryption failed/);
  }
});

test('header tampering fails even when the ciphertext is intact', () => {
  const blob = seal(Buffer.from('hello'), dek, { oid: 'real' });
  const text = blob.toString('latin1');
  const swapped = Buffer.from(text.replace('"oid":"real"', '"oid":"fake"'), 'latin1');
  assert.throws(() => unseal(swapped, dek), /decryption failed/);
});

test('a blob fetched under the wrong object id is refused', () => {
  const blob = seal(Buffer.from('hello'), dek, { oid: 'real' });
  assert.throws(() => unseal(blob, dek, { expectOid: 'other' }), /object id mismatch/);
});

test('the wrong key never opens anything', () => {
  const blob = seal(Buffer.from('hello'), dek);
  assert.throws(() => unseal(blob, crypto.randomBytes(32)), /decryption failed/);
});

test('garbage input is refused with a clear error', () => {
  assert.throws(() => unseal(Buffer.from('nope'), dek), /too short/);
  assert.throws(() => unseal(crypto.randomBytes(200), dek), /bad magic/);
  const huge = seal(Buffer.from('x'), dek);
  huge.writeUInt32LE(2 ** 31, 4);
  assert.throws(() => unseal(huge, dek), /bad header length/);
});
