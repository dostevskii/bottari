// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Storage GC: keep the newest N generations, delete manifests outside the
// kept chain and objects nothing kept refers to. The decision is computed
// twice with a HEAD check in between — a sync racing us aborts the prune,
// never the other way around.

import { openCloud, obtainDek } from './context.js';
import { computePruneSet } from '../core/maintenance.js';
import { readMeta } from '../core/generation.js';
import { askChoice } from './prompt.js';
import { log } from '../util/log.js';

export default async function prune(args) {
  const k = args.indexOf('--keep');
  const keep = k >= 0 ? Number(args[k + 1]) : NaN;
  const yes = args.includes('--yes');
  if (!Number.isInteger(keep) || keep < 1) {
    log.error('usage: bottari prune --keep N [--yes]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('No bundle in the cloud.');
    return 1;
  }
  const dek = await obtainDek(ctx);
  const first = await computePruneSet(ctx.store, ctx.meta, dek, keep);
  log.out(`keeping generations: ${first.keptGenerations.join(', ')}`);
  log.out(`to delete: ${first.dropManifests.length} manifest(s), ${first.dropObjects.length} object(s)`);
  if (!first.dropManifests.length && !first.dropObjects.length) {
    log.out('Nothing to prune.');
    return 0;
  }
  if (!yes) {
    const go = await askChoice('Pruned generations can never be restored. Proceed?', [
      { key: 'y', label: 'prune' },
      { key: 'n', label: 'quit' },
    ]);
    if (go === 'n') return 0;
  }

  // second pass: same HEAD, same answer — otherwise someone committed
  // while we were deciding, and their objects must not be touched
  const fresh = await readMeta(ctx.store);
  if (fresh.meta?.head !== ctx.meta.head) {
    log.error('Another commit landed in the meantime. Prune aborted — run it again.');
    return 1;
  }
  const second = await computePruneSet(ctx.store, fresh.meta, dek, keep);
  const sameSet =
    second.dropManifests.length === first.dropManifests.length &&
    second.dropObjects.length === first.dropObjects.length;
  if (!sameSet) {
    log.error('The recheck came out different. Prune aborted — run it again.');
    return 1;
  }

  for (const m of second.dropManifests) await ctx.files.remove(m.fileId);
  for (const o of second.dropObjects) await ctx.files.remove(o.fileId);
  log.out(`pruned: ${second.dropManifests.length} manifest(s), ${second.dropObjects.length} object(s) deleted.`);
  return 0;
}
