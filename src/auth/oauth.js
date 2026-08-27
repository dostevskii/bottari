// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// OAuth 2.0 for installed apps: PKCE + loopback redirect (RFC 8252).
// Google matches loopback redirect URIs by address and ignores the port,
// and the registered URI carries no path — so the listener answers on any
// path and the redirect_uri we send is just the origin.

import crypto from 'node:crypto';
import http from 'node:http';
import { execFile } from 'node:child_process';
// The confirmation pages; see the rules at the head of pages.js — nothing
// external is loaded, on the very page that just handled a credential.
import { pageOk, pageDenied } from './pages.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const b64url = (buf) => buf.toString('base64url');

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}


export function startListener(state) {
  return new Promise((resolveListener, rejectListener) => {
    let settle;
    const code = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    // The refusal can arrive before anyone has awaited `code`; without this
    // Node reports an unhandled rejection and kills the process.
    code.catch(() => {});

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const q = url.searchParams;
      // Connection: close on every response — a browser holds the socket
      // open with keep-alive otherwise, and server.close() then waits on it
      // forever right after the sign-in succeeded.
      const headers = { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' };
      if (!q.has('code') && !q.has('error')) {
        res.writeHead(404, headers).end('not found');
        return;
      }
      if (q.get('state') !== state) {
        res.writeHead(400, headers).end('state mismatch');
        return;
      }
      if (q.has('error')) {
        res.writeHead(200, headers).end(pageDenied());
        finish(() => settle.reject(new Error(`Google refused the sign-in: ${q.get('error')}`)));
        return;
      }
      res.writeHead(200, headers).end(pageOk());
      const got = q.get('code');
      finish(() => settle.resolve(got));
    });

    function finish(deliver) {
      // Deliver first, then close: close() only stops new connections and
      // its callback is not what the caller is waiting on.
      deliver();
      if (server.listening) server.close();
      clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      server.close();
      settle.reject(new Error('Timed out waiting for the sign-in (5 minutes).'));
    }, SIGN_IN_TIMEOUT_MS);
    timer.unref?.();

    server.on('error', rejectListener);
    server.listen(0, '127.0.0.1', () => {
      resolveListener({
        port: server.address().port,
        code,
        close: () => { clearTimeout(timer); if (server.listening) server.close(); },
      });
    });
  });
}

export function buildAuthUrl({ clientId, redirectUri, challenge, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // We keep a refresh token in the OS credential store, so ask for one.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
  }
  return body;
}

export function exchangeCode({ code, verifier, clientId, clientSecret, redirectUri }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] :
    process.platform === 'darwin' ? ['open', [url]] :
    ['xdg-open', [url]];
  return new Promise((resolve) => {
    execFile(cmd, args, (err) => resolve(!err));
  });
}

// Full interactive sign-in. Returns the token response, which includes a
// refresh_token because of access_type=offline + prompt=consent.
export async function signIn({ clientId, clientSecret, onUrl }) {
  const { verifier, challenge } = pkcePair();
  const state = b64url(crypto.randomBytes(16));
  const listener = await startListener(state);
  try {
    const redirectUri = `http://127.0.0.1:${listener.port}`;
    const url = buildAuthUrl({ clientId, redirectUri, challenge, state });
    const opened = await openBrowser(url);
    onUrl?.(url, opened);
    const code = await listener.code;
    return await exchangeCode({ code, verifier, clientId, clientSecret, redirectUri });
  } finally {
    listener.close();
  }
}
