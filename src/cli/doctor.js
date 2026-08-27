// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { openCloud, obtainDek } from './context.js';
import { checkStore } from '../core/maintenance.js';
import { hasRefreshToken } from '../auth/token-store.js';
import { backendLabel } from '../keychain/index.js';
import { loadPendingState } from '../core/conflicts.js';
import { log } from '../util/log.js';

export default async function doctor() {
  let bad = 0;
  const ok = (label, value = '') => log.out(`  ok      ${label}${value ? '  ' + value : ''}`);
  const fail = (label, why) => { bad++; log.out(`  PROBLEM ${label}  ${why}`); };

  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 20) ok('Node.js', process.versions.node);
  else fail('Node.js', `${process.versions.node} — 20 or newer is required`);

  ok('secret store', await backendLabel());
  if (await hasRefreshToken()) ok('sign-in', 'stored sign-in present');
  else fail('sign-in', 'none — run `bottari login`');

  const pending = loadPendingState();
  if (pending.conflicts.length) {
    log.out(`  note    ${pending.conflicts.length} unresolved conflict(s) — \`bottari resolve\``);
  }

  let ctx;
  try {
    ctx = await openCloud({ interactive: false });
  } catch (e) {
    fail('cloud access', e.message);
    return 1;
  }
  if (!ctx.meta) {
    log.out('  note    no bundle in the cloud yet (pre-`bottari init` state)');
    return bad ? 1 : 0;
  }
  ok('meta', `schema ${ctx.meta.schema}, HEAD generation ${ctx.meta.head}`);

  const lock = await ctx.files.findChild('lock.json', ctx.store.rootId);
  if (lock) {
    try {
      const l = JSON.parse((await ctx.files.download(lock.id)).toString());
      if (l.expiresAt > Date.now()) log.out('  note    another sync\'s lock is live');
      else log.out('  note    an expired lock remains (`bottari sync --force-unlock`)');
    } catch { log.out('  note    an unreadable lock file exists'); }
  }

  const dek = await obtainDek(ctx);
  const report = await checkStore(ctx.store, ctx.meta, dek);
  if (!report.headReadable) {
    fail('HEAD manifest', report.reason);
    return 1;
  }
  ok('HEAD manifest', `${report.entryCount} entries decrypted and verified`);
  if (report.missingObjects.length) {
    fail('object integrity', `${report.missingObjects.length} object(s) missing (deleted in the Drive web UI?). ` +
      'If this machine still has the originals, the next sync heals it.');
  } else {
    ok('object integrity', `all ${report.neededObjects} objects HEAD needs exist`);
  }
  if (report.unreferencedByHead > 0) {
    log.out(`  note    ${report.unreferencedByHead} object(s) not referenced by HEAD (older generations — \`bottari prune\`)`);
  }
  return bad ? 1 : 0;
}
