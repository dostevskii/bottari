// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The single table that says what syncs and what never does. Logical
// namespace on the left, this machine's real location on the right. The
// canonical skills live in ~/.agents/skills; ~/.claude/skills is a
// physical duplicate that is never uploaded and instead mirrored from the
// canonical copy on restore.

import path from 'node:path';
import { homeDir } from '../util/fs.js';

// Tier A sources. kind 'dir' walks recursively, 'file' is one optional file.
export function tierASources() {
  const home = homeDir();
  return [
    { logical: 'agents/skills', local: path.join(home, '.agents', 'skills'), kind: 'dir', tier: 'A' },
    { logical: 'claude/CLAUDE.md', local: path.join(home, '.claude', 'CLAUDE.md'), kind: 'file', tier: 'A' },
    { logical: 'claude/statusline-command.sh', local: path.join(home, '.claude', 'statusline-command.sh'), kind: 'file', tier: 'A' },
    { logical: 'codex/AGENTS.md', local: path.join(home, '.codex', 'AGENTS.md'), kind: 'file', tier: 'A' },
    { logical: 'codex/rules', local: path.join(home, '.codex', 'rules'), kind: 'dir', tier: 'A' },
    { logical: 'codex/automations', local: path.join(home, '.codex', 'automations'), kind: 'dir', tier: 'A' },
    { logical: 'codex/hooks.json', local: path.join(home, '.codex', 'hooks.json'), kind: 'file', tier: 'A' },
  ];
}

// After materializing a logical prefix, copy it to these additional local
// locations (plain copies — symlinks behave too differently across the
// three OSes to trust).
export function mirrorTargets() {
  const home = homeDir();
  return [
    { logicalPrefix: 'agents/skills', target: path.join(home, '.claude', 'skills') },
  ];
}

// Names that never sync, wherever they appear. Matched per path segment.
const EXCLUDED_SEGMENTS = new Set([
  'node_modules', '.git', '__pycache__', '.DS_Store',
]);
const EXCLUDED_SUFFIXES = ['.sqlite', '.sqlite-wal', '.sqlite-shm', '.log', '.lock', '.tmp'];

export function isExcluded(relPath) {
  const segments = relPath.split('/');
  const name = segments.at(-1);
  if (segments.some((s) => EXCLUDED_SEGMENTS.has(s))) return true;
  if (EXCLUDED_SUFFIXES.some((suf) => name.endsWith(suf))) return true;
  if (name.includes('.bak')) return true;
  if (name.startsWith('.bottari-tmp-')) return true;
  return false;
}

// logical path -> absolute local path on this machine, or null when the
// path belongs to no known namespace (a foreign entry we leave alone).
export function logicalToLocal(logical) {
  for (const src of tierASources()) {
    if (logical === src.logical) return src.local;
    if (src.kind === 'dir' && logical.startsWith(src.logical + '/')) {
      const rest = logical.slice(src.logical.length + 1);
      return path.join(src.local, ...rest.split('/'));
    }
  }
  return null;
}
