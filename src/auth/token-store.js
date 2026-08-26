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
      log.warn(`저장된 로그인 갱신에 실패했습니다 (${e.message}). 다시 로그인이 필요합니다.`);
      await deleteSecret(REFRESH_KEY);
    }
  }

  if (!interactive) {
    throw new Error('로그인이 필요합니다. 터미널에서 `bottari login` 을 먼저 실행하세요.');
  }

  const t = await signIn({
    ...creds,
    onUrl: (url, opened) => {
      log.info('Google 로그인 창을 기다립니다.');
      if (!opened) log.info(`브라우저가 자동으로 열리지 않으면 이 주소로 접속하세요:\n  ${url}`);
    },
  });
  if (!t.refresh_token) {
    throw new Error('Google이 refresh token을 내주지 않았습니다. 같은 클라이언트로 이미 승인된 적이 있다면 ' +
      '계정 설정(myaccount.google.com/permissions)에서 앱 접근권을 지운 뒤 다시 시도하세요.');
  }
  await setSecret(REFRESH_KEY, t.refresh_token);
  cached = { accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return cached.accessToken;
}
