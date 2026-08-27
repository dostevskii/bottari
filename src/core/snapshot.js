// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Local scan: what does this machine actually have right now? Two passes —
// enumerate first so the total is known, then hash with a progress bar.
// Hashes are skipped when size+mtime match the cache from the previous
// scan (the bar leaps over those), so only the first run pays for hashing
// everything.

import fs from 'node:fs';
import { walk } from '../util/fs.js';
import { sha256File, sha256Hex } from '../util/hash.js';
import { toLogical } from '../paths/normalize.js';
import { isExcluded } from '../paths/mapping.js';
import { machineContext, saveOverlay } from '../transform/index.js';
import { makeBar } from '../util/progress.js';
import { log } from '../util/log.js';

// sources: [{logical, local, kind}] — returns
//   { files: Map<logical, {hash,size,mtimeMs,exec,abs,packed?}>, skipped: [...] }
export async function scanLocal(sources, scanCache = {}, { progress = true } = {}) {
  const files = new Map();
  const skipped = [];
  const ctx = machineContext();

  // ---- pass 1: enumerate, so the bar knows its total ----
  const hashJobs = []; // plain files
  const packJobs = []; // tier B files that transform before hashing
  for (const src of sources) {
    if (src.kind === 'file') {
      let st;
      try {
        st = fs.lstatSync(src.local);
      } catch {
        continue; // an optional file this machine simply does not have
      }
      if (!st.isFile()) continue;
      const job = {
        logical: toLogical(src.logical),
        abs: src.local,
        size: st.size,
        mtimeMs: st.mtimeMs,
        exec: process.platform !== 'win32' && (st.mode & 0o111) !== 0,
      };
      (src.transform ? packJobs : hashJobs).push({ ...job, src });
      continue;
    }
    let rootStat;
    try {
      rootStat = fs.lstatSync(src.local);
    } catch {
      continue;
    }
    if (!rootStat.isDirectory()) continue;
    const { files: found, skipped: s } = walk(src.local, { exclude: (rel) => isExcluded(toLogical(rel)) });
    skipped.push(...s.map((e) => ({ ...e, source: src.logical })));
    for (const f of found) {
      hashJobs.push({
        logical: toLogical(`${src.logical}/${f.rel}`),
        abs: f.abs,
        size: f.size,
        mtimeMs: f.mtimeMs,
        exec: f.exec,
      });
    }
  }

  // ---- pass 2: hash/transform with progress ----
  const totalBytes = [...hashJobs, ...packJobs].reduce((s, j) => s + j.size, 0);
  const bar = progress ? makeBar('scan', totalBytes, { min: 1024 * 1024 }) : { tick() {}, finish() {} };

  for (const j of packJobs) {
    // Tier B: what syncs is the transformed (machine-neutral) content, so
    // that is what gets hashed. Small files — no cache shortcut.
    try {
      const raw = fs.readFileSync(j.abs);
      const { shared, overlay } = await j.src.transform.pack(raw, ctx);
      saveOverlay(j.logical, overlay);
      files.set(j.logical, {
        hash: sha256Hex(shared),
        size: shared.length,
        mtimeMs: j.mtimeMs,
        exec: false,
        abs: j.abs,
        packed: shared,
      });
    } catch (e) {
      log.warn(`${j.logical} failed to transform — skipped for this sync (${e.message})`);
      skipped.push({ rel: j.logical, reason: 'transform', source: j.logical });
    }
    bar.tick(j.size);
  }

  for (const j of hashJobs) {
    const cached = scanCache[j.logical];
    const hash = (cached && cached.size === j.size && cached.mtimeMs === j.mtimeMs)
      ? cached.hash
      : await sha256File(j.abs);
    files.set(j.logical, { hash, size: j.size, mtimeMs: j.mtimeMs, exec: j.exec, abs: j.abs });
    bar.tick(j.size);
  }
  bar.finish();

  return { files, skipped };
}

// The next scan's cache, refreshed from what this scan learned.
export function buildScanCache(files) {
  const cache = {};
  for (const [logical, f] of files) {
    cache[logical] = { size: f.size, mtimeMs: f.mtimeMs, hash: f.hash };
  }
  return cache;
}
