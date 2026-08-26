// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The MCP surface: everything a Claude app can drive. Nothing here can
// prompt, so sign-in comes from the stored refresh token and the key from
// the credential store; a conflict is returned as data, inspected with a
// diff, answered by id, and applied by the next sync call.

import fs from 'node:fs';
import { makeClient } from '../drive/client.js';
import { makeFiles } from '../drive/files.js';
import { getAccessToken } from '../auth/token-store.js';
import { getSecret } from '../keychain/index.js';
import { fetchRemoteState, runSync } from '../core/orchestrator.js';
import {
  acquireLock, releaseLock, listGenerations, getManifestById, getObject, listObjects,
} from '../core/generation.js';
import { loadPendingState, recordPending, setResolution, resolutionFor } from '../core/conflicts.js';
import { parseManifest } from '../model/manifest.js';
import { loadConfig, loadProfile } from '../model/config.js';
import { logicalToLocal, allSources } from '../paths/mapping.js';
import { unseal } from '../crypto/envelope.js';
import { redactText } from '../scan/secrets.js';
import { manifestAtGeneration, planRestore, fetchEntry, materialize } from '../core/restore.js';
import { scanLocal } from '../core/snapshot.js';
import { machineContext } from '../transform/index.js';

async function openContext() {
  const client = makeClient({ getAccessToken: () => getAccessToken({ interactive: false }) });
  const files = makeFiles(client);
  const remote = await fetchRemoteState(files);
  if (!remote.meta) {
    throw new Error('클라우드에 보따리가 없습니다. 터미널에서 `bottari init` 을 먼저 실행하세요.');
  }
  const dekHex = await getSecret('bottari-dek');
  if (!dekHex) {
    throw new Error('열쇠가 이 컴퓨터에 보관되어 있지 않습니다. 터미널에서 `bottari sync --remember-key` 를 한 번 실행하세요.');
  }
  return { files, ...remote, dek: Buffer.from(dekHex, 'hex') };
}

// first differing region, a handful of lines each side — enough for the
// model to explain the fork to a human
function tinyDiff(aBuf, bBuf) {
  const MAX = 256 * 1024;
  if (aBuf.length > MAX || bBuf.length > MAX || aBuf.includes(0) || bBuf.includes(0)) {
    return `내용이 크거나 이진 데이터입니다. 크기: 이 컴퓨터 ${aBuf.length}B ↔ 클라우드 ${bBuf.length}B`;
  }
  const a = aBuf.toString('utf8').split('\n');
  const b = bBuf.toString('utf8').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA > start && endB > start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const clip = (lines, from, to, mark) =>
    lines.slice(Math.max(from, 0), to + 1).slice(0, 12).map((l) => mark + ' ' + l);
  return [
    `공통 ${start}행 이후가 갈라졌습니다.`,
    '--- 이 컴퓨터 쪽 ---',
    ...clip(a, start, endA, '<'),
    '--- 클라우드 쪽 ---',
    ...clip(b, start, endB, '>'),
  ].join('\n');
}

export const TOOLS = [
  {
    name: 'bottari_status',
    description: '무엇이 오르내릴지 미리 봅니다. 아무것도 바꾸지 않습니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      const ctx = await openContext();
      const profile = loadProfile();
      const r = await runSync({
        store: ctx.store, dek: ctx.dek, meta: ctx.meta, metaFileId: ctx.metaFileId,
        machineId: profile.machineId, io: { resolveConflict: async () => 'pending' }, dryRun: true,
      });
      return { generation: r.generation, plan: r.plan };
    },
  },
  {
    name: 'bottari_sync',
    description: '동기화를 실행합니다. 충돌이 있으면 무충돌분만 커밋하고(합집합이라 항상 안전) 충돌 목록을 돌려줍니다. bottari_resolve_conflicts 로 답한 뒤 다시 호출하면 마무리됩니다.',
    inputSchema: {
      type: 'object',
      properties: { dryRun: { type: 'boolean', description: '미리보기만' } },
      additionalProperties: false,
    },
    async handler({ dryRun = false } = {}) {
      const ctx = await openContext();
      const profile = loadProfile();
      const io = { resolveConflict: async (p) => resolutionFor(p) ?? 'pending' };
      if (dryRun) {
        const r = await runSync({
          store: ctx.store, dek: ctx.dek, meta: ctx.meta, metaFileId: ctx.metaFileId,
          machineId: profile.machineId, io, dryRun: true,
        });
        return { generation: r.generation, plan: r.plan };
      }
      await acquireLock(ctx.store, profile.machineId, {});
      try {
        const r = await runSync({
          store: ctx.store, dek: ctx.dek, meta: ctx.meta, metaFileId: ctx.metaFileId,
          machineId: profile.machineId, io,
        });
        const recorded = recordPending(r.pendingDetails ?? []);
        return {
          status: recorded.length ? 'partial' : 'done',
          generation: r.generation,
          uploaded: r.applied.uploaded.length,
          downloaded: r.applied.downloaded.length,
          keptCopies: r.applied.kept.length,
          conflicts: recorded,
          sessionCredentialFindings: r.tierDFindings,
        };
      } finally {
        await releaseLock(ctx.store);
      }
    },
  },
  {
    name: 'bottari_get_conflict_diff',
    description: '미해소 충돌 하나의 양쪽 내용 차이를 보여줍니다.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    async handler({ id }) {
      const state = loadPendingState();
      const conflict = state.conflicts.find((c) => c.id === id);
      if (!conflict) throw new Error(`미해소 충돌 중에 id '${id}' 가 없습니다.`);
      const ctx = await openContext();
      const manifest = parseManifest(
        unseal(await getManifestById(ctx.store, ctx.meta.headManifestId), ctx.dek).plain,
      );
      const entry = manifest.entries[conflict.path];
      const index = await listObjects(ctx.store);
      const parts = [];
      for (const oid of entry.objects) {
        parts.push(unseal(await getObject(ctx.store, oid, index), ctx.dek, { expectOid: oid }).plain);
      }
      const remoteBuf = Buffer.concat(parts);
      const localPath = logicalToLocal(conflict.path);
      const localBuf = localPath && fs.existsSync(localPath) ? fs.readFileSync(localPath) : Buffer.alloc(0);
      // this text goes into a model's context — credentials never do
      return { id, path: conflict.path, diff: redactText(tinyDiff(localBuf, remoteBuf)) };
    },
  },
  {
    name: 'bottari_resolve_conflicts',
    description: '충돌들에 대한 선택(local: 이 컴퓨터 것 / remote: 클라우드 것 / both: 둘 다 보존)을 기록합니다. 다음 bottari_sync 가 적용합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        resolutions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              choice: { type: 'string', enum: ['local', 'remote', 'both'] },
            },
            required: ['id', 'choice'],
            additionalProperties: false,
          },
        },
      },
      required: ['resolutions'],
      additionalProperties: false,
    },
    async handler({ resolutions }) {
      for (const { id, choice } of resolutions) setResolution(id, choice);
      const state = loadPendingState();
      return {
        answered: Object.keys(state.resolutions).length,
        open: state.conflicts.length,
        note: '다음 bottari_sync 호출이 이 선택을 적용합니다.',
      };
    },
  },
  {
    name: 'bottari_list_generations',
    description: '클라우드 보따리의 세대(버전) 목록을 봅니다.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
      additionalProperties: false,
    },
    async handler({ limit = 20 } = {}) {
      const ctx = await openContext();
      const list = await listGenerations(ctx.store);
      return {
        head: ctx.meta.head,
        generations: list.slice(-limit).map((g) => ({ gen: g.gen, modifiedTime: g.modifiedTime })),
      };
    },
  },
  {
    name: 'bottari_projects_list',
    description: '이 컴퓨터에 등록된 동기화 대상 프로젝트 폴더 목록입니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return { projects: loadConfig().projects };
    },
  },
  {
    name: 'bottari_restore',
    description: '이전 세대의 파일 상태로 되돌립니다. confirm 없이 호출하면 무엇이 바뀔지만 보여주고, 실제 적용은 사용자의 동의를 확인한 뒤 confirm:true 로 다시 호출해야 합니다. 파일이 지워지는 일은 없습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        generation: { type: 'number' },
        pathPrefix: { type: 'string', description: '논리 경로 접두어로 범위 제한' },
        confirm: { type: 'boolean', description: 'true 일 때만 실제로 파일을 바꿉니다' },
      },
      required: ['generation'],
      additionalProperties: false,
    },
    async handler({ generation, pathPrefix, confirm = false }) {
      const ctx = await openContext();
      const manifest = await manifestAtGeneration(ctx.store, ctx.meta, ctx.dek, generation);
      const { files } = await scanLocal(allSources());
      const localHashes = Object.fromEntries([...files].map(([p, f]) => [p, f.hash]));
      const plan = planRestore(manifest, localHashes, { pathPrefix });
      if (!confirm) {
        return {
          generation,
          wouldWrite: plan.write,
          unchanged: plan.unchanged,
          foreign: plan.foreign,
          note: '적용하려면 사용자에게 이 목록을 보여 동의를 받은 뒤 confirm:true 로 다시 호출하세요.',
        };
      }
      const index = await listObjects(ctx.store);
      const mctx = machineContext();
      const written = [];
      for (const p of plan.write) {
        const buf = await fetchEntry(ctx.store, ctx.dek, manifest.entries[p], index, p);
        if (await materialize(p, manifest.entries[p], buf, { ctx: mctx })) written.push(p);
      }
      return { generation, written, note: '다음 bottari_sync 가 이 상태를 새 세대로 올립니다.' };
    },
  },
  // No bottari_projects_add here on purpose: registering a folder decides
  // what leaves this machine, and a prompt-injected model must never make
  // that decision. Registration is the human's, in the terminal.
];
