// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newManifest, serializeManifest, parseManifest, stableStringify, hashesOf,
} from '../src/model/manifest.js';
import { toLogical, findCaseCollisions } from '../src/paths/normalize.js';

test('serialization is deterministic regardless of key order', () => {
  const a = stableStringify({ b: 1, a: { d: [1, 2], c: 'x' } });
  const b = stableStringify({ a: { c: 'x', d: [1, 2] }, b: 1 });
  assert.equal(a, b);
});

test('manifest roundtrip and validation', () => {
  const m = newManifest({
    generation: 3, parent: 2, machineId: 'm1', os: 'linux',
    entries: { 'claude/CLAUDE.md': { hash: 'h', size: 1, mtime: 0, exec: false, tier: 'A', objects: ['o'], gzip: true } },
  });
  const back = parseManifest(serializeManifest(m));
  assert.deepEqual(back.entries, m.entries);
  assert.equal(back.generation, 3);
  assert.throws(() => parseManifest(Buffer.from('{"schema":99}')), /스키마/);
  assert.throws(() => parseManifest(Buffer.from('{"schema":1,"generation":0,"entries":{}}')), /세대 번호/);
});

test('hashesOf projects the merge view', () => {
  assert.deepEqual(
    hashesOf({ a: { hash: 'h1' }, b: { hash: 'h2' } }),
    { a: 'h1', b: 'h2' },
  );
});

test('logical paths: NFC and forward slashes', () => {
  // NFD 한글 (macOS) must collapse to the same key as NFC
  const nfd = '한글'.normalize('NFD');
  assert.notEqual(nfd, '한글');
  assert.equal(toLogical(`dir\\${nfd}.md`), '한글.md'.replace(/^/, 'dir/'));
});

test('case collisions are detected, not silently merged', () => {
  const hits = findCaseCollisions(['sessions/C--home', 'sessions/c--home', 'other/x']);
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].paths, ['sessions/C--home', 'sessions/c--home']);
});
