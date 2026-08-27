// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// One secret-store interface per OS, plus a last-resort 0600 file for
// machines with no keyring at all. The fallback warns on every use: it is
// plaintext at rest and the user deserves to know.

import fs from 'node:fs';
import path from 'node:path';
import { homeDir, atomicWrite } from '../util/fs.js';
import { log } from '../util/log.js';

const FALLBACK = () => path.join(homeDir(), '.bottari', 'vault.plain.json');

const fileStore = {
  label: 'plaintext file (0600) — last resort where no keyring exists',
  set(name, value) {
    let vault = {};
    try { vault = JSON.parse(fs.readFileSync(FALLBACK(), 'utf8')); } catch { /* fresh */ }
    vault[name] = value;
    atomicWrite(FALLBACK(), JSON.stringify(vault, null, 2) + '\n');
    try { fs.chmodSync(FALLBACK(), 0o600); } catch { /* not meaningful on Windows */ }
  },
  get(name) {
    try { return JSON.parse(fs.readFileSync(FALLBACK(), 'utf8'))[name] ?? null; }
    catch { return null; }
  },
  remove(name) {
    try {
      const vault = JSON.parse(fs.readFileSync(FALLBACK(), 'utf8'));
      delete vault[name];
      atomicWrite(FALLBACK(), JSON.stringify(vault, null, 2) + '\n');
    } catch { /* nothing stored */ }
  },
};

let backend = null;
let warnedFallback = false;

async function pick() {
  if (backend) return backend;
  if (process.env.BOTTARI_KEYCHAIN === 'file') {
    backend = fileStore;
  } else if (process.platform === 'win32') {
    backend = await import('./win.js');
  } else if (process.platform === 'darwin') {
    backend = await import('./mac.js');
  } else {
    const linux = await import('./linux.js');
    backend = linux.available() ? linux : fileStore;
  }
  if (backend === fileStore && !warnedFallback) {
    warnedFallback = true;
    log.warn('No OS keyring found — secrets go into a plaintext file (0600). ' +
      'On Linux, installing gnome-keyring and libsecret (secret-tool) is recommended.');
  }
  return backend;
}

// No OS keyring can enumerate our entries portably, so user-facing
// secrets (the 'secret:' namespace) keep a name index — names only, the
// values stay in the credential store.
const indexPath = () => path.join(homeDir(), '.bottari', 'secret-names.json');

function readIndex() {
  try { return JSON.parse(fs.readFileSync(indexPath(), 'utf8')); } catch { return []; }
}

function trackName(name, present) {
  if (!name.startsWith('secret:')) return;
  const bare = name.slice('secret:'.length);
  const names = new Set(readIndex());
  if (present) names.add(bare);
  else names.delete(bare);
  atomicWrite(indexPath(), JSON.stringify([...names].sort(), null, 2) + '\n');
}

export function listSecretNames() {
  return readIndex();
}

export async function getSecret(name) {
  return (await pick()).get(name);
}

export async function setSecret(name, value) {
  (await pick()).set(name, value);
  trackName(name, true);
}

export async function deleteSecret(name) {
  (await pick()).remove(name);
  trackName(name, false);
}

export async function backendLabel() {
  return (await pick()).label;
}
