// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The local half of ${BOTTARI_SECRET:name}: values live only in this
// machine's credential store and are refilled into configs on restore.

import { listSecretNames, getSecret, setSecret, deleteSecret, backendLabel } from '../keychain/index.js';
import { askHidden } from './prompt.js';
import { log } from '../util/log.js';

export default async function secrets(args) {
  const [sub, name] = args;

  if (sub === 'sync') {
    const { isEnabled, setEnabled } = await import('../core/secret-sync.js');
    if (args.includes('--enable')) {
      setEnabled(true);
      log.out('Secret syncing is ON.');
      log.out('Your MCP tokens will now travel in the bundle, encrypted with your');
      log.out('password. That means one leaked password exposes those tokens too —');
      log.out('bottari\'s own sign-in and its data key are never included.');
      log.out('Run `bottari sync` to publish them.');
      return 0;
    }
    if (args.includes('--disable')) {
      setEnabled(false);
      log.out('Secret syncing is OFF. Tokens already in the cloud stay there —');
      log.out('remove them by deleting secrets.enc from the bottari folder in Drive.');
      return 0;
    }
    log.out(`Secret syncing is ${isEnabled() ? 'ON' : 'OFF'}.`);
    log.out('usage: bottari secrets sync [--enable | --disable]');
    return 0;
  }

  if (sub === 'list' || !sub) {
    const names = listSecretNames();
    if (!names.length) {
      log.out('No secrets stored.');
      return 0;
    }
    log.out(`stored via: ${await backendLabel()}`);
    for (const n of names) {
      const present = (await getSecret(`secret:${n}`)) != null;
      log.out(`  ${n}${present ? '' : '   (name known but no value here — fill it with `set`)'}`);
    }
    return 0;
  }
  if (sub === 'set' && name) {
    const value = await askHidden(`value for '${name}': `);
    if (!value) {
      log.error('An empty value is not stored.');
      return 1;
    }
    await setSecret(`secret:${name}`, value);
    log.out(`stored: ${name}`);
    return 0;
  }
  if (sub === 'remove' && name) {
    await deleteSecret(`secret:${name}`);
    log.out(`removed: ${name}`);
    return 0;
  }
  log.error('usage: bottari secrets [list | set <name> | remove <name> | sync [--enable|--disable]]');
  return 1;
}
