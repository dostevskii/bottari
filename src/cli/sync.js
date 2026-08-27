// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { openCloud, obtainDek } from './context.js';
import { runSync } from '../core/orchestrator.js';
import { acquireLock, releaseLock } from '../core/generation.js';
import { loadProfile } from '../model/config.js';
import { askChoice } from './prompt.js';
import { log } from '../util/log.js';

async function cliConflict(p, { localHash, remoteHash }) {
  log.out('');
  log.out(`conflict: ${p}`);
  log.out(`  this machine  ${localHash.slice(0, 12)}…`);
  log.out(`  cloud         ${remoteHash.slice(0, 12)}…`);
  const k = await askChoice('Which one should win?', [
    { key: 'l', label: 'this machine\'s version (the cloud gets updated)' },
    { key: 'r', label: 'the cloud\'s version (this machine\'s file changes)' },
    { key: 'b', label: 'keep both (the cloud version lands as a copy next to the file)' },
  ]);
  return { l: 'local', r: 'remote', b: 'both' }[k];
}

function report(r) {
  if (r.dryRun) {
    log.out(`[preview] current generation ${r.generation}`);
    for (const p of r.plan.uploads) log.out(`  up        ${p}`);
    for (const p of r.plan.downloads) log.out(`  down      ${p}`);
    for (const p of r.plan.conflicts) log.out(`  conflict  ${p}`);
    if (!r.plan.uploads.length && !r.plan.downloads.length && !r.plan.conflicts.length) {
      log.out('  nothing to do — both sides agree.');
    }
    return;
  }
  const a = r.applied;
  log.out('');
  log.out(`synced — generation ${r.generation}`);
  log.out(`  up ${a.uploaded.length} · down ${a.downloaded.length}` +
    (a.kept.length ? ` · kept copies ${a.kept.length}` : ''));
  if (r.pending.length) {
    log.out(`  unresolved conflicts: ${r.pending.length} — finish them with \`bottari resolve\`.`);
  }
}

// Shared by `sync` and `init` — the pipeline is identical once the store
// and the key are in hand.
export async function performSync(ctx, dek, { dryRun = false, force = false } = {}) {
  const profile = loadProfile();
  if (!dryRun) await acquireLock(ctx.store, profile.machineId, { force });
  try {
    const r = await runSync({
      store: ctx.store,
      dek,
      meta: ctx.meta,
      metaFileId: ctx.metaFileId,
      machineId: profile.machineId,
      io: { resolveConflict: cliConflict },
      dryRun,
    });
    report(r);
    return r;
  } finally {
    if (!dryRun) await releaseLock(ctx.store);
  }
}

export default async function sync(args) {
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force-unlock');
  const rememberKey = args.includes('--remember-key');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow-finding' && args[i + 1]) {
      const { addAllowed } = await import('../scan/secrets.js');
      addAllowed(args[++i]);
      log.out(`fingerprint allowed: ${args[i]}`);
    }
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('No bundle in the cloud yet. Start with `bottari init`.');
    return 1;
  }
  const dek = await obtainDek(ctx, { rememberKey });
  await performSync(ctx, dek, { dryRun, force });
  return 0;
}
