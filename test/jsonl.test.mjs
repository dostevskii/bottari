// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppendOnly, lineUnion } from '../src/core/jsonl.js';

const B = (s) => Buffer.from(s, 'utf8');

test('append-only: equal buffers', () => {
  assert.equal(resolveAppendOnly(B('a\nb\n'), B('a\nb\n')).action, 'equal');
});

test('append-only: one side ahead wins, either direction', () => {
  const short = B('{"l":1}\n{"l":2}\n');
  const long = B('{"l":1}\n{"l":2}\n{"l":3}\n');
  assert.deepEqual(resolveAppendOnly(short, long), { action: 'take', side: 'b', merged: long });
  assert.deepEqual(resolveAppendOnly(long, short), { action: 'take', side: 'a', merged: long });
});

test('append-only: diverged content is not resolvable', () => {
  assert.equal(resolveAppendOnly(B('a\nx\n'), B('a\ny\n')), null);
  // same length, different bytes
  assert.equal(resolveAppendOnly(B('abc\n'), B('abd\n')), null);
});

test('append-only: prefix must be byte-exact, not line-approximate', () => {
  assert.equal(resolveAppendOnly(B('a\nb'), B('a\nbc\nd\n')) !== null, true);
  assert.equal(resolveAppendOnly(B('a\nbX'), B('a\nbc\nd\n')), null);
});

test('lineUnion: common prefix kept, both sides\' new lines join, dedup exact', () => {
  const local = B('one\ntwo\nlocal-a\nshared-new\n');
  const remote = B('one\ntwo\nremote-b\nshared-new\n');
  const merged = lineUnion(local, remote).toString('utf8');
  assert.equal(merged, 'one\ntwo\nlocal-a\nshared-new\nremote-b\n');
});

test('lineUnion: empty sides behave', () => {
  assert.equal(lineUnion(B(''), B('a\n')).toString(), 'a\n');
  assert.equal(lineUnion(B('a\n'), B('')).toString(), 'a\n');
  assert.equal(lineUnion(B(''), B('')).toString(), '');
});
