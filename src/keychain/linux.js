// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Linux secret storage via secret-tool (libsecret). The value goes in on
// stdin, never argv. A headless box without a keyring daemon fails here;
// keychain/index.js then falls back to the warned 0600 file store.

import { execFileSync, spawnSync } from 'node:child_process';

const ATTRS = (name) => ['service', 'bottari', 'key', name];

export function available() {
  try {
    execFileSync('secret-tool', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

export function set(name, value) {
  const r = spawnSync('secret-tool',
    ['store', `--label=bottari ${name}`, ...ATTRS(name)],
    { input: value, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`secret-tool store failed: ${r.stderr?.trim() || 'unknown'}`);
  }
}

export function get(name) {
  const r = spawnSync('secret-tool', ['lookup', ...ATTRS(name)], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout;
}

export function remove(name) {
  spawnSync('secret-tool', ['clear', ...ATTRS(name)]);
}

export const label = 'libsecret (secret-tool)';
