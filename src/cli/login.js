// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { getAccessToken, hasRefreshToken, forgetTokens } from '../auth/token-store.js';
import { backendLabel } from '../keychain/index.js';
import { log } from '../util/log.js';

export default async function login() {
  if (await hasRefreshToken()) {
    // Prove the stored grant still works instead of just claiming it does.
    await getAccessToken({ interactive: false });
    log.out('Already signed in (the stored sign-in still works).');
    return 0;
  }
  await getAccessToken({ interactive: true });
  log.out('Signed in.');
  log.out(`Sign-in stored via: ${await backendLabel()}`);
  return 0;
}

export async function logout() {
  if (!(await hasRefreshToken())) {
    log.out('No stored sign-in.');
    return 0;
  }
  await forgetTokens();
  log.out('Signed out. The stored sign-in was removed.');
  return 0;
}
