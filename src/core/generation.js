// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The store protocol on Drive: one meta file (the only plaintext), a
// generations folder of sealed manifests, an objects folder of sealed
// content, and a best-effort lock. Drive offers no compare-and-swap, so
// the commit re-reads the meta HEAD after uploading the manifest — a race
// leads to a re-merge, never to silent loss.

const META_NAME = 'bottari.meta.json';
const LOCK_NAME = 'lock.json';
const LOCK_TTL_MS = 10 * 60 * 1000;

export async function openStore(files) {
  const rootId = await files.ensureFolder('bottari', null);
  const [gensId, objsId, machinesId] = await Promise.all([
    files.ensureFolder('generations', rootId),
    files.ensureFolder('objects', rootId),
    files.ensureFolder('machines', rootId),
  ]);
  return { files, rootId, gensId, objsId, machinesId };
}

// -> { meta, fileId } — meta is null when this store is brand new.
export async function readMeta(store) {
  const f = await store.files.findChild(META_NAME, store.rootId);
  if (!f) return { meta: null, fileId: null };
  const meta = JSON.parse((await store.files.download(f.id)).toString('utf8'));
  return { meta, fileId: f.id };
}

export async function writeMeta(store, meta, fileId) {
  const res = await store.files.uploadSmall({
    name: META_NAME,
    parentId: store.rootId,
    fileId: fileId ?? undefined,
    data: Buffer.from(JSON.stringify(meta, null, 2), 'utf8'),
    mimeType: 'application/json',
  });
  return res.id;
}

export async function acquireLock(store, machineId, { force = false } = {}) {
  const existing = await store.files.findChild(LOCK_NAME, store.rootId);
  if (existing) {
    let lock = null;
    try {
      lock = JSON.parse((await store.files.download(existing.id)).toString('utf8'));
    } catch { /* unreadable lock is treated as stale */ }
    const live = lock && lock.expiresAt > Date.now() && lock.machineId !== machineId;
    if (live && !force) {
      throw new Error(
        '다른 컴퓨터가 동기화 중입니다 (10분 넘게 이 상태면 그쪽이 중단된 것이니 ' +
        '`bottari sync --force-unlock` 으로 잠금을 해제할 수 있습니다).',
      );
    }
  }
  const id = await store.files.uploadSmall({
    name: LOCK_NAME,
    parentId: store.rootId,
    fileId: existing?.id,
    data: Buffer.from(JSON.stringify({ machineId, expiresAt: Date.now() + LOCK_TTL_MS })),
    mimeType: 'application/json',
  });
  return id.id ?? id;
}

export async function releaseLock(store) {
  const existing = await store.files.findChild(LOCK_NAME, store.rootId);
  if (existing) await store.files.remove(existing.id);
}

// Manifests are create-only and uniquely named: Drive allows duplicate
// names in a folder, so two racing machines writing "g000002…" must never
// address each other's file by name. The meta HEAD carries the winning
// manifest's fileId, and each manifest carries its parent's fileId, so the
// chain is walked by id, never by name.
export async function putManifest(store, gen, machineId, sealed) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const name = `g${String(gen).padStart(6, '0')}-${machineId.slice(0, 8)}-${suffix}.manifest.enc`;
  const res = await store.files.uploadSmall({ name, parentId: store.gensId, data: sealed });
  return res.id;
}

export async function getManifestById(store, fileId) {
  return store.files.download(fileId);
}

export async function listGenerations(store) {
  const all = await store.files.list(store.gensId);
  return all
    .map((f) => {
      const m = /^g(\d{6})-.+\.manifest\.enc$/.exec(f.name);
      return m ? { gen: Number(m[1]), fileId: f.id, name: f.name, modifiedTime: f.modifiedTime } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.gen - b.gen);
}

// -> Map<objectName, fileId> — one listing instead of a findChild per object.
export async function listObjects(store) {
  const all = await store.files.list(store.objsId);
  return new Map(all.map((f) => [f.name, f.id]));
}

export async function putObject(store, oid, sealed, index) {
  if (index?.has(oid)) return; // content-addressed: already there
  const res = await store.files.uploadSmall({ name: oid, parentId: store.objsId, data: sealed });
  index?.set(oid, res.id);
}

export async function getObject(store, oid, index) {
  const fileId = index?.get(oid) ?? (await store.files.findChild(oid, store.objsId))?.id;
  if (!fileId) throw new Error(`객체 ${oid.slice(0, 12)}… 가 Drive에 없습니다 (bottari doctor 로 점검하세요).`);
  return store.files.download(fileId);
}

// Upload our uniquely-named manifest, then re-read HEAD. Someone committed
// first? Remove our manifest again and report — the caller re-merges on
// top of the new HEAD, and every object this attempt uploaded is reused.
export async function commitGeneration(store, { gen, machineId, sealedManifest, expectedHead, meta, metaFileId }) {
  const manifestId = await putManifest(store, gen, machineId, sealedManifest);
  const fresh = await readMeta(store);
  const currentHead = fresh.meta?.head ?? 0;
  if (currentHead !== expectedHead) {
    await store.files.remove(manifestId).catch(() => {});
    return { ok: false, meta: fresh.meta, metaFileId: fresh.fileId };
  }
  const newMeta = { ...meta, head: gen, headManifestId: manifestId };
  const id = await writeMeta(store, newMeta, fresh.fileId ?? metaFileId);
  return { ok: true, meta: newMeta, metaFileId: id };
}
