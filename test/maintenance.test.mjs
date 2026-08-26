// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// restore / doctor / prune over the fake Drive: chain walk by id,
// restore that never deletes, GC that never touches the kept chain.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-mt-'));
const HOME = path.join(tmp, 'm1');
process.env.BOTTARI_HOME = HOME;

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { runSync } = await import('../src/core/orchestrator.js');
const { openStore, readMeta, writeMeta, listObjects } = await import('../src/core/generation.js');
const { generateDek } = await import('../src/crypto/keys.js');
const { manifestAtGeneration, planRestore, fetchEntry, materialize } = await import('../src/core/restore.js');
const { checkStore, computePruneSet } = await import('../src/core/maintenance.js');
const { scanLocal } = await import('../src/core/snapshot.js');
const { allSources } = await import('../src/paths/mapping.js');

function fakeDrive() {
  let seq = 0;
  const nodes = new Map();
  const key = (p) => p ?? 'root';
  return {
    nodes,
    async findChild(name, parentId) {
      for (const [id, n] of nodes) {
        if (n.name === name && key(n.parentId) === key(parentId)) {
          return { id, name: n.name, mimeType: n.folder ? 'application/vnd.google-apps.folder' : 'x' };
        }
      }
      return null;
    },
    async ensureFolder(name, parentId) {
      const found = await this.findChild(name, parentId);
      if (found) return found.id;
      const id = `id${++seq}`;
      nodes.set(id, { name, parentId, folder: true });
      return id;
    },
    async list(parentId) {
      const out = [];
      for (const [id, n] of nodes) {
        if (key(n.parentId) === key(parentId)) out.push({ id, name: n.name, modifiedTime: '' });
      }
      return out;
    },
    async uploadSmall({ name, parentId, data, fileId }) {
      if (fileId) {
        const n = nodes.get(fileId);
        n.name = name;
        n.data = Buffer.from(data);
        return { id: fileId, name };
      }
      const id = `id${++seq}`;
      nodes.set(id, { name, parentId, data: Buffer.from(data) });
      return { id, name };
    },
    async download(fileId) {
      return Buffer.from(nodes.get(fileId).data);
    },
    async remove(fileId) {
      nodes.delete(fileId);
    },
  };
}

const drive = fakeDrive();
const dek = generateDek();
const io = { resolveConflict: async () => 'local' };
const fileA = path.join(HOME, '.agents', 'skills', 'alpha', 'SKILL.md');
const fileB = path.join(HOME, '.agents', 'skills', 'beta', 'SKILL.md');
const write = (p, t) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, t);
};

async function sync() {
  const store = await openStore(drive);
  const { meta, fileId } = await readMeta(store);
  const r = await runSync({ store, dek, meta, metaFileId: fileId, machineId: 'm1', io });
  return { r, store, meta: r.meta };
}

{
  const store = await openStore(drive);
  await writeMeta(store, { schema: 1, key: {}, head: 0 });
}
// three generations: A v1 → A v2 → +B
write(fileA, 'A v1\n');
await sync();
write(fileA, 'A v2\n');
await sync();
write(fileB, 'B v1\n');
const third = await sync();

test('chain walk finds any generation by id, and rejects nonsense', async () => {
  const store = third.store;
  const meta = third.meta;
  const g1 = await manifestAtGeneration(store, meta, dek, 1);
  assert.equal(g1.generation, 1);
  assert.equal(Object.keys(g1.entries).length, 1);
  await assert.rejects(() => manifestAtGeneration(store, meta, dek, 99), /범위/);
  await assert.rejects(() => manifestAtGeneration(store, meta, dek, 0), /범위/);
});

test('restore to generation 1: A returns to v1, B survives untouched', async () => {
  const { store, meta } = third;
  const g1 = await manifestAtGeneration(store, meta, dek, 1);
  const { files } = await scanLocal(allSources());
  const localHashes = Object.fromEntries([...files].map(([p, f]) => [p, f.hash]));
  const plan = planRestore(g1, localHashes);
  assert.deepEqual(plan.write, ['agents/skills/alpha/SKILL.md']);

  const index = await listObjects(store);
  for (const p of plan.write) {
    const buf = await fetchEntry(store, dek, g1.entries[p], index, p);
    assert.ok(await materialize(p, g1.entries[p], buf, { ctx: { home: HOME, projects: {} } }));
  }
  assert.equal(fs.readFileSync(fileA, 'utf8'), 'A v1\n');
  assert.equal(fs.readFileSync(fileB, 'utf8'), 'B v1\n', 'restore must never delete');
  // put things back for the next tests
  write(fileA, 'A v2\n');
  await sync();
});

test('doctor: healthy store, then a hole punched from the Drive web', async () => {
  const { store, meta } = await (async () => {
    const s = await openStore(drive);
    const { meta: m } = await readMeta(s);
    return { store: s, meta: m };
  })();
  const healthy = await checkStore(store, meta, dek);
  assert.equal(healthy.headReadable, true);
  assert.deepEqual(healthy.missingObjects, []);

  // simulate the user deleting one object in the Drive web UI
  const objects = await listObjects(store);
  const [oid, fileId] = [...objects.entries()][0];
  await store.files.remove(fileId);
  const sick = await checkStore(store, meta, dek);
  // the victim may or may not be referenced by HEAD; assert consistency
  const referenced = sick.missingObjects.includes(oid);
  assert.equal(sick.headReadable, true);
  assert.equal(sick.missingObjects.length, referenced ? 1 : 0);
  // undo for prune test: next sync re-uploads from local (CAS self-heal)
  await sync();
  const healed = await checkStore(store, (await readMeta(store)).meta, dek);
  assert.deepEqual(healed.missingObjects, []);
});

test('prune --keep 2: old manifests and orphaned objects go, HEAD stays whole', async () => {
  const store = await openStore(drive);
  const { meta } = await readMeta(store);
  const plan = await computePruneSet(store, meta, dek, 2);
  assert.equal(plan.keptGenerations.length, 2);
  assert.ok(plan.dropManifests.length >= 1);

  for (const m of plan.dropManifests) await store.files.remove(m.fileId);
  for (const o of plan.dropObjects) await store.files.remove(o.fileId);

  const after = await checkStore(store, meta, dek);
  assert.equal(after.headReadable, true);
  assert.deepEqual(after.missingObjects, [], 'the kept chain lost nothing');
  // pruned generations are now unreachable, and say so clearly
  await assert.rejects(() => manifestAtGeneration(store, meta, dek, 1), /닿을 수 없습니다|체인/);
});
