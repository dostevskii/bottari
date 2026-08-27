// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pkcePair, startListener, buildAuthUrl, SCOPE } from '../src/auth/oauth.js';

const b64url = (b) => b.toString('base64url');

function get(url, agent) {
  return new Promise((resolve, reject) => {
    http.get(url, agent ? { agent } : {}, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

test('pkce: 43-char verifier, S256 challenge, unique pairs', () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(challenge, b64url(crypto.createHash('sha256').update(verifier).digest()));
  assert.notEqual(pkcePair().verifier, verifier);
});

test('auth url asks for drive.file, offline access and PKCE', () => {
  const url = new URL(buildAuthUrl({
    clientId: 'id', redirectUri: 'http://127.0.0.1:1', challenge: 'c', state: 's',
  }));
  const q = url.searchParams;
  assert.equal(q.get('scope'), SCOPE);
  assert.equal(q.get('access_type'), 'offline');
  assert.equal(q.get('prompt'), 'consent');
  assert.equal(q.get('code_challenge_method'), 'S256');
});

test('listener: probes and wrong state never end the sign-in', async () => {
  const state = b64url(crypto.randomBytes(16));
  const l = await startListener(state);
  const base = `http://127.0.0.1:${l.port}`;

  assert.equal((await get(base + '/')).status, 404);
  assert.equal((await get(`${base}/?code=x&state=WRONG`)).status, 400);

  let settled = false;
  l.code.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(settled, false);

  const ok = await get(`${base}/any/path?code=the-code&state=${encodeURIComponent(state)}`);
  assert.equal(ok.status, 200);
  assert.ok(!/https?:\/\//.test(ok.body), 'the page must load nothing external');
  assert.equal(await l.code, 'the-code');
});

test('listener survives a keep-alive browser socket', async () => {
  // A real browser holds the response socket open; server.close() waits on
  // open connections, so a sign-in settled from its callback would hang
  // forever right after succeeding.
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const l = await startListener('ka');
  const page = await get(`http://127.0.0.1:${l.port}/?code=ka-code&state=ka`, agent);
  assert.match(page.body, /Signed in/);
  const result = await Promise.race([
    l.code,
    new Promise((r) => setTimeout(() => r('HUNG'), 3000)),
  ]);
  assert.equal(result, 'ka-code');
  agent.destroy();
});

test('a refusal is an error, not a dead process', async () => {
  const l = await startListener('st');
  await get(`http://127.0.0.1:${l.port}/?error=access_denied&state=st`);
  await assert.rejects(() => l.code, /거부|refused/);
});

test('two listeners get their own ports', async () => {
  const a = await startListener('a');
  const b = await startListener('b');
  assert.notEqual(a.port, b.port);
  a.close();
  b.close();
});

test('the auth module writes nothing to disk and ships no client id', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'auth');
  const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(sources.length >= 4, 'the auth sources should all be scanned');
  for (const f of sources) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f !== 'token-store.js') {
      assert.ok(!/writeFileSync|createWriteStream|appendFile/.test(src), `${f} writes to disk`);
    }
    assert.ok(!/\.apps\.googleusercontent\.com/.test(src), `${f} carries a raw client id`);
    assert.ok(!/GOCSPX-/.test(src), `${f} carries a raw client secret`);
  }
});
