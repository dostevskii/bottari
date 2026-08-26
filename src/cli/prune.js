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
    log.error('사용법: bottari prune --keep N [--yes]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('클라우드에 보따리가 없습니다.');
    return 1;
  }
  const dek = await obtainDek(ctx);
  const first = await computePruneSet(ctx.store, ctx.meta, dek, keep);
  log.out(`보존: 세대 ${first.keptGenerations.join(', ')}`);
  log.out(`삭제 예정: 매니페스트 ${first.dropManifests.length}개, 객체 ${first.dropObjects.length}개`);
  if (!first.dropManifests.length && !first.dropObjects.length) {
    log.out('지울 것이 없습니다.');
    return 0;
  }
  if (!yes) {
    const go = await askChoice('지운 세대는 복원할 수 없게 됩니다. 진행할까요?', [
      { key: 'y', label: '지운다' },
      { key: 'n', label: '그만둔다' },
    ]);
    if (go === 'n') return 0;
  }

  // second pass: same HEAD, same answer — otherwise someone committed
  // while we were deciding, and their objects must not be touched
  const fresh = await readMeta(ctx.store);
  if (fresh.meta?.head !== ctx.meta.head) {
    log.error('그 사이 다른 커밋이 있었습니다. prune 을 중단합니다 — 다시 실행하세요.');
    return 1;
  }
  const second = await computePruneSet(ctx.store, fresh.meta, dek, keep);
  const sameSet =
    second.dropManifests.length === first.dropManifests.length &&
    second.dropObjects.length === first.dropObjects.length;
  if (!sameSet) {
    log.error('재검증 결과가 달라졌습니다. prune 을 중단합니다 — 다시 실행하세요.');
    return 1;
  }

  for (const m of second.dropManifests) await ctx.files.remove(m.fileId);
  for (const o of second.dropObjects) await ctx.files.remove(o.fileId);
  log.out(`정리 완료: 매니페스트 ${second.dropManifests.length}개, 객체 ${second.dropObjects.length}개 삭제.`);
  return 0;
}
