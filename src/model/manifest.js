// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The generation manifest: the catalog of every logical path the store
// knows. Entries are only ever added or updated, never removed — that
// invariant is what makes partial commits and union merges always safe.

export const SCHEMA = 1;

export function newManifest({ generation, parent, machineId, os, entries, conflictNotes = [] }) {
  return {
    schema: SCHEMA,
    generation,
    parent,
    createdAt: new Date().toISOString(),
    createdBy: { machineId, os },
    entries,
    conflictNotes,
  };
}

export function validateManifest(m) {
  if (m?.schema !== SCHEMA) throw new Error(`Unsupported manifest schema: ${m?.schema}`);
  if (!Number.isInteger(m.generation) || m.generation < 1) throw new Error('Bad manifest generation number');
  if (typeof m.entries !== 'object' || m.entries === null) throw new Error('Manifest has no entries');
  return m;
}

// Deterministic serialization: same content → same bytes → same hash,
// regardless of insertion order on whichever machine wrote it.
export function serializeManifest(m) {
  return Buffer.from(stableStringify(m), 'utf8');
}

export function parseManifest(buf) {
  return validateManifest(JSON.parse(buf.toString('utf8')));
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(
      (k) => JSON.stringify(k) + ':' + stableStringify(value[k]),
    ).join(',') + '}';
  }
  return JSON.stringify(value);
}

// hash map view used by the merge: {logicalPath: hash}
export function hashesOf(entries) {
  const out = {};
  for (const [p, e] of Object.entries(entries)) out[p] = e.hash;
  return out;
}
