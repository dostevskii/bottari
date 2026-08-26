// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export function homeDir() {
  return os.homedir();
}

// Write-then-rename so a crash mid-write can never leave a half-written
// file at the destination. rename replaces an existing file on every OS
// Node supports, Windows included.
export function atomicWrite(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.bottari-tmp-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// lstat-only walk. Symlinks, junctions and any other reparse point are
// never followed — they are collected in `skipped` so the caller can tell
// the user, because following one is how a sync tool ends up touching (or
// deleting) an original outside the tree it was pointed at.
//
// exclude(relPath, dirent) — return true to skip an entry (and, for a
// directory, its whole subtree). relPath always uses '/' separators.
export function walk(root, { exclude } = {}) {
  const files = [];
  const skipped = [];
  const visit = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      skipped.push({ rel, reason: 'unreadable' });
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (exclude && exclude(relPath, e)) continue;
      let st;
      try {
        st = fs.lstatSync(abs);
      } catch {
        skipped.push({ rel: relPath, reason: 'unreadable' });
        continue;
      }
      if (st.isSymbolicLink()) {
        skipped.push({ rel: relPath, reason: 'link' });
        continue;
      }
      if (st.isDirectory()) {
        visit(abs, relPath);
      } else if (st.isFile()) {
        files.push({
          abs,
          rel: relPath,
          size: st.size,
          mtimeMs: st.mtimeMs,
          exec: process.platform !== 'win32' && (st.mode & 0o111) !== 0,
        });
      }
      // sockets, fifos and the like have no place in a sync set
    }
  };
  visit(root, '');
  return { files, skipped };
}
