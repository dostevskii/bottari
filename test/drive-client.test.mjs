// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../src/drive/client.js';

function fakeFetch(script) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url: String(url), auth: opts.headers.Authorization });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.body ?? {},
      text: async () => JSON.stringify(step.body ?? {}),
    };
  };
  return { impl, calls };
}

test('retries 429 and 5xx with backoff, then succeeds', async () => {
  const { impl, calls } = fakeFetch([
    { status: 429 }, { status: 503 }, { status: 200, body: { id: 'x' } },
  ]);
  const client = makeClient({ getAccessToken: async () => 'tok', fetchImpl: impl });
  const res = await client.request('/files/x');
  assert.equal(res.id, 'x');
  assert.equal(calls.length, 3);
});

test('a 401 triggers exactly one token refresh and retry', async () => {
  let tokens = 0;
  const { impl, calls } = fakeFetch([{ status: 401 }, { status: 200, body: { ok: true } }]);
  const client = makeClient({ getAccessToken: async () => `tok-${++tokens}`, fetchImpl: impl });
  const res = await client.request('/files/x');
  assert.equal(res.ok, true);
  assert.deepEqual(calls.map((c) => c.auth), ['Bearer tok-1', 'Bearer tok-2']);
});

test('a persistent 401 fails instead of looping', async () => {
  const { impl, calls } = fakeFetch([{ status: 401 }]);
  const client = makeClient({ getAccessToken: async () => 'tok', fetchImpl: impl });
  await assert.rejects(() => client.request('/files/x'), /401/);
  assert.equal(calls.length, 2);
});

test('gives up after maxTries on server errors', async () => {
  const { impl, calls } = fakeFetch([{ status: 500 }]);
  const client = makeClient({ getAccessToken: async () => 'tok', fetchImpl: impl, maxTries: 3 });
  await assert.rejects(() => client.request('/files/x'), /500/);
  assert.equal(calls.length, 3);
});

test('query parameters land on the url', async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: {} }]);
  const client = makeClient({ getAccessToken: async () => 'tok', fetchImpl: impl });
  await client.request('/files', { query: { q: "name = 'a'", pageSize: 5 } });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('pageSize'), '5');
  assert.equal(url.searchParams.get('q'), "name = 'a'");
});
