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
    const pass = await passphrase('보따리 암호를 입력하세요: ');
    const dek = unwrapDek(ctx.meta.key, pass); // wrong passphrase throws here
    if (rememberKey) {
      await setSecret(DEK_KEY, dek.toString('hex'));
      log.info('열쇠를 이 컴퓨터의 자격증명 저장소에 보관했습니다 (MCP에서 암호 없이 사용 가능).');
    }
    return dek;
  }

  log.out('');
  log.out('★ 지금 정하는 암호가 보따리 전체를 잠급니다.');
  log.out('★ 이 암호를 잊어버리면 클라우드에 올린 데이터를 여는 방법이 없습니다.');
  const pass = await passphrase('새 암호를 정하세요 (8자 이상): ');
  if (pass.length < 8) throw new Error('암호는 8자 이상이어야 합니다.');
  const again = await passphrase('확인을 위해 한 번 더: ');
  if (pass !== again) throw new Error('두 입력이 서로 다릅니다. 처음부터 다시 시도하세요.');

  const dek = generateDek();
  const meta = { schema: 1, key: wrapDek(dek, pass), head: 0, headManifestId: null };
  const id = await writeMeta(ctx.store, meta, ctx.metaFileId);
  ctx.meta = meta;
  ctx.metaFileId = id;
  if (rememberKey) await setSecret(DEK_KEY, dek.toString('hex'));
  return dek;
}
