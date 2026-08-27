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
    throw new Error('No bundle in the cloud. Run `bottari init` in a terminal first.');
  }
  const dekHex = await getSecret('bottari-dek');
  if (!dekHex) {
    throw new Error('The key is not stored on this machine. Run `bottari sync --remember-key` once in a terminal.');
  }
  return { files, ...remote, dek: Buffer.from(dekHex, 'hex') };
}

// first differing region, a handful of lines each side — enough for the
// model to explain the fork to a human
function tinyDiff(aBuf, bBuf) {
  const MAX = 256 * 1024;
  if (aBuf.length > MAX || bBuf.length > MAX || aBuf.includes(0) || bBuf.includes(0)) {
    return `Content too large or binary. Sizes: this machine ${aBuf.length}B <-> cloud ${bBuf.length}B`;
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
    `The two sides diverge after ${start} common line(s).`,
    '--- this machine ---',
    ...clip(a, start, endA, '<'),
    '--- cloud ---',
    ...clip(b, start, endB, '>'),
  ].join('\n');
}

export const TOOLS = [
  {
    name: 'bottari_status',
    description: 'Preview what would go up or down. Changes nothing.',
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
    description: 'Run a sync. When conflicts exist, the conflict-free part is committed (union merge makes that always safe) and the conflict list is returned. Answer with bottari_resolve_conflicts, then call this again to finish.',
    inputSchema: {
      type: 'object',
      properties: { dryRun: { type: 'boolean', description: 'preview only' } },
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
    description: 'Show how the two sides of one unresolved conflict differ.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    async handler({ id }) {
      const state = loadPendingState();
      const conflict = state.conflicts.find((c) => c.id === id);
      if (!conflict) throw new Error(`No open conflict has the id '${id}'.`);
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
    description: 'Record answers for conflicts (local: this machine\'s version / remote: the cloud\'s / both: keep both). The next bottari_sync applies them.',
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
        note: 'The next bottari_sync call applies these answers.',
      };
    },
  },
  {
    name: 'bottari_list_generations',
    description: 'List the generations (versions) of the cloud bundle.',
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
    description: 'List the project folders registered for sync on this machine.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return { projects: loadConfig().projects };
    },
  },
  {
    name: 'bottari_restore',
    description: 'Bring files back to an earlier generation. Without confirm it only previews what would change; apply by calling again with confirm:true after the user has agreed. Nothing ever gets deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        generation: { type: 'number' },
        pathPrefix: { type: 'string', description: 'limit the scope by logical-path prefix' },
        confirm: { type: 'boolean', description: 'only true actually changes files' },
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
          note: 'To apply, show this list to the user, get their agreement, then call again with confirm:true.',
        };
      }
      const index = await listObjects(ctx.store);
      const mctx = machineContext();
      const written = [];
      for (const p of plan.write) {
        const buf = await fetchEntry(ctx.store, ctx.dek, manifest.entries[p], index, p);
        if (await materialize(p, manifest.entries[p], buf, { ctx: mctx })) written.push(p);
      }
      return { generation, written, note: 'The next bottari_sync publishes this state as a new generation.' };
    },
  },
  // No bottari_projects_add here on purpose: registering a folder decides
  // what leaves this machine, and a prompt-injected model must never make
  // that decision. Registration is the human's, in the terminal.
];
