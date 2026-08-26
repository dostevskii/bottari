// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { openCloud, obtainDek } from './context.js';
import { performSync } from './sync.js';
import { listGenerations } from '../core/generation.js';
import { log } from '../util/log.js';

// status = a dry-run sync: the same three-way comparison, nothing written.
export default async function status() {
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.out('클라우드에 보따리가 없습니다. `bottari init` 으로 시작하세요.');
    return 0;
  }
  const dek = await obtainDek(ctx);
  await performSync(ctx, dek, { dryRun: true });
  return 0;
}

export async function generations() {
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.out('클라우드에 보따리가 없습니다.');
    return 0;
  }
  const list = await listGenerations(ctx.store);
  log.out(`세대 ${list.length}개, 현재 HEAD는 ${ctx.meta.head}:`);
  for (const g of list) {
    const mark = g.fileId === ctx.meta.headManifestId ? '  ← HEAD' : '';
    log.out(`  세대 ${g.gen}  ${g.modifiedTime ?? ''}${mark}`);
  }
  return 0;
}
