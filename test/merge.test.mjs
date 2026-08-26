// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The 15-case verdict table from the design document, verbatim. This table
// IS the sync model; a change here is a change to what bottari means.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, decideAll, NOOP, UPLOAD, DOWNLOAD, DIVERGED } from '../src/core/merge.js';

const _ = null; // absent

const TABLE = [
  //  #   base  local remote  verdict     why
  [1,  _,   _,   _,   NOOP,     'nothing anywhere'],
  [2,  _,  'A',  _,   UPLOAD,   'new local file'],
  [3,  _,   _,  'A',  DOWNLOAD, 'another machine added it'],
  [4,  _,  'A', 'A',  NOOP,     'both created the same content'],
  [5,  _,  'A', 'B',  DIVERGED, 'no base, different content'],
  [6, 'A', 'A', 'A',  NOOP,     'unchanged everywhere'],
  [7, 'A', 'B', 'A',  UPLOAD,   'local edit only'],
  [8, 'A', 'A', 'B',  DOWNLOAD, 'remote edit only'],
  [9, 'A', 'B', 'B',  NOOP,     'both made the same edit'],
  [10, 'A', 'B', 'C', DIVERGED, 'a true fork'],
  [11, 'A', _,  'A',  DOWNLOAD, 'local deletion resurrects — no deletion propagation'],
  [12, 'A', _,  'B',  DOWNLOAD, 'local deletion + remote edit → remote version returns'],
  [13, 'A', 'A', _,   UPLOAD,   'defensive: entries are immortal, but re-upload if one vanished'],
  [14, 'A', 'B', _,   UPLOAD,   'local edit while entry vanished remotely'],
  [15, 'B', _,   _,   NOOP,     'deleted locally and never in the catalog'],
];

for (const [n, base, local, remote, expected, why] of TABLE) {
  test(`#${n} (${base ?? '–'},${local ?? '–'},${remote ?? '–'}) → ${expected}: ${why}`, () => {
    assert.equal(decide(base, local, remote), expected);
  });
}

test('decideAll covers every path seen anywhere and omits NOOPs', () => {
  const verdicts = decideAll(
    { 'a.md': 'h1', 'gone.md': 'h9' },
    { 'a.md': 'h2', 'new.md': 'h3' },
    { 'a.md': 'h1', 'remote.md': 'h4', 'gone.md': 'h9' },
  );
  assert.deepEqual(verdicts, {
    'a.md': UPLOAD,       // base==remote, local edited
    'new.md': UPLOAD,     // local only
    'remote.md': DOWNLOAD, // catalog only
    'gone.md': DOWNLOAD,  // deleted locally → resurrects
  });
});
