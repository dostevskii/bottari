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
  log.out(`충돌: ${p}`);
  log.out(`  이 컴퓨터  ${localHash.slice(0, 12)}…`);
  log.out(`  클라우드   ${remoteHash.slice(0, 12)}…`);
  const k = await askChoice('어느 쪽을 남길까요?', [
    { key: 'l', label: '이 컴퓨터 것 (클라우드 쪽이 갱신됨)' },
    { key: 'r', label: '클라우드 것 (이 컴퓨터 파일이 바뀜)' },
    { key: 'b', label: '둘 다 보존 (클라우드 것을 옆에 복사)' },
  ]);
  return { l: 'local', r: 'remote', b: 'both' }[k];
}

function report(r) {
  if (r.dryRun) {
    log.out(`[미리보기] 현재 세대 ${r.generation}`);
    for (const p of r.plan.uploads) log.out(`  올림      ${p}`);
    for (const p of r.plan.downloads) log.out(`  내림      ${p}`);
    for (const p of r.plan.conflicts) log.out(`  충돌 예정 ${p}`);
    if (!r.plan.uploads.length && !r.plan.downloads.length && !r.plan.conflicts.length) {
      log.out('  변경 없음 — 양쪽이 일치합니다.');
    }
    return;
  }
  const a = r.applied;
  log.out('');
  log.out(`동기화 완료 — 세대 ${r.generation}`);
  log.out(`  올림 ${a.uploaded.length}개 · 내림 ${a.downloaded.length}개` +
    (a.kept.length ? ` · 보존 사본 ${a.kept.length}개` : ''));
  if (r.pending.length) {
    log.out(`  미해소 충돌 ${r.pending.length}개 — \`bottari resolve\` 로 마저 정리하세요.`);
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
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('클라우드에 보따리가 아직 없습니다. `bottari init` 으로 시작하세요.');
    return 1;
  }
  const dek = await obtainDek(ctx, { rememberKey });
  await performSync(ctx, dek, { dryRun, force });
  return 0;
}
