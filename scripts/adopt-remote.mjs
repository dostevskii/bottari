// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// One-shot machine adoption: run a full sync answering every conflict
// with 'remote' — the cloud's version wins, this machine's overlay and
// unique files survive (union). For bringing a stale machine in line
// with the bundle without an interactive terminal.
//
//   node scripts/adopt-remote.mjs        # requires stored sign-in + key

import { openCloud } from '../src/cli/context.js';
import { runSync } from '../src/core/orchestrator.js';
import { acquireLock, releaseLock } from '../src/core/generation.js';
import { loadProfile } from '../src/model/config.js';
import { getSecret } from '../src/keychain/index.js';

const ctx = await openCloud({ interactive: false });
if (!ctx.meta) {
  console.error('No bundle in the cloud.');
  process.exit(1);
}
const dekHex = await getSecret('bottari-dek');
if (!dekHex) {
  console.error('No stored key on this machine.');
  process.exit(1);
}
const profile = loadProfile();
await acquireLock(ctx.store, profile.machineId, {});
try {
  const r = await runSync({
    store: ctx.store,
    dek: Buffer.from(dekHex, 'hex'),
    meta: ctx.meta,
    metaFileId: ctx.metaFileId,
    machineId: profile.machineId,
    io: { resolveConflict: async (p) => { console.error('conflict -> remote: ' + p); return 'remote'; } },
  });
  console.log(`adopted — generation ${r.generation}`);
  console.log(`  up ${r.applied.uploaded.length} · down ${r.applied.downloaded.length}`);
} finally {
  await releaseLock(ctx.store);
}
