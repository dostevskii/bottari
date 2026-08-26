// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Key hierarchy. A random 32-byte DEK encrypts every object in the store.
// The user's passphrase never touches data directly: scrypt derives a KEK
// that wraps the DEK, so changing the passphrase re-wraps one 32-byte value
// instead of re-encrypting everything already uploaded.
//
// The wrapped-key record is fetched from the cloud before anything about it
// can be trusted, and its scrypt cost parameters have to be honoured before
// the GCM tag can prove anything — there is no way around that ordering. A
// hostile record could therefore ask for 2^31 and exhaust memory. Bound the
// parameters before deriving.

import crypto from 'node:crypto';

export const KDF_DEFAULT = { logN: 17, r: 8, p: 1 };

const MIN_LOG_N = 14;
const MAX_LOG_N = 20;
const MAX_R = 32;
const MAX_P = 4;
const WRAP_AAD = Buffer.from('bottari/dek-wrap/v1');

export function checkKdfParams({ logN, r, p }) {
  if (
    !Number.isInteger(logN) || logN < MIN_LOG_N || logN > MAX_LOG_N ||
    !Number.isInteger(r) || r < 1 || r > MAX_R ||
    !Number.isInteger(p) || p < 1 || p > MAX_P
  ) {
    throw new Error(
      `refusing scrypt parameters logN=${logN} r=${r} p=${p} ` +
      `(allowed: logN ${MIN_LOG_N}..${MAX_LOG_N}, r 1..${MAX_R}, p 1..${MAX_P})`,
    );
  }
}

export function deriveKek(passphrase, salt, params = KDF_DEFAULT) {
  checkKdfParams(params);
  const { logN, r, p } = params;
  // scrypt needs 128*N*r bytes; double it so Node never silently refuses.
  return crypto.scryptSync(Buffer.from(passphrase, 'utf8'), salt, 32, {
    N: 2 ** logN, r, p, maxmem: 256 * r * 2 ** logN,
  });
}

export function generateDek() {
  return crypto.randomBytes(32);
}

// -> a JSON-safe record stored in bottari.meta.json
export function wrapDek(dek, passphrase, params = KDF_DEFAULT) {
  const salt = crypto.randomBytes(16);
  const kek = deriveKek(passphrase, salt, params);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, nonce);
  cipher.setAAD(WRAP_AAD);
  const ct = Buffer.concat([cipher.update(dek), cipher.final(), cipher.getAuthTag()]);
  return {
    kdf: { algo: 'scrypt', ...params, salt: salt.toString('base64') },
    wrap: { nonce: nonce.toString('base64'), data: ct.toString('base64') },
  };
}

// The GCM tag doubles as the passphrase check: a wrong passphrase derives a
// wrong KEK and authentication fails.
export function unwrapDek(record, passphrase) {
  const kdf = record?.kdf ?? {};
  if (kdf.algo !== 'scrypt') throw new Error(`unsupported KDF: ${kdf.algo}`);
  checkKdfParams(kdf); // before any derivation — see file header
  const salt = Buffer.from(String(kdf.salt), 'base64');
  if (salt.length !== 16) throw new Error('bad KDF salt');
  const kek = deriveKek(passphrase, salt, kdf);
  const nonce = Buffer.from(String(record.wrap?.nonce ?? ''), 'base64');
  const data = Buffer.from(String(record.wrap?.data ?? ''), 'base64');
  if (nonce.length !== 12 || data.length < 16 + 32) {
    throw new Error('corrupted key record');
  }
  const ct = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, nonce);
  decipher.setAAD(WRAP_AAD);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('wrong passphrase (or corrupted key record)');
  }
}

// Deterministic per-purpose subkeys, so the DEK stays the only secret.
export function subkey(dek, purpose) {
  return Buffer.from(
    crypto.hkdfSync('sha256', dek, Buffer.alloc(0), `bottari/${purpose}/v1`, 32),
  );
}

// Object file name on Drive: HMAC of the plaintext hash, so the store
// leaks no known-file fingerprints.
export function objectId(objKey, plainHashHex) {
  return crypto.createHmac('sha256', objKey).update(plainHashHex).digest('hex');
}
