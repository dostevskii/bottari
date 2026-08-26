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
import * as claudeSettings from '../transform/claude-settings.js';
import * as claudeJson from '../transform/claude-json.js';
import * as codexConfig from '../transform/codex-config.js';

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

// Tier B: shared after a transform strips machine reality (paths, secrets).
export function tierBSources() {
  const home = homeDir();
  return [
    { logical: 'claude/settings.json', local: path.join(home, '.claude', 'settings.json'), kind: 'file', tier: 'B', transform: claudeSettings },
    { logical: 'claude/settings.local.json', local: path.join(home, '.claude', 'settings.local.json'), kind: 'file', tier: 'B', transform: claudeSettings },
    { logical: 'claude-root/claude.json', local: path.join(home, '.claude.json'), kind: 'file', tier: 'B', transform: claudeJson },
    { logical: 'codex/config.toml', local: path.join(home, '.codex', 'config.toml'), kind: 'file', tier: 'B', transform: codexConfig },
  ];
}

// Tier D: session history. Large, append-mostly, machine-flavored but
// shared so any machine can pick a conversation up. lineUnion marks files
// whose lines are independent records — a true fork merges as a union of
// lines instead of asking the user.
export function tierDSources() {
  const home = homeDir();
  return [
    { logical: 'sessions/claude', local: path.join(home, '.claude', 'projects'), kind: 'dir', tier: 'D' },
    { logical: 'sessions/codex', local: path.join(home, '.codex', 'sessions'), kind: 'dir', tier: 'D' },
    { logical: 'sessions/codex-archived', local: path.join(home, '.codex', 'archived_sessions'), kind: 'dir', tier: 'D' },
    { logical: 'history/claude.jsonl', local: path.join(home, '.claude', 'history.jsonl'), kind: 'file', tier: 'D', lineUnion: true },
    { logical: 'history/codex.jsonl', local: path.join(home, '.codex', 'history.jsonl'), kind: 'file', tier: 'D', lineUnion: true },
  ];
}

export function allSources() {
  return [...tierASources(), ...tierBSources(), ...tierDSources()];
}

// The source a logical path belongs to — including keep-both copies, which
// carry a '.bottari-rN' suffix after a known file path.
export function sourceFor(logical) {
  for (const src of allSources()) {
    if (logical === src.logical) return src;
    if (src.kind === 'dir' && logical.startsWith(src.logical + '/')) return src;
  }
  return null;
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
  for (const src of allSources()) {
    if (logical === src.logical) return src.local;
    if (src.kind === 'dir' && logical.startsWith(src.logical + '/')) {
      const rest = logical.slice(src.logical.length + 1);
      return path.join(src.local, ...rest.split('/'));
    }
    // keep-both copy of a single-file source lands next to the original
    if (src.kind === 'file' && logical.startsWith(src.logical + '.bottari-r')) {
      return src.local + logical.slice(src.logical.length);
    }
  }
  return null;
}
