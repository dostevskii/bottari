// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The OAuth client this build talks to Google as. For an installed app the
// client secret is not a secret (RFC 8252 §8.5): it ships with every copy
// and only identifies the app, never a user. It is lightly encoded here —
// the rclone convention — to keep it out of trivial credential scrapers,
// not to hide it.
//
// BOTTARI_CLIENT_ID / BOTTARI_CLIENT_SECRET in the environment override the
// embedded pair, so anyone redistributing a fork can register their own.

const XOR_KEY = 0x5a;

// Filled by scripts/embed-client.mjs before release; empty in source.
const EMBEDDED_ID = '';
const EMBEDDED_SECRET = '';

function decode(s) {
  if (!s) return '';
  const raw = Buffer.from(s, 'base64');
  for (let i = 0; i < raw.length; i++) raw[i] ^= XOR_KEY;
  return raw.toString('utf8');
}

export function encode(s) {
  const raw = Buffer.from(s, 'utf8');
  for (let i = 0; i < raw.length; i++) raw[i] ^= XOR_KEY;
  return raw.toString('base64');
}

export function clientCredentials() {
  const id = process.env.BOTTARI_CLIENT_ID || decode(EMBEDDED_ID);
  const secret = process.env.BOTTARI_CLIENT_SECRET || decode(EMBEDDED_SECRET);
  if (!id || !secret) {
    throw new Error(
      'Google OAuth 클라이언트가 설정되지 않았습니다.\n' +
      '이 빌드에는 클라이언트가 내장되지 않았습니다. 환경변수 BOTTARI_CLIENT_ID / ' +
      'BOTTARI_CLIENT_SECRET 를 설정하거나, console.cloud.google.com 에서 ' +
      '데스크톱 앱 OAuth 클라이언트를 만들어 넣어주세요.',
    );
  }
  return { clientId: id, clientSecret: secret };
}
