// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Local sync state: the base snapshot (what the last completed sync agreed
// on) and the fast-scan cache. Written atomically, and only after a commit
// actually lands — a crash mid-sync leaves base on the old generation, and
// the next run simply re-merges.

import fs from 'node:fs';
import path from 'node:path';
import { homeDir, atomicWrite } from '../util/fs.js';

const statePath = () => path.join(homeDir(), '.bottari', 'state.json');

export function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return { lastGeneration: 0, base: {}, scanCache: {}, ...s };
  } catch {
    return { lastGeneration: 0, base: {}, scanCache: {} };
  }
}

export function saveState(state) {
  atomicWrite(statePath(), JSON.stringify(state, null, 2) + '\n');
}
