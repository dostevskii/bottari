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

// Written by scripts/embed-client.mjs (see that file for the format).
const EMBEDDED_ID = 'bGJsbGlpaGpsb2NidzA7bWI3OTw0bS9oPTksYzRoLG0xN2wvKz42LysqLzs5dDsqKil0PTU1PTY/Lyk/KDk1NC4/NC50OTU3';
const EMBEDDED_SECRET = 'HRUZCQoCdyAMYgosPgUzCBgcHGIzM3cFPiwcLTAoLRI9DxI=';

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
      'No Google OAuth client is configured.\n' +
      'This build ships without an embedded client. Set BOTTARI_CLIENT_ID / ' +
      'BOTTARI_CLIENT_SECRET in the environment, or create a Desktop-app ' +
      'OAuth client at console.cloud.google.com.',
    );
  }
  return { clientId: id, clientSecret: secret };
}
