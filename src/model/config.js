// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// config.json — what to sync (project folders, scope toggles).
// profile.json — who this machine is (a random id, never the hostname).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { homeDir, atomicWrite } from '../util/fs.js';

const configPath = () => path.join(homeDir(), '.bottari', 'config.json');
const profilePath = () => path.join(homeDir(), '.bottari', 'profile.json');

export function loadConfig() {
  try {
    return { projects: {}, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    return { projects: {} };
  }
}

export function saveConfig(config) {
  atomicWrite(configPath(), JSON.stringify(config, null, 2) + '\n');
}

export function loadProfile() {
  try {
    const p = JSON.parse(fs.readFileSync(profilePath(), 'utf8'));
    if (p.machineId) return p;
  } catch { /* first run */ }
  const fresh = { machineId: crypto.randomUUID(), os: process.platform };
  atomicWrite(profilePath(), JSON.stringify(fresh, null, 2) + '\n');
  return fresh;
}
