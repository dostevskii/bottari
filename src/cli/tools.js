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
    log.error('usage: bottari tools [capture | show]');
    return 1;
  }
  const ctx = await openCloud();
  if (!ctx.meta) {
    log.error('No bundle in the cloud. Run `bottari init` first.');
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
    log.out('Recorded this machine\'s tools:');
    for (const [tool, v] of Object.entries(inv.tools)) {
      log.out(`  ${tool.padEnd(8)} ${v ?? '(not installed)'}`);
    }
    return 0;
  }

  // show
  const mine = captureInventory();
  const records = (await ctx.files.list(ctx.store.machinesId))
    .filter((f) => /^inventory-.+\.json\.enc$/.test(f.name));
  if (!records.length) {
    log.out('No tool records yet. Run `bottari tools capture` on each machine.');
    return 0;
  }
  for (const f of records) {
    const inv = JSON.parse(unseal(await ctx.files.download(f.id), dek).plain.toString('utf8'));
    const isMe = f.name === fileName(profile.machineId);
    log.out('');
    log.out(`# ${inv.os}/${inv.arch}  (${inv.capturedAt.slice(0, 10)})${isMe ? '  <- this machine' : ''}`);
    if (isMe) {
      for (const [tool, v] of Object.entries(inv.tools)) log.out(`  ${tool.padEnd(8)} ${v ?? '(not installed)'}`);
      continue;
    }
    const diff = diffInventories(mine, inv);
    if (!diff.length) log.out('  same as this machine');
    else for (const line of diff) log.out(`  ${line}`);
  }
  return 0;
}
