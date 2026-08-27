// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// macOS Keychain via /usr/bin/security. The value goes to the password
// argument, which security(1) has no stdin form for; that argv is briefly
// visible in the process list, the standard trade-off for scripting this
// tool. What must NEVER happen is the value reaching an error message —
// Node's execFileSync puts the whole failed command line (value included)
// into err.message, so every call that carries the value is wrapped to
// throw a value-free error instead.

import { execFileSync } from 'node:child_process';

const SERVICE = 'bottari';

// Runs security and, on failure, throws an error that names only the
// operation — never the arguments. `secret: true` means the argv held the
// value, so even a leaked exit detail must be discarded.
function security(op, args, { secret = false } = {}) {
  try {
    return execFileSync('/usr/bin/security', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', secret ? 'ignore' : 'pipe'],
    });
  } catch (e) {
    if (secret) {
      // e.message / e.stderr may echo the command line and the value.
      // Surface only the shape of the failure.
      const denied = /interaction is not allowed|could not be authenticated/i.test(e.stderr ?? '');
      throw new Error(denied
        ? 'macOS Keychain refused the write (it is locked or has no GUI session). '
          + 'Unlock the login keychain and try again, or set BOTTARI_KEYCHAIN=file to use the file fallback.'
        : 'macOS Keychain write failed.');
    }
    throw new Error(`security ${op} failed`);
  }
}

export function set(name, value) {
  security('add-generic-password',
    ['add-generic-password', '-U', '-s', SERVICE, '-a', name, '-w', value],
    { secret: true });
}

export function get(name) {
  try {
    return execFileSync('/usr/bin/security',
      ['find-generic-password', '-s', SERVICE, '-a', name, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/, '');
  } catch {
    return null; // not stored
  }
}

export function remove(name) {
  try {
    security('delete-generic-password',
      ['delete-generic-password', '-s', SERVICE, '-a', name]);
  } catch {
    // not stored — nothing to remove
  }
}

export const label = 'macOS Keychain';
