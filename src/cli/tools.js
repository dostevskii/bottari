// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// tools capture — record this machine's installed CLI tools in the store.
// tools show    — compare every machine's record against this machine.

import { openCloud, obtainDek } from './context.js';
import { captureInventory, diffInventories } from '../scan/inventory.js';
import { loadProfile } from '../model/config.js';
import { seal, unseal } from '../crypto/envelope.js';
import { log } from '../util/log.js';

const fileName = (machineId) => `inventory-${machineId}.json.enc`;

export default async function tools(args) {
  const [sub] = args;
  if (sub !== 'capture' && sub !== 'show') {
    log.error('사용법: bottari tools [capture | show]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('클라우드에 보따리가 없습니다. `bottari init` 먼저.');
    return 1;
  }
  const dek = await obtainDek(ctx);
  const profile = loadProfile();

  if (sub === 'capture') {
    const inv = captureInventory();
    const name = fileName(profile.machineId);
    const existing = await ctx.files.findChild(name, ctx.store.machinesId);
    await ctx.files.upload({
      name,
      parentId: ctx.store.machinesId,
      fileId: existing?.id,
      data: seal(Buffer.from(JSON.stringify(inv, null, 2)), dek, { gzip: true }),
    });
    log.out('이 컴퓨터의 도구 목록을 기록했습니다:');
    for (const [tool, v] of Object.entries(inv.tools)) {
      log.out(`  ${tool.padEnd(8)} ${v ?? '(없음)'}`);
    }
    return 0;
  }

  // show
  const mine = captureInventory();
  const records = (await ctx.files.list(ctx.store.machinesId))
    .filter((f) => /^inventory-.+\.json\.enc$/.test(f.name));
  if (!records.length) {
    log.out('기록된 도구 목록이 없습니다. 각 컴퓨터에서 `bottari tools capture` 를 실행하세요.');
    return 0;
  }
  for (const f of records) {
    const inv = JSON.parse(unseal(await ctx.files.download(f.id), dek).plain.toString('utf8'));
    const isMe = f.name === fileName(profile.machineId);
    log.out('');
    log.out(`■ ${inv.os}/${inv.arch}  (${inv.capturedAt.slice(0, 10)})${isMe ? '  ← 이 컴퓨터' : ''}`);
    if (isMe) {
      for (const [tool, v] of Object.entries(inv.tools)) log.out(`  ${tool.padEnd(8)} ${v ?? '(없음)'}`);
      continue;
    }
    const diff = diffInventories(mine, inv);
    if (!diff.length) log.out('  이 컴퓨터와 동일');
    else for (const line of diff) log.out(`  ${line}`);
  }
  return 0;
}
