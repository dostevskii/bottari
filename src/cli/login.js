// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { getAccessToken, hasRefreshToken, forgetTokens } from '../auth/token-store.js';
import { backendLabel } from '../keychain/index.js';
import { log } from '../util/log.js';

export default async function login() {
  if (await hasRefreshToken()) {
    // Prove the stored grant still works instead of just claiming it does.
    await getAccessToken({ interactive: false });
    log.out('이미 로그인되어 있습니다 (저장된 로그인이 유효함).');
    return 0;
  }
  await getAccessToken({ interactive: true });
  log.out('로그인 완료.');
  log.out(`로그인 정보 보관: ${await backendLabel()}`);
  return 0;
}

export async function logout() {
  if (!(await hasRefreshToken())) {
    log.out('저장된 로그인이 없습니다.');
    return 0;
  }
  await forgetTokens();
  log.out('로그아웃했습니다. 저장된 로그인 정보를 지웠습니다.');
  return 0;
}
