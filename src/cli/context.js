// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Shared bootstrap for every cloud-touching command: sign in, open the
// store, and obtain the DEK — creating the whole store on first use.

import { makeClient } from '../drive/client.js';
import { makeFiles } from '../drive/files.js';
import { getAccessToken } from '../auth/token-store.js';
import { fetchRemoteState } from '../core/orchestrator.js';
import { writeMeta } from '../core/generation.js';
import { getSecret, setSecret } from '../keychain/index.js';
import { generateDek, wrapDek, unwrapDek } from '../crypto/keys.js';
import { askHidden } from './prompt.js';
import { log } from '../util/log.js';

const DEK_KEY = 'bottari-dek';

export async function openCloud({ interactive = true } = {}) {
  const client = makeClient({ getAccessToken: () => getAccessToken({ interactive }) });
  const files = makeFiles(client);
  return { files, ...(await fetchRemoteState(files)) };
}

async function passphrase(promptText) {
  // BOTTARI_PASSPHRASE serves scripted verification; interactive use never
  // needs it and the value shows up nowhere on disk.
  if (process.env.BOTTARI_PASSPHRASE) return process.env.BOTTARI_PASSPHRASE;
  return askHidden(promptText);
}

// meta present → unlock (keychain DEK first, then passphrase).
// meta absent  → first use: create DEK, wrap it, write the store meta.
export async function obtainDek(ctx, { rememberKey = false } = {}) {
  if (ctx.meta) {
    const stored = await getSecret(DEK_KEY);
    if (stored) return Buffer.from(stored, 'hex');
    const pass = await passphrase('password: ');
    const dek = unwrapDek(ctx.meta.key, pass); // wrong passphrase throws here
    if (rememberKey) {
      await setSecret(DEK_KEY, dek.toString('hex'));
      log.info('Key stored in this machine\'s credential store (MCP can now work without the password).');
    }
    return dek;
  }

  log.out('');
  log.out('* The password you choose now locks the entire bundle.');
  log.out('* If you forget it, there is NO way to open the data in the cloud.');
  const pass = await passphrase('new password (8+ characters): ');
  if (pass.length < 8) throw new Error('The password must be at least 8 characters.');
  const again = await passphrase('confirm password: ');
  if (pass !== again) throw new Error('The two entries do not match. Start over.');

  const dek = generateDek();
  const meta = { schema: 1, key: wrapDek(dek, pass), head: 0, headManifestId: null };
  const id = await writeMeta(ctx.store, meta, ctx.metaFileId);
  ctx.meta = meta;
  ctx.metaFileId = id;
  if (rememberKey) await setSecret(DEK_KEY, dek.toString('hex'));
  return dek;
}
