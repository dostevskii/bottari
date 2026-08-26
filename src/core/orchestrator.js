// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The sync pipeline: scan → three-way union decision → downloads →
// uploads → new generation → commit-with-HEAD-recheck. The only state
// machine in the program; everything it calls is a leaf.

import fs from 'node:fs';
import path from 'node:path';
import { decideAll, UPLOAD, DOWNLOAD, DIVERGED } from './merge.js';
import {
  openStore, readMeta, getManifestById, putObject, getObject,
  listObjects, commitGeneration,
} from './generation.js';
import { scanLocal, buildScanCache } from './snapshot.js';
import { allSources, sourceFor, logicalToLocal, mirrorTargets } from '../paths/mapping.js';
import { findCaseCollisions } from '../paths/normalize.js';
import { machineContext, loadOverlay } from '../transform/index.js';
import { assertClean, loadAllowed, scanBuffer } from '../scan/secrets.js';
import { resolveAppendOnly, lineUnion } from './jsonl.js';
import { newManifest, parseManifest, serializeManifest, hashesOf } from '../model/manifest.js';
import { loadState, saveState } from '../model/state.js';
import { seal, unseal } from '../crypto/envelope.js';
import { subkey, objectId } from '../crypto/keys.js';
import { atomicWrite } from '../util/fs.js';
import { sha256Hex } from '../util/hash.js';
import { log } from '../util/log.js';

const MAX_COMMIT_RETRIES = 3;
const CHUNK_SIZE = 8 * 1024 * 1024;

// n workers over one shared queue — wall-clock is the slowest item, not
// the sum, and Drive tolerates a handful of parallel requests happily.
async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// io.resolveConflict(path) -> 'local' | 'remote' | 'both'  (CLI asks the
// user; MCP records the conflict and returns 'pending' to defer it).
export async function runSync({
  store, dek, meta, metaFileId, machineId, io, dryRun = false, sources = allSources(),
}) {
  if (!meta) {
    // A null meta must never reach the commit path: {...null, head} would
    // silently drop the wrapped key record from the store.
    throw new Error('저장소 메타가 없습니다. `bottari init` 을 먼저 실행하세요.');
  }
  const objKey = subkey(dek, 'objid');
  const state = loadState();

  for (let attempt = 1; attempt <= MAX_COMMIT_RETRIES; attempt++) {
    const head = meta.head ?? 0;
    const remoteManifest = head > 0
      ? parseManifest(unseal(await getManifestById(store, meta.headManifestId), dek).plain)
      : { entries: {} };
    const remoteEntries = remoteManifest.entries;
    const remote = hashesOf(remoteEntries);

    const { files: local, skipped } = await scanLocal(sources, state.scanCache);
    for (const s of skipped) {
      if (s.reason === 'link') log.warn(`링크는 따라가지 않습니다: ${s.source}/${s.rel}`);
    }
    const localHashes = Object.fromEntries([...local].map(([p, f]) => [p, f.hash]));

    const collisions = findCaseCollisions([...Object.keys(remote), ...Object.keys(localHashes)]);
    for (const c of collisions) {
      log.warn(`대소문자만 다른 경로가 공존합니다 (케이스 무시 파일시스템에서 겹침): ${c.paths.join(' ↔ ')}`);
    }

    const verdicts = decideAll(state.base, localHashes, remote);

    const plan = { uploads: [], downloads: [], conflicts: [], pending: [] };
    for (const [p, v] of Object.entries(verdicts)) {
      if (v === UPLOAD) plan.uploads.push(p);
      else if (v === DOWNLOAD) plan.downloads.push(p);
      else if (v === DIVERGED) plan.conflicts.push(p);
    }

    if (dryRun) {
      return { dryRun: true, generation: head, plan };
    }

    const objectsIndex = await listObjects(store);
    const nextGen = head + 1;
    const newEntries = { ...remoteEntries };
    let entriesChanged = false;
    const applied = { uploaded: [], downloaded: [], kept: [] };

    const ctx = machineContext();
    const allowed = loadAllowed();
    let tierDFindings = 0;

    const writeLocal = async (logical, entry, buf, { suffix = '' } = {}) => {
      const target = logicalToLocal(logical);
      if (!target) {
        log.warn(`이 머신이 모르는 경로라 내려받지 않습니다: ${logical}`);
        return false;
      }
      const src = sourceFor(logical);
      let out = buf;
      if (src?.transform && logical === src.logical && !suffix) {
        // Tier B carries the machine-neutral form; reassemble this
        // machine's file from it: expand + this machine's overlay.
        let currentRaw = null;
        try { currentRaw = fs.readFileSync(target); } catch { /* first arrival */ }
        out = await src.transform.unpack(buf, { overlay: loadOverlay(logical), ctx, currentRaw });
      }
      atomicWrite(target + suffix, out);
      if (entry.exec && process.platform !== 'win32') {
        try { fs.chmodSync(target + suffix, 0o755); } catch { /* fs without modes */ }
      }
      return true;
    };

    const download = async (logical, entry) => {
      const parts = [];
      for (const oid of entry.objects) {
        parts.push(unseal(await getObject(store, oid, objectsIndex), dek, { expectOid: oid }).plain);
      }
      const buf = Buffer.concat(parts);
      const got = sha256Hex(buf);
      if (got !== entry.hash) {
        throw new Error(`내려받은 ${logical} 의 해시가 매니페스트와 다릅니다 (저장소 손상 의심)`);
      }
      return buf;
    };

    const gateOrReport = (logical, buf, tier) => {
      if (tier === 'D') {
        // session transcripts: users paste keys into chats; the payload is
        // encrypted — count and tell, never block
        tierDFindings += scanBuffer(buf).length;
      } else {
        // The fail-closed gate: transformers are supposed to have stripped
        // credentials from tiers A/B — assume they have a bug.
        assertClean(logical, buf, allowed);
      }
    };

    const upload = async (logical) => {
      const f = local.get(logical);
      const tier = sourceFor(logical)?.tier ?? 'A';

      if (f.packed || f.size <= CHUNK_SIZE) {
        const buf = f.packed ?? fs.readFileSync(f.abs);
        gateOrReport(logical, buf, tier);
        const hash = f.packed ? f.hash : sha256Hex(buf);
        const oid = objectId(objKey, hash);
        await putObject(store, oid, seal(buf, dek, { oid, gzip: true }), objectsIndex);
        newEntries[logical] = {
          hash, size: buf.length, mtime: Math.round(f.mtimeMs), exec: f.exec,
          tier, objects: [oid], gzip: true,
        };
      } else {
        // Large file: fixed 8MB chunks, each its own content-addressed
        // object. An append re-uploads only the chunks it touched.
        const fd = fs.openSync(f.abs, 'r');
        const oids = [];
        try {
          const chunk = Buffer.alloc(CHUNK_SIZE);
          for (let offset = 0; offset < f.size; ) {
            const n = fs.readSync(fd, chunk, 0, CHUNK_SIZE, offset);
            if (n <= 0) break;
            const piece = Buffer.from(chunk.subarray(0, n));
            gateOrReport(logical, piece, tier);
            const oid = objectId(objKey, sha256Hex(piece));
            await putObject(store, oid, seal(piece, dek, { oid, gzip: true }), objectsIndex);
            oids.push(oid);
            offset += n;
          }
        } finally {
          fs.closeSync(fd);
        }
        // torn read? the tool may have appended while we were reading — a
        // changed file is left for the next sync instead of catalogued in
        // an inconsistent state (uploaded chunks stay reusable)
        const st = fs.statSync(f.abs);
        if (st.size !== f.size || st.mtimeMs !== f.mtimeMs) {
          log.warn(`${logical} 이 읽는 중에 변했습니다 — 다음 동기화로 미룹니다.`);
          return;
        }
        newEntries[logical] = {
          hash: f.hash, size: f.size, mtime: Math.round(f.mtimeMs), exec: f.exec,
          tier, objects: oids, chunkSize: CHUNK_SIZE, gzip: true,
        };
      }
      entriesChanged = true;
      applied.uploaded.push(logical);
    };

    // ---- conflicts: jsonl resolves itself where the data allows it ----
    const resolutions = new Map();
    const conflictNotes = [];
    const pendingDetails = [];
    for (const p of plan.conflicts.slice()) {
      const src = sourceFor(p);
      if (src?.tier === 'D' && p.endsWith('.jsonl')) {
        const remoteBuf = await download(p, remoteEntries[p]);
        const localBuf = fs.readFileSync(local.get(p).abs);
        const auto = resolveAppendOnly(localBuf, remoteBuf);
        if (auto?.action === 'take') {
          if (auto.side === 'a') {
            plan.uploads.push(p); // local is simply ahead
          } else if (await writeLocal(p, remoteEntries[p], remoteBuf)) {
            applied.downloaded.push(p);
          }
          plan.conflicts.splice(plan.conflicts.indexOf(p), 1);
          continue;
        }
        if (src.lineUnion) {
          const merged = lineUnion(localBuf, remoteBuf);
          atomicWrite(local.get(p).abs, merged);
          const f = local.get(p);
          local.set(p, { ...f, hash: sha256Hex(merged), size: merged.length, packed: undefined });
          plan.uploads.push(p);
          plan.conflicts.splice(plan.conflicts.indexOf(p), 1);
          conflictNotes.push({ path: p, choice: 'merge-lines', machineId });
          continue;
        }
      }
      const choice = await io.resolveConflict(p, {
        localHash: localHashes[p],
        remoteHash: remote[p],
      });
      if (choice === 'pending') {
        plan.pending.push(p);
        pendingDetails.push({ path: p, localHash: localHashes[p], remoteHash: remote[p] });
        continue;
      }
      resolutions.set(p, choice);
      conflictNotes.push({ path: p, choice, machineId });
    }

    // gate the whole upload set before anything is written anywhere
    for (const p of plan.uploads) {
      const f = local.get(p);
      if ((sourceFor(p)?.tier ?? 'A') === 'D') continue; // counted during upload
      if (f.packed || f.size <= CHUNK_SIZE) {
        assertClean(p, f.packed ?? fs.readFileSync(f.abs), allowed);
      }
    }

    // ---- downloads (remote is authoritative for these paths) ----
    await pool(plan.downloads, 4, async (p) => {
      const buf = await download(p, remoteEntries[p]);
      if (await writeLocal(p, remoteEntries[p], buf)) applied.downloaded.push(p);
    });

    // ---- uploads ----
    await pool(plan.uploads, 4, upload);

    // ---- resolved conflicts ----
    for (const [p, choice] of resolutions) {
      if (choice === 'remote') {
        const buf = await download(p, remoteEntries[p]);
        if (await writeLocal(p, remoteEntries[p], buf)) applied.downloaded.push(p);
      } else if (choice === 'local') {
        await upload(p);
      } else if (choice === 'both') {
        // Keep both: the remote version lands next to the local file and
        // becomes its own catalog entry, so no machine ever loses either.
        const copyLogical = `${p}.bottari-r${nextGen}`;
        const buf = await download(p, remoteEntries[p]);
        if (await writeLocal(p, remoteEntries[p], buf, { suffix: `.bottari-r${nextGen}` })) {
          newEntries[copyLogical] = { ...remoteEntries[p], tier: remoteEntries[p].tier ?? 'A' };
          applied.kept.push(copyLogical);
        }
        await upload(p);
      }
    }

    // ---- commit (only when the catalog itself changed) ----
    let generation = head;
    if (entriesChanged || applied.kept.length > 0) {
      const manifest = newManifest({
        generation: nextGen,
        parent: head > 0 ? head : null,
        machineId,
        os: process.platform,
        entries: newEntries,
        conflictNotes,
      });
      // the parent's storage id rides inside the sealed content, so restore
      // can walk the chain by id without trusting any file names
      manifest.parentManifestId = head > 0 ? meta.headManifestId : null;
      const sealed = seal(serializeManifest(manifest), dek, { gzip: true });
      const res = await commitGeneration(store, {
        gen: nextGen, machineId, sealedManifest: sealed, expectedHead: head, meta, metaFileId,
      });
      if (!res.ok) {
        log.info('다른 컴퓨터가 먼저 커밋했습니다. 새 기준으로 다시 병합합니다.');
        meta = res.meta;
        metaFileId = res.metaFileId;
        continue; // objects already uploaded are all reused
      }
      meta = res.meta;
      metaFileId = res.metaFileId;
      generation = nextGen;
    }

    // ---- base moves forward only after everything above landed ----
    const finalHashes = hashesOf(newEntries);
    // paths deferred as pending keep their old base so they stay diverged
    for (const p of plan.pending) delete finalHashes[p];
    const { files: rescanned } = await scanLocal(sources, buildScanCache(local));
    saveState({
      lastGeneration: generation,
      base: { ...state.base, ...finalHashes },
      scanCache: buildScanCache(rescanned),
    });

    mirror(applied);

    if (tierDFindings > 0) {
      log.warn(`세션 기록에서 자격증명처럼 보이는 내용 ${tierDFindings}건이 올라갔습니다. ` +
        '암호화되어 저장되지만, 대화에 붙여넣었던 키가 있는지 한번 돌아보세요.');
    }

    return {
      generation, plan, applied, pending: plan.pending, pendingDetails,
      tierDFindings, meta, metaFileId,
    };
  }
  throw new Error(`커밋 경합이 ${MAX_COMMIT_RETRIES}회 반복되었습니다. 잠시 후 다시 시도하세요.`);
}

// ~/.claude/skills is a physical duplicate of the canonical skills; keep
// it in step whenever anything under the canonical prefix moved. Copies,
// never links; never deletes extras.
function mirror(applied) {
  const touched = [...applied.downloaded, ...applied.uploaded, ...applied.kept];
  for (const { logicalPrefix, target } of mirrorTargets()) {
    if (!touched.some((p) => p.startsWith(logicalPrefix + '/'))) continue;
    const source = logicalToLocal(logicalPrefix);
    if (!source || !fs.existsSync(source)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: true });
    log.info(`복제본 갱신: ${target}`);
  }
}

// Shared bootstrap for CLI commands: what does the cloud currently hold?
export async function fetchRemoteState(files) {
  const store = await openStore(files);
  const { meta, fileId } = await readMeta(store);
  return { store, meta, metaFileId: fileId };
}
