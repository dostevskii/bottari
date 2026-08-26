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
    log.error('사용법: bottari restore --generation N [--path 접두어] [--dry-run] [--force]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('클라우드에 보따리가 없습니다.');
    return 1;
  }
  const dek = await obtainDek(ctx);
  const manifest = await manifestAtGeneration(ctx.store, ctx.meta, dek, generation);

  const { files } = await scanLocal(allSources());
  const localHashes = Object.fromEntries([...files].map(([p, f]) => [p, f.hash]));
  const plan = planRestore(manifest, localHashes, { pathPrefix });

  log.out(`세대 ${generation} (${manifest.createdAt?.slice(0, 19)}) 기준:`);
  log.out(`  바꿀 파일 ${plan.write.length}개 · 이미 동일 ${plan.unchanged}개` +
    (plan.foreign.length ? ` · 이 머신에 자리 없음 ${plan.foreign.length}개` : ''));
  if (dryRun || plan.write.length === 0) {
    for (const p of plan.write) log.out(`  복원 예정  ${p}`);
    if (plan.write.length === 0) log.out('  복원할 것이 없습니다.');
    return 0;
  }
  if (!force) {
    for (const p of plan.write.slice(0, 20)) log.out(`  덮어씀     ${p}`);
    if (plan.write.length > 20) log.out(`  … 외 ${plan.write.length - 20}개`);
    const go = await askChoice('위 파일들을 그 세대의 내용으로 되돌릴까요? (지워지는 파일은 없습니다)', [
      { key: 'y', label: '되돌린다' },
      { key: 'n', label: '그만둔다' },
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
  log.out(`복원 완료: ${written}개. 다음 \`bottari sync\` 때 이 상태가 새 세대로 올라갑니다.`);
  return 0;
}
