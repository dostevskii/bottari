// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Object envelope — the byte format of every encrypted blob in the store:
//
//   "BTR1" | u32le header length | header JSON | ciphertext | 16-byte tag
//
// Magic, length field and header are all fed to GCM as AAD, so nothing
// before the ciphertext can be altered without the tag failing. The header
// carries the object id: a blob renamed on Drive to stand in for another
// object is rejected at open time, not silently accepted.

import crypto from 'node:crypto';
import { gzipBuf, gunzipBuf } from '../util/gzip.js';

const MAGIC = Buffer.from('BTR1');
const ALG = 'aes-256-gcm';
const TAG_LEN = 16;
const MAX_HEADER = 64 * 1024;

export function seal(plain, dek, { oid, gzip = false } = {}) {
  if (!Buffer.isBuffer(plain)) throw new TypeError('plain must be a Buffer');
  if (!Buffer.isBuffer(dek) || dek.length !== 32) throw new TypeError('dek must be 32 bytes');
  const body = gzip ? gzipBuf(plain) : plain;
  const nonce = crypto.randomBytes(12);
  const header = Buffer.from(JSON.stringify({
    v: 1,
    alg: ALG,
    nonce: nonce.toString('base64'),
    gzip,
    ...(oid ? { oid } : {}),
  }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(header.length, 0);
  const aad = Buffer.concat([MAGIC, len, header]);
  const cipher = crypto.createCipheriv(ALG, dek, nonce);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([MAGIC, len, header, ct, cipher.getAuthTag()]);
}

// opts.expectOid: the id this blob was fetched as; mismatch is an error.
export function unseal(blob, dek, { expectOid } = {}) {
  if (!Buffer.isBuffer(blob) || blob.length < MAGIC.length + 4 + TAG_LEN) {
    throw new Error('not a bottari envelope: too short');
  }
  if (!blob.subarray(0, 4).equals(MAGIC)) {
    throw new Error('not a bottari envelope: bad magic');
  }
  const hlen = blob.readUInt32LE(4);
  if (hlen === 0 || hlen > MAX_HEADER || 8 + hlen + TAG_LEN > blob.length) {
    throw new Error('not a bottari envelope: bad header length');
  }
  const headerBytes = blob.subarray(8, 8 + hlen);
  let header;
  try {
    header = JSON.parse(headerBytes.toString('utf8'));
  } catch {
    throw new Error('not a bottari envelope: header is not JSON');
  }
  if (header.v !== 1 || header.alg !== ALG) {
    throw new Error(`unsupported envelope: v=${header.v} alg=${header.alg}`);
  }
  const nonce = Buffer.from(String(header.nonce ?? ''), 'base64');
  if (nonce.length !== 12) throw new Error('not a bottari envelope: bad nonce');
  if (expectOid && header.oid !== expectOid) {
    throw new Error('envelope object id mismatch: this blob is not the object it was fetched as');
  }
  const ct = blob.subarray(8 + hlen, blob.length - TAG_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const aad = Buffer.concat([MAGIC, blob.subarray(4, 8), headerBytes]);
  const decipher = crypto.createDecipheriv(ALG, dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  let body;
  try {
    body = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('decryption failed: wrong key or tampered data');
  }
  return { plain: header.gzip ? gunzipBuf(body) : body, header };
}
