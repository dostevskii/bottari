// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Local scan: what does this machine actually have right now? Hashes are
// skipped when size+mtime match the cache from the previous scan, so only
// the first run pays for hashing everything.

import fs from 'node:fs';
import { walk } from '../util/fs.js';
import { sha256File, sha256Hex } from '../util/hash.js';
import { toLogical } from '../paths/normalize.js';
import { isExcluded } from '../paths/mapping.js';
import { machineContext, saveOverlay } from '../transform/index.js';
import { log } from '../util/log.js';

// sources: [{logical, local, kind}] — returns
//   { files: Map<logical, {hash,size,mtimeMs,exec,abs}>, skipped: [...] }
export async function scanLocal(sources, scanCache = {}) {
  const files = new Map();
  const skipped = [];

  const record = async (logical, abs, st) => {
    const cached = scanCache[logical];
    const hash = (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs)
      ? cached.hash
      : await sha256File(abs);
    files.set(logical, {
      hash,
      size: st.size,
      mtimeMs: st.mtimeMs,
      exec: st.exec ?? false,
      abs,
    });
  };

  const ctx = machineContext();

  for (const src of sources) {
    if (src.kind === 'file') {
      let st;
      try {
        st = fs.lstatSync(src.local);
      } catch {
        continue; // an optional file this machine simply does not have
      }
      if (!st.isFile()) continue;
      const logical = toLogical(src.logical);
      if (src.transform) {
        // Tier B: what syncs is the transformed (machine-neutral) content,
        // so that is what gets hashed. Small files — no cache shortcut.
        try {
          const raw = fs.readFileSync(src.local);
          const { shared, overlay } = await src.transform.pack(raw, ctx);
          saveOverlay(logical, overlay);
          files.set(logical, {
            hash: sha256Hex(shared),
            size: shared.length,
            mtimeMs: st.mtimeMs,
            exec: false,
            abs: src.local,
            packed: shared,
          });
        } catch (e) {
          log.warn(`${logical} 변환 실패 — 이 파일은 이번 동기화에서 건너뜁니다 (${e.message})`);
          skipped.push({ rel: logical, reason: 'transform', source: src.logical });
        }
        continue;
      }
      await record(logical, src.local, {
        size: st.size,
        mtimeMs: st.mtimeMs,
        exec: process.platform !== 'win32' && (st.mode & 0o111) !== 0,
      });
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
      await record(toLogical(`${src.logical}/${f.rel}`), f.abs, f);
    }
  }
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
