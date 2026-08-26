// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Logical paths are the catalog's keys, so three filesystems have to agree
// on them: '/' separators, NFC unicode (macOS hands out NFD), case
// preserved but collisions detected — NTFS and APFS are case-insensitive
// by default, so two paths differing only in case cannot both materialize.

export function toLogical(relPath) {
  return relPath.split('\\').join('/').normalize('NFC');
}

export function casefoldKey(logical) {
  return logical.toLowerCase();
}

// -> [{ key, paths: [two or more logical paths] }]
// The input may list the same path twice (once from the catalog, once from
// the local scan) — a path never collides with itself.
export function findCaseCollisions(paths) {
  const byKey = new Map();
  for (const p of new Set(paths)) {
    const k = casefoldKey(p);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(p);
  }
  return [...byKey.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key, paths: v.sort() }));
}
