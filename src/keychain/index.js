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
  label: '평문 파일 (0600) — 키링이 없는 환경의 최후 수단',
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
    log.warn('OS 키링을 찾지 못해 시크릿을 평문 파일(0600)에 보관합니다. ' +
      'Linux라면 gnome-keyring 과 libsecret(secret-tool) 설치를 권합니다.');
  }
  return backend;
}

export async function getSecret(name) {
  return (await pick()).get(name);
}

export async function setSecret(name, value) {
  (await pick()).set(name, value);
}

export async function deleteSecret(name) {
  (await pick()).remove(name);
}

export async function backendLabel() {
  return (await pick()).label;
}
