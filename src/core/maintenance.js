// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The store's health and its garbage: what doctor reports and what prune
// may delete. Pure decisions here; the CLIs do the talking and deleting.

import { getManifestById, listObjects, listGenerations } from './generation.js';
import { parseManifest } from '../model/manifest.js';
import { unseal } from '../crypto/envelope.js';

// Walk the chain from HEAD, newest first, up to `limit` manifests.
export async function walkChain(store, meta, dek, limit = Infinity) {
  const chain = [];
  let fileId = meta.headManifestId;
  while (fileId && chain.length < limit) {
    let manifest;
    try {
      manifest = parseManifest(unseal(await getManifestById(store, fileId), dek).plain);
    } catch (e) {
      return { chain, broken: { fileId, reason: e.message } };
    }
    chain.push({ fileId, manifest });
    fileId = manifest.parentManifestId ?? null;
  }
  return { chain, broken: null };
}

const referencedOids = (manifests) => {
  const oids = new Set();
  for (const { manifest } of manifests) {
    for (const entry of Object.values(manifest.entries)) {
      for (const oid of entry.objects) oids.add(oid);
    }
  }
  return oids;
};

// Everything the HEAD generation needs, checked against what exists.
export async function checkStore(store, meta, dek) {
  const { chain, broken } = await walkChain(store, meta, dek, 1);
  if (broken || !chain.length) {
    return { headReadable: false, reason: broken?.reason ?? 'HEAD 매니페스트 없음' };
  }
  const objects = await listObjects(store);
  const needed = referencedOids(chain);
  const missing = [...needed].filter((oid) => !objects.has(oid));
  return {
    headReadable: true,
    generation: chain[0].manifest.generation,
    entryCount: Object.keys(chain[0].manifest.entries).length,
    neededObjects: needed.size,
    missingObjects: missing,
    // not an error: these belong to older generations (or died in a race)
    unreferencedByHead: objects.size - (needed.size - missing.length),
  };
}

// What would `prune --keep N` delete? Never the kept chain, never meta,
// never the machines folder.
export async function computePruneSet(store, meta, dek, keep) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep 은 1 이상의 정수여야 합니다.');
  const { chain, broken } = await walkChain(store, meta, dek, keep);
  if (broken) throw new Error(`체인이 손상되어 prune 할 수 없습니다: ${broken.reason}`);
  const keptIds = new Set(chain.map((c) => c.fileId));
  const keptOids = referencedOids(chain);

  const manifests = await listGenerations(store);
  const dropManifests = manifests.filter((m) => !keptIds.has(m.fileId));
  const objects = await listObjects(store);
  const dropObjects = [...objects.entries()]
    .filter(([oid]) => !keptOids.has(oid))
    .map(([oid, fileId]) => ({ oid, fileId }));
  return {
    keptGenerations: chain.map((c) => c.manifest.generation),
    dropManifests,
    dropObjects,
  };
}
