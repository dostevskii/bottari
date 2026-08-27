// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Bringing catalog entries back to disk — used by every sync download and
// by `bottari restore --generation N`. Restoring never deletes: files the
// chosen generation does not know stay untouched, and the next sync
// simply publishes the restored state as the newest generation.

import fs from 'node:fs';
import { getManifestById, getObject } from './generation.js';
import { parseManifest } from '../model/manifest.js';
import { unseal } from '../crypto/envelope.js';
import { logicalToLocal, sourceFor } from '../paths/mapping.js';
import { loadOverlay } from '../transform/index.js';
import { sha256Hex } from '../util/hash.js';
import { atomicWrite } from '../util/fs.js';

// Write one logical entry to this machine's disk: tier B reassembles from
// shared + this machine's overlay, everything else lands byte-for-byte.
// Returns false when this machine has no place for the path.
export async function materialize(logical, entry, buf, { ctx, suffix = '' } = {}) {
  const target = logicalToLocal(logical);
  if (!target) return false;
  const src = sourceFor(logical);
  let out = buf;
  if (src?.transform && logical === src.logical && !suffix) {
    let currentRaw = null;
    try { currentRaw = fs.readFileSync(target); } catch { /* first arrival */ }
    out = await src.transform.unpack(buf, { overlay: loadOverlay(logical), ctx, currentRaw });
  }
  atomicWrite(target + suffix, out);
  if (entry.exec && process.platform !== 'win32') {
    try { fs.chmodSync(target + suffix, 0o755); } catch { /* fs without modes */ }
  }
  return true;
}

// Fetch an entry's content and prove it is what the manifest promised.
export async function fetchEntry(store, dek, entry, objectsIndex, logical) {
  const parts = [];
  for (const oid of entry.objects) {
    parts.push(unseal(await getObject(store, oid, objectsIndex), dek, { expectOid: oid }).plain);
  }
  const buf = Buffer.concat(parts);
  if (sha256Hex(buf) !== entry.hash) {
    throw new Error(`Downloaded ${logical} does not match its manifest hash (store corruption?)`);
  }
  return buf;
}

// Walk the parent chain from HEAD down to one generation. Every hop is
// addressed by fileId from sealed content — file names prove nothing.
export async function manifestAtGeneration(store, meta, dek, target) {
  if (!Number.isInteger(target) || target < 1 || target > (meta.head ?? 0)) {
    throw new Error(`Generation out of range: ${target} (HEAD is ${meta.head})`);
  }
  let fileId = meta.headManifestId;
  for (;;) {
    if (!fileId) {
      throw new Error(`Generation ${target} is unreachable — the chain is cut (pruned, perhaps).`);
    }
    let manifest;
    try {
      manifest = parseManifest(unseal(await getManifestById(store, fileId), dek).plain);
    } catch {
      // the hop itself is gone or unreadable — same answer as a cut chain
      throw new Error(`Generation ${target} is unreachable — the chain is cut (pruned, perhaps).`);
    }
    if (manifest.generation === target) return manifest;
    if (manifest.generation < target) {
      throw new Error(`Generation ${target} is not on the chain (walked down past ${manifest.generation}).`);
    }
    fileId = manifest.parentManifestId;
  }
}

// What would restoring this manifest change on this machine?
//   write   — content differs or is missing locally
//   foreign — no local mapping here (left alone)
export function planRestore(manifest, localHashes, { pathPrefix } = {}) {
  const write = [];
  const foreign = [];
  let unchanged = 0;
  for (const [p, entry] of Object.entries(manifest.entries)) {
    if (pathPrefix && !p.startsWith(pathPrefix)) continue;
    if (!logicalToLocal(p)) {
      foreign.push(p);
      continue;
    }
    if (localHashes[p] === entry.hash) unchanged++;
    else write.push(p);
  }
  return { write: write.sort(), foreign: foreign.sort(), unchanged };
}
