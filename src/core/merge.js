// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The heart of bottari: the three-way union decision. Pure — hashes in,
// verdict out, no I/O — so the whole behaviour is one testable table.
//
// Union means no deletion ever propagates: a path present on either side
// survives. A file deleted locally while the catalog still lists it comes
// back — that is the stated design, not an accident.

export const NOOP = 'noop';
export const UPLOAD = 'upload';
export const DOWNLOAD = 'download';
export const DIVERGED = 'diverged'; // both changed; jsonl auto-merge or user

// base/local/remote: content hash strings, or null when absent.
export function decide(base, local, remote) {
  if (local === remote) return NOOP;      // covers both-absent and same-new
  if (remote == null) return UPLOAD;      // only local has it → preserve
  if (local == null) return DOWNLOAD;     // only the catalog has it → preserve
  if (base === local) return DOWNLOAD;    // remote moved, local did not
  if (base === remote) return UPLOAD;     // local moved, remote did not
  return DIVERGED;                        // no base, or both moved
}

// Convenience over whole maps: {path: hash}. Returns {path: verdict} for
// every path seen anywhere, NOOPs omitted.
export function decideAll(base, local, remote) {
  const verdicts = {};
  const paths = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(remote ?? {}),
  ]);
  for (const p of paths) {
    const v = decide(base?.[p] ?? null, local?.[p] ?? null, remote?.[p] ?? null);
    if (v !== NOOP) verdicts[p] = v;
  }
  return verdicts;
}
