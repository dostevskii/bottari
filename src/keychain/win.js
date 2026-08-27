// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Windows secret storage: DPAPI, driven through PowerShell. cmdkey can
// write Credential Manager entries but cannot read them back, so DPAPI it
// is — same user-account protection, and the ciphertext lives in a bottari
// file. The script goes in via -EncodedCommand (UTF-16LE base64), which
// sidesteps both quoting and the PowerShell 5.1 BOM trap: no .ps1 file
// ever exists.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { homeDir } from '../util/fs.js';
import { atomicWrite } from '../util/fs.js';

const VAULT = () => path.join(homeDir(), '.bottari', 'vault.win.json');

function ps(script) {
  // progress records leak to stderr as CLIXML noise otherwise
  const encoded = Buffer.from(`$ProgressPreference='SilentlyContinue'; ${script}`, 'utf16le').toString('base64');
  return execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { encoding: 'utf8', windowsHide: true }).trim();
}

function dpapi(op, b64) {
  return ps(
    'Add-Type -AssemblyName System.Security; ' +
    '[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::' +
    `${op}([Convert]::FromBase64String('${b64}'), $null, 'CurrentUser'))`,
  );
}

function readVault() {
  try { return JSON.parse(fs.readFileSync(VAULT(), 'utf8')); }
  catch { return {}; }
}

export function set(name, value) {
  const vault = readVault();
  vault[name] = dpapi('Protect', Buffer.from(value, 'utf8').toString('base64'));
  atomicWrite(VAULT(), JSON.stringify(vault, null, 2) + '\n');
}

export function get(name) {
  const enc = readVault()[name];
  if (!enc) return null;
  return Buffer.from(dpapi('Unprotect', enc), 'base64').toString('utf8');
}

export function remove(name) {
  const vault = readVault();
  if (!(name in vault)) return;
  delete vault[name];
  atomicWrite(VAULT(), JSON.stringify(vault, null, 2) + '\n');
}

export const label = 'Windows DPAPI (bound to this user account)';
