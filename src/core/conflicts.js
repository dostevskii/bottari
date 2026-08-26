// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Conflicts that could not be asked about on the spot (MCP has no way to
// prompt) wait here: the sync records them, the client inspects and
// resolves them by id, the next sync applies the answers.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { homeDir, atomicWrite } from '../util/fs.js';

const filePath = () => path.join(homeDir(), '.bottari', 'pending-conflicts.json');

export const conflictId = (logical) =>
  crypto.createHash('sha256').update(logical).digest('hex').slice(0, 8);

export function loadPendingState() {
  try {
    return { conflicts: [], resolutions: {}, ...JSON.parse(fs.readFileSync(filePath(), 'utf8')) };
  } catch {
    return { conflicts: [], resolutions: {} };
  }
}

// Called after a sync with the conflicts still open. Answers for ids that
// are no longer open are dropped.
export function recordPending(details) {
  const prev = loadPendingState();
  const conflicts = details.map((d) => ({ id: conflictId(d.path), ...d }));
  const openIds = new Set(conflicts.map((c) => c.id));
  const resolutions = Object.fromEntries(
    Object.entries(prev.resolutions).filter(([id]) => openIds.has(id)),
  );
  atomicWrite(filePath(), JSON.stringify({ conflicts, resolutions }, null, 2) + '\n');
  return conflicts;
}

export function setResolution(id, choice) {
  const state = loadPendingState();
  if (!state.conflicts.some((c) => c.id === id)) {
    throw new Error(`미해소 충돌 중에 id '${id}' 가 없습니다.`);
  }
  if (!['local', 'remote', 'both'].includes(choice)) {
    throw new Error(`선택지는 local/remote/both 중 하나여야 합니다: ${choice}`);
  }
  state.resolutions[id] = choice;
  atomicWrite(filePath(), JSON.stringify(state, null, 2) + '\n');
}

// What the next sync's io should answer for this path, if anything.
export function resolutionFor(logical) {
  const state = loadPendingState();
  return state.resolutions[conflictId(logical)] ?? null;
}
