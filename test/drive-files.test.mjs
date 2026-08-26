// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../src/drive/client.js';
import { makeFiles } from '../src/drive/files.js';

function res({ status, headers = {}, body = {} }) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function scripted(steps) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET', headers: opts.headers, body: opts.body });
    return res(steps[Math.min(calls.length - 1, steps.length - 1)]);
  };
  return { impl, calls };
}

test('small data goes multipart, large goes resumable', async () => {
  const big = Buffer.alloc(6 * 1024 * 1024, 7);
  const small = Buffer.alloc(1024, 7);
  {
    const { impl, calls } = scripted([{ status: 200, body: { id: 'a' } }]);
    const files = makeFiles(makeClient({ getAccessToken: async () => 't', fetchImpl: impl }));
    await files.upload({ name: 'x', parentId: 'p', data: small });
    assert.ok(calls[0].url.includes('uploadType=multipart'));
  }
  {
    const { impl, calls } = scripted([
      { status: 200, headers: { Location: 'https://upload.example/session-1' } },
      { status: 200, body: { id: 'b' } },
    ]);
    const files = makeFiles(makeClient({ getAccessToken: async () => 't', fetchImpl: impl }));
    const out = await files.upload({ name: 'x', parentId: 'p', data: big });
    assert.equal(out.id, 'b');
    assert.ok(calls[0].url.includes('uploadType=resumable'));
    assert.equal(calls[1].url, 'https://upload.example/session-1');
    assert.equal(calls[1].method, 'PUT');
    assert.equal(calls[1].body.length, big.length);
  }
});

test('a dead PUT resumes from where the session says it stopped', async () => {
  const data = Buffer.alloc(6 * 1024 * 1024, 9);
  const offset = 2 * 1024 * 1024;
  const { impl, calls } = scripted([
    { status: 200, headers: { Location: 'https://upload.example/session-2' } },
    { status: 503 },                                              // first PUT dies
    { status: 308, headers: { Range: `bytes=0-${offset - 1}` } }, // probe: got this much
    { status: 200, body: { id: 'done' } },                        // remainder lands
  ]);
  const files = makeFiles(makeClient({ getAccessToken: async () => 't', fetchImpl: impl, maxTries: 1 }));
  const out = await files.uploadResumable({ name: 'x', parentId: 'p', data });
  assert.equal(out.id, 'done');
  const probe = calls[2];
  assert.equal(probe.headers['Content-Range'], `bytes */${data.length}`);
  const resumePut = calls[3];
  assert.equal(resumePut.headers['Content-Range'], `bytes ${offset}-${data.length - 1}/${data.length}`);
  assert.equal(resumePut.body.length, data.length - offset);
});
