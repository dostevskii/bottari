// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Tier B plumbing. Every tier B file is split by its transformer into
//   shared  — machine-neutral, the only part that ever leaves this machine
//   overlay — this machine's private remainder, kept in ~/.bottari
// and reassembled on restore: expand(shared) ⊕ overlay.

import fs from 'node:fs';
import path from 'node:path';
import { homeDir, atomicWrite } from '../util/fs.js';
import { loadConfig } from '../model/config.js';

const overlayDir = () => path.join(homeDir(), '.bottari', 'machine-overlay');
const overlayPath = (logical) => path.join(overlayDir(), logical.split('/').join('__') + '.json');

export function loadOverlay(logical) {
  try {
    return JSON.parse(fs.readFileSync(overlayPath(logical), 'utf8'));
  } catch {
    return null;
  }
}

export function saveOverlay(logical, overlay) {
  const p = overlayPath(logical);
  const next = overlay == null ? null : JSON.stringify(overlay, null, 2) + '\n';
  let current = null;
  try { current = fs.readFileSync(p, 'utf8'); } catch { /* none yet */ }
  if (next === current) return;
  if (next === null) {
    fs.rmSync(p, { force: true });
  } else {
    atomicWrite(p, next);
  }
}

// What shrink/expand need to know about this machine.
export function machineContext() {
  return { home: homeDir(), projects: loadConfig().projects ?? {} };
}
