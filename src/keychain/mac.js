// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// macOS Keychain via /usr/bin/security. The value rides in argv, which is
// briefly visible in the process list — the same trade-off every security(1)
// scripting user makes on a single-user machine.

import { execFileSync } from 'node:child_process';

const SERVICE = 'bottari';

function security(args, opts = {}) {
  return execFileSync('/usr/bin/security', args, { encoding: 'utf8', ...opts });
}

export function set(name, value) {
  security(['add-generic-password', '-U', '-s', SERVICE, '-a', name, '-w', value]);
}

export function get(name) {
  try {
    return security(['find-generic-password', '-s', SERVICE, '-a', name, '-w'],
      { stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

export function remove(name) {
  try {
    security(['delete-generic-password', '-s', SERVICE, '-a', name],
      { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    // not stored — nothing to remove
  }
}

export const label = 'macOS Keychain';
