// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Tier P: a registered project travels by slug; each machine keeps its
// own path. Korean filenames normalize to NFC so all three filesystems
// agree on the catalog key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-tp-'));
const HOME1 = path.join(tmp, 'm1');
const HOME2 = path.join(tmp, 'm2');
const PROJ1 = path.join(tmp, 'work-a', 'demo');
const PROJ2 = path.join(tmp, 'somewhere-else', 'demo-here');
process.env.BOTTARI_HOME = HOME1;

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { runSync } = await import('../src/core/orchestrator.js');
const { openStore, readMeta, writeMeta } = await import('../src/core/generation.js');
const { generateDek } = await import('../src/crypto/keys.js');
const { captureInventory, diffInventories } = await import('../src/scan/inventory.js');

function fakeDrive() {
  let seq = 0;
  const nodes = new Map();
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

async function syncAs(home) {
  process.env.BOTTARI_HOME = home;
  const store = await openStore(drive);
  const { meta, fileId } = await readMeta(store);
  return runSync({ store, dek, meta, metaFileId: fileId, machineId: path.basename(home), io });
}

const registerProject = (home, root) => {
  fs.mkdirSync(path.join(home, '.bottari'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.bottari', 'config.json'),
    JSON.stringify({ projects: { demo: root } }),
  );
};

// machine 1: a project with a Korean NFD filename (what macOS would hand
// us) and a node_modules folder that must never travel
const NFD_NAME = '기획 메모.md'.normalize('NFD');
fs.mkdirSync(path.join(PROJ1, 'node_modules', 'pkg'), { recursive: true });
fs.writeFileSync(path.join(PROJ1, 'node_modules', 'pkg', 'index.js'), 'junk');
fs.writeFileSync(path.join(PROJ1, NFD_NAME), '한글 내용 그대로\n');
fs.writeFileSync(path.join(PROJ1, 'main.js'), 'console.log(1)\n');
registerProject(HOME1, PROJ1);

fs.mkdirSync(PROJ2, { recursive: true });
registerProject(HOME2, PROJ2);

{
  const store = await openStore(drive);
  await writeMeta(store, { schema: 1, key: {}, head: 0 });
}

test('a registered project syncs; regenerable folders never travel', async () => {
  const r = await syncAs(HOME1);
  assert.equal(r.generation, 1);
  const uploaded = r.applied.uploaded.filter((p) => p.startsWith('projects/demo/'));
  assert.equal(uploaded.length, 2);
  assert.ok(!uploaded.some((p) => p.includes('node_modules')));
});

test('the other machine receives it at its own registered path, NFC name', async () => {
  const r = await syncAs(HOME2);
  const got = r.applied.downloaded.filter((p) => p.startsWith('projects/demo/'));
  assert.equal(got.length, 2);
  const nfcPath = path.join(PROJ2, '기획 메모.md'.normalize('NFC'));
  assert.equal(fs.readFileSync(nfcPath, 'utf8'), '한글 내용 그대로\n');
  assert.equal(fs.readFileSync(path.join(PROJ2, 'main.js'), 'utf8'), 'console.log(1)\n');
  assert.ok(!fs.existsSync(path.join(PROJ2, 'node_modules')));
});

test('a machine without the slug leaves those entries alone', async () => {
  const HOME3 = path.join(tmp, 'm3'); // no project registered
  const r = await (async () => {
    process.env.BOTTARI_HOME = HOME3;
    const store = await openStore(drive);
    const { meta, fileId } = await readMeta(store);
    return runSync({ store, dek, meta, metaFileId: fileId, machineId: 'm3', io });
  })();
  // tier A/B/D empty here too, so only the project entries were candidates
  assert.equal(r.applied.downloaded.filter((p) => p.startsWith('projects/')).length, 0);
});

test('inventory capture and diff', () => {
  const mine = captureInventory();
  assert.match(mine.tools.node ?? '', /^v?\d+/);
  const theirs = JSON.parse(JSON.stringify(mine));
  theirs.tools.git = null;
  theirs.tools.node = 'v0.0.1';
  const diff = diffInventories(mine, theirs);
  assert.equal(diff.length, 2);
  assert.ok(diff.some((l) => l.startsWith('git:')));
});
