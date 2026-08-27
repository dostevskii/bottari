// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Where sign-in state lives: the refresh token in the OS credential store,
// the access token only in this process's memory. Nothing else on disk.

import { getSecret, setSecret, deleteSecret } from '../keychain/index.js';
import { clientCredentials } from './client-id.js';
import { signIn, refreshAccessToken } from './oauth.js';
import { log } from '../util/log.js';

const REFRESH_KEY = 'google-refresh-token';

let cached = null; // { accessToken, expiresAt }

export async function hasRefreshToken() {
  return Boolean(await getSecret(REFRESH_KEY));
}

export async function forgetTokens() {
  cached = null;
  await deleteSecret(REFRESH_KEY);
}

// The one entry point everything network-side uses.
//   interactive: false — MCP and scripted paths; fails instead of opening
//   a browser.
export async function getAccessToken({ interactive = true } = {}) {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.accessToken;

  const creds = clientCredentials();
  const refreshToken = await getSecret(REFRESH_KEY);
  if (refreshToken) {
    try {
      const t = await refreshAccessToken({ refreshToken, ...creds });
      cached = { accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
      return cached.accessToken;
    } catch (e) {
      // A revoked grant should lead to a fresh sign-in, not a dead loop.
      log.warn(`Refreshing the stored sign-in failed (${e.message}). A new sign-in is needed.`);
      await deleteSecret(REFRESH_KEY);
    }
  }

  if (!interactive) {
    throw new Error('Sign-in required. Run `bottari login` in a terminal first.');
  }

  const t = await signIn({
    ...creds,
    onUrl: (url, opened) => {
      log.info('Waiting for the Google sign-in…');
      if (!opened) log.info(`If no browser window opened, use this address:\n  ${url}`);
    },
  });
  if (!t.refresh_token) {
    throw new Error('Google did not hand out a refresh token. If this client was approved before, ' +
      'remove its access at myaccount.google.com/permissions and try again.');
  }
  await setSecret(REFRESH_KEY, t.refresh_token);
  cached = { accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return cached.accessToken;
}
