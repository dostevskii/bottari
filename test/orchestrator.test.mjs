// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Two simulated machines (two BOTTARI_HOME temp dirs) share one in-memory
// Drive and run the full pipeline: first push, second-machine pull, cross
// edits converging, idempotence, keep-both conflict, deletion
// resurrection, commit race. This is the sync model exercised end to end
// with no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-orch-'));
const HOME1 = path.join(tmp, 'machine1');
const HOME2 = path.join(tmp, 'machine2');
process.env.BOTTARI_HOME = HOME1;

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { runSync } = await import('../src/core/orchestrator.js');
const { openStore, readMeta, writeMeta, commitGeneration, putManifest } = await import('../src/core/generation.js');
const { generateDek } = await import('../src/crypto/keys.js');
const { seal } = await import('../src/crypto/envelope.js');
const { serializeManifest, newManifest } = await import('../src/model/manifest.js');

// ---- in-memory Drive with the same surface as drive/files.js ----
function fakeDrive() {
  let seq = 0;
  const nodes = new Map(); // id -> {name, parentId, data, folder}
  const key = (p) => p ?? 'root';
  return {
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
      const n = nodes.get(fileId);
      if (!n) throw new Error('no such file');
      return Buffer.from(n.data);
    },
    async remove(fileId) {
      nodes.delete(fileId);
    },
  };
}

const drive = fakeDrive();
const dek = generateDek();
const conflictAnswers = [];
const io = { resolveConflict: async () => conflictAnswers.shift() ?? 'local' };

const skillsDir = (home) => path.join(home, '.agents', 'skills');
const put = (home, rel, text) => {
  const p = path.join(skillsDir(home), ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const readSkill = (home, rel) =>
  fs.readFileSync(path.join(skillsDir(home), ...rel.split('/')), 'utf8');

async function syncAs(home, extra = {}) {
  process.env.BOTTARI_HOME = home;
  const store = await openStore(drive);
  const { meta, fileId } = await readMeta(store);
  return runSync({
    store, dek, meta, metaFileId: fileId,
    machineId: path.basename(home), io, ...extra,
  });
}

// bootstrap: machine1 has content; the store gets its meta (as init would)
put(HOME1, 'alpha/SKILL.md', 'alpha v1\n');
put(HOME1, 'beta/SKILL.md', 'beta v1\n');
fs.mkdirSync(path.join(HOME1, '.claude'), { recursive: true });
fs.writeFileSync(path.join(HOME1, '.claude', 'CLAUDE.md'), 'global rules v1\n');
{
  const store = await openStore(drive);
  await writeMeta(store, { schema: 1, key: { note: 'wrapped-dek-here' }, head: 0 });
}

test('1. first push creates generation 1 with every local file', async () => {
  const r = await syncAs(HOME1);
  assert.equal(r.generation, 1);
  assert.equal(r.applied.uploaded.length, 3);
  assert.deepEqual(r.plan.conflicts, []);
});

test('2. an empty second machine pulls everything, bytes intact, mirror updated', async () => {
  const r = await syncAs(HOME2);
  assert.equal(r.generation, 1); // downloads only — no new generation
  assert.equal(r.applied.downloaded.length, 3);
  assert.equal(readSkill(HOME2, 'alpha/SKILL.md'), 'alpha v1\n');
  assert.equal(fs.readFileSync(path.join(HOME2, '.claude', 'CLAUDE.md'), 'utf8'), 'global rules v1\n');
  // the physical duplicate got mirrored from the canonical skills
  assert.equal(
    fs.readFileSync(path.join(HOME2, '.claude', 'skills', 'alpha', 'SKILL.md'), 'utf8'),
    'alpha v1\n',
  );
});

test('3. cross edits converge; a third sync is a no-op (idempotence)', async () => {
  put(HOME1, 'alpha/SKILL.md', 'alpha v2 from m1\n');
  put(HOME2, 'gamma/SKILL.md', 'gamma new on m2\n');

  const r1 = await syncAs(HOME1); // uploads alpha v2 → gen 2
  assert.equal(r1.generation, 2);
  const r2 = await syncAs(HOME2); // uploads gamma, downloads alpha → gen 3
  assert.equal(r2.generation, 3);
  assert.equal(readSkill(HOME2, 'alpha/SKILL.md'), 'alpha v2 from m1\n');
  const r3 = await syncAs(HOME1); // downloads gamma → no new generation
  assert.equal(r3.generation, 3);
  assert.equal(readSkill(HOME1, 'gamma/SKILL.md'), 'gamma new on m2\n');

  const r4 = await syncAs(HOME1);
  const r5 = await syncAs(HOME2);
  assert.equal(r4.generation, 3, 'nothing changed → same generation');
  assert.deepEqual(r4.applied ?? {}, { uploaded: [], downloaded: [], kept: [] });
  assert.equal(r5.generation, 3);
  assert.deepEqual(r5.applied ?? {}, { uploaded: [], downloaded: [], kept: [] });
});

test('4. a true fork asks the user; keep-both preserves both versions', async () => {
  put(HOME1, 'beta/SKILL.md', 'beta edited on m1\n');
  await syncAs(HOME1); // gen 4
  put(HOME2, 'beta/SKILL.md', 'beta edited on m2\n');

  conflictAnswers.push('both');
  const r = await syncAs(HOME2);
  assert.equal(r.plan.conflicts.length, 1);
  assert.equal(readSkill(HOME2, 'beta/SKILL.md'), 'beta edited on m2\n');
  const gen = r.generation;
  assert.equal(readSkill(HOME2, `beta/SKILL.md.bottari-r${gen}`), 'beta edited on m1\n');

  // machine1 then receives both: its own version moved aside as the copy
  const r1 = await syncAs(HOME1);
  assert.equal(readSkill(HOME1, 'beta/SKILL.md'), 'beta edited on m2\n');
  assert.equal(readSkill(HOME1, `beta/SKILL.md.bottari-r${gen}`), 'beta edited on m1\n');
  assert.equal(r1.plan.conflicts.length, 0, 'the fork is settled, not re-asked');
});

test('5. deletion never propagates: a deleted file comes back', async () => {
  fs.rmSync(path.join(skillsDir(HOME2), 'alpha', 'SKILL.md'));
  const r = await syncAs(HOME2);
  assert.ok(r.applied.downloaded.includes('agents/skills/alpha/SKILL.md'));
  assert.equal(readSkill(HOME2, 'alpha/SKILL.md'), 'alpha v2 from m1\n');
});

test('6. commit race: the loser cleans up and the winner\'s manifest survives', async () => {
  const store = await openStore(drive);
  const { meta, fileId } = await readMeta(store);
  const head = meta.head;

  // a competing machine commits first
  const winner = newManifest({
    generation: head + 1, parent: head, machineId: 'winner-m', os: 'linux', entries: {},
  });
  const winnerSealed = seal(serializeManifest(winner), dek, { gzip: true });
  const winnerId = await putManifest(store, head + 1, 'winner-m', winnerSealed);
  await writeMeta(store, { ...meta, head: head + 1, headManifestId: winnerId }, fileId);

  // our commit was prepared against the old head and must lose cleanly
  const ours = newManifest({
    generation: head + 1, parent: head, machineId: 'loser-mm', os: 'win32', entries: {},
  });
  const res = await commitGeneration(store, {
    gen: head + 1,
    machineId: 'loser-mm',
    sealedManifest: seal(serializeManifest(ours), dek, { gzip: true }),
    expectedHead: head,
    meta,
    metaFileId: fileId,
  });
  assert.equal(res.ok, false);
  assert.equal(res.meta.head, head + 1);
  assert.equal(res.meta.headManifestId, winnerId, 'HEAD still points at the winner');

  // the winner's manifest content is untouched…
  const { unseal } = await import('../src/crypto/envelope.js');
  const back = unseal(await store.files.download(winnerId), dek).plain;
  assert.equal(JSON.parse(back.toString()).createdBy.machineId, 'winner-m');

  // …and the loser's manifest file is gone from the store
  const gens = await store.files.list(store.gensId);
  assert.ok(!gens.some((f) => f.name.includes('loser-mm')), 'loser cleaned its upload up');
});
