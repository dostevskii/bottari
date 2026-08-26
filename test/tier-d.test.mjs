// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Tier D over the fake Drive: chunked uploads that reuse unchanged
// chunks, append-only jsonl resolving itself, history files merging by
// line union — no user prompt in any of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-td-'));
const HOME1 = path.join(tmp, 'm1');
const HOME2 = path.join(tmp, 'm2');
process.env.BOTTARI_HOME = HOME1;

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { runSync } = await import('../src/core/orchestrator.js');
const { openStore, readMeta, writeMeta } = await import('../src/core/generation.js');
const { generateDek } = await import('../src/crypto/keys.js');

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
let prompts = 0;
const io = { resolveConflict: async () => { prompts++; return 'local'; } };

async function syncAs(home) {
  process.env.BOTTARI_HOME = home;
  const store = await openStore(drive);
  const { meta, fileId } = await readMeta(store);
  return { r: await runSync({ store, dek, meta, metaFileId: fileId, machineId: path.basename(home), io }), store };
}

const sessionPath = (home) =>
  path.join(home, '.claude', 'projects', 'sample-project', 'aaaa1111.jsonl');
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const objectCount = async (store) => (await drive.list(store.objsId)).length;

// a >16MB deterministic session file → 3 chunks
const LINE = '{"type":"assistant","text":"' + 'x'.repeat(970) + '"}\n'; // ~1KB
const BIG = LINE.repeat(17 * 1024); // ≈17MB

{
  const store = await openStore(drive);
  await writeMeta(store, { schema: 1, key: {}, head: 0 });
}

test('1. a 17MB session uploads as 3 chunks', async () => {
  write(sessionPath(HOME1), BIG);
  const { r, store } = await syncAs(HOME1);
  assert.equal(r.generation, 1);
  const before = await objectCount(store);
  assert.equal(before, 3, '3 content objects for 3 chunks');
});

test('2. appending 1KB re-uploads exactly one chunk', async () => {
  fs.appendFileSync(sessionPath(HOME1), LINE);
  const { r, store } = await syncAs(HOME1);
  assert.equal(r.applied.uploaded.length, 1);
  // 3 chunks before; the first two are byte-identical → reused; only the
  // grown last chunk is a new object
  assert.equal(await objectCount(store), 4);
});

test('3. the other machine reassembles the chunks byte-exactly', async () => {
  const { r } = await syncAs(HOME2);
  assert.ok(r.applied.downloaded.includes('sessions/claude/sample-project/aaaa1111.jsonl'));
  assert.equal(
    fs.readFileSync(sessionPath(HOME2), 'utf8'),
    fs.readFileSync(sessionPath(HOME1), 'utf8'),
  );
  assert.equal(prompts, 0);
});

test('4. append-only divergence resolves itself: the longer side wins', async () => {
  // m2 appends offline…
  fs.appendFileSync(sessionPath(HOME2), LINE);
  // …while m1 appends the same line plus one more and syncs first
  fs.appendFileSync(sessionPath(HOME1), LINE + '{"more":true}\n');
  await syncAs(HOME1);
  // m2's local is now a strict prefix of remote → auto-download, no prompt
  const { r } = await syncAs(HOME2);
  assert.equal(prompts, 0, 'no user prompt for an append-only fork');
  assert.equal(r.plan.conflicts.length, 0);
  assert.equal(
    fs.readFileSync(sessionPath(HOME2), 'utf8'),
    fs.readFileSync(sessionPath(HOME1), 'utf8'),
  );
});

test('5. history files merge as a line union, both sides kept', async () => {
  const h1 = path.join(HOME1, '.claude', 'history.jsonl');
  const h2 = path.join(HOME2, '.claude', 'history.jsonl');
  write(h1, '{"q":"one"}\n');
  await syncAs(HOME1);
  await syncAs(HOME2); // m2 pulls, base established
  fs.appendFileSync(h1, '{"q":"from-m1"}\n');
  await syncAs(HOME1);
  fs.appendFileSync(h2, '{"q":"from-m2"}\n');
  const { r } = await syncAs(HOME2); // true fork → line union, no prompt
  assert.equal(prompts, 0);
  const merged = fs.readFileSync(h2, 'utf8');
  assert.ok(merged.includes('from-m1') && merged.includes('from-m2') && merged.startsWith('{"q":"one"}'));
  assert.ok(r.applied.uploaded.includes('history/claude.jsonl'));
  // and m1 converges to the same union
  await syncAs(HOME1);
  assert.equal(fs.readFileSync(h1, 'utf8'), merged);
});
