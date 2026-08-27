// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { openCloud, obtainDek } from './context.js';
import { manifestAtGeneration, planRestore, fetchEntry, materialize } from '../core/restore.js';
import { listObjects } from '../core/generation.js';
import { scanLocal } from '../core/snapshot.js';
import { allSources } from '../paths/mapping.js';
import { machineContext } from '../transform/index.js';
import { askChoice } from './prompt.js';
import { log } from '../util/log.js';

function parseArgs(args) {
  const out = { dryRun: args.includes('--dry-run'), force: args.includes('--force') };
  const g = args.indexOf('--generation');
  out.generation = g >= 0 ? Number(args[g + 1]) : NaN;
  const p = args.indexOf('--path');
  out.pathPrefix = p >= 0 ? args[p + 1] : undefined;
  return out;
}

export default async function restore(args) {
  const { generation, pathPrefix, dryRun, force } = parseArgs(args);
  if (!Number.isInteger(generation)) {
    log.error('usage: bottari restore --generation N [--path prefix] [--dry-run] [--force]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('No bundle in the cloud.');
    return 1;
  }
  const dek = await obtainDek(ctx);
  const manifest = await manifestAtGeneration(ctx.store, ctx.meta, dek, generation);

  const { files } = await scanLocal(allSources());
  const localHashes = Object.fromEntries([...files].map(([p, f]) => [p, f.hash]));
  const plan = planRestore(manifest, localHashes, { pathPrefix });

  log.out(`generation ${generation} (${manifest.createdAt?.slice(0, 19)}):`);
  log.out(`  to write ${plan.write.length} · already identical ${plan.unchanged}` +
    (plan.foreign.length ? ` · no place on this machine ${plan.foreign.length}` : ''));
  if (dryRun || plan.write.length === 0) {
    for (const p of plan.write) log.out(`  would restore  ${p}`);
    if (plan.write.length === 0) log.out('  nothing to restore.');
    return 0;
  }
  if (!force) {
    for (const p of plan.write.slice(0, 20)) log.out(`  overwrites     ${p}`);
    if (plan.write.length > 20) log.out(`  … and ${plan.write.length - 20} more`);
    const go = await askChoice('Bring these files back to that generation? (nothing gets deleted)', [
      { key: 'y', label: 'restore' },
      { key: 'n', label: 'quit' },
    ]);
    if (go === 'n') return 0;
  }

  const index = await listObjects(ctx.store);
  const mctx = machineContext();
  let written = 0;
  for (const p of plan.write) {
    const buf = await fetchEntry(ctx.store, dek, manifest.entries[p], index, p);
    if (await materialize(p, manifest.entries[p], buf, { ctx: mctx })) written++;
  }
  log.out(`restored ${written} file(s). The next \`bottari sync\` publishes this state as a new generation.`);
  return 0;
}
