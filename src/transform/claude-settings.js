// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// ~/.claude/settings.json and settings.local.json. JSON all the way down:
// strings shrink to placeholders; whatever still names an absolute path
// after shrinking is machine reality and moves to the overlay.
//
// Two arrays are order-free permission lists and split per element with
// union restore; every other array is all-or-nothing, because its order
// may mean something.

import { shrink, expand, hasAbsolutePath } from '../paths/placeholders.js';

const UNION_ARRAYS = new Set(['permissions.allow', 'permissions.deny', 'permissions.additionalDirectories']);

function splitValue(value, ctx, jsonPath) {
  if (typeof value === 'string') {
    const s = shrink(value, ctx);
    return hasAbsolutePath(s) ? { overlay: value } : { shared: s };
  }
  if (Array.isArray(value)) {
    if (UNION_ARRAYS.has(jsonPath)) {
      const shared = [];
      const overlay = [];
      for (const item of value) {
        const r = splitValue(item, ctx, jsonPath + '[]');
        if ('overlay' in r) overlay.push(item);
        else shared.push(r.shared);
      }
      return {
        ...(shared.length ? { shared } : {}),
        ...(overlay.length ? { overlay } : {}),
      };
    }
    const shrunk = [];
    for (const item of value) {
      const r = splitValue(item, ctx, jsonPath + '[]');
      if ('overlay' in r) return { overlay: value }; // one dirty element → whole array is machine truth
      shrunk.push(r.shared);
    }
    return { shared: shrunk };
  }
  if (value && typeof value === 'object') {
    const shared = {};
    const overlay = {};
    for (const [k, v] of Object.entries(value)) {
      const r = splitValue(v, ctx, jsonPath ? `${jsonPath}.${k}` : k);
      if ('shared' in r) shared[k] = r.shared;
      if ('overlay' in r) overlay[k] = r.overlay;
    }
    return {
      ...(Object.keys(shared).length || !Object.keys(overlay).length ? { shared } : {}),
      ...(Object.keys(overlay).length ? { overlay } : {}),
    };
  }
  return { shared: value }; // numbers, booleans, null
}

function merge(shared, overlay, jsonPath) {
  if (overlay === undefined) return shared;
  if (shared === undefined) return overlay;
  if (Array.isArray(shared) && Array.isArray(overlay)) {
    const seen = new Set(shared.map((x) => JSON.stringify(x)));
    return [...shared, ...overlay.filter((x) => !seen.has(JSON.stringify(x)))];
  }
  if (shared && overlay && typeof shared === 'object' && typeof overlay === 'object' &&
      !Array.isArray(shared) && !Array.isArray(overlay)) {
    const out = { ...shared };
    for (const [k, v] of Object.entries(overlay)) {
      out[k] = merge(out[k], v, jsonPath ? `${jsonPath}.${k}` : k);
    }
    return out;
  }
  return overlay; // scalar: the machine's own value wins
}

export async function pack(raw, ctx) {
  const parsed = JSON.parse(raw.toString('utf8'));
  const { shared = {}, overlay } = splitValue(parsed, ctx, '');
  return {
    shared: Buffer.from(JSON.stringify(shared, null, 2) + '\n', 'utf8'),
    overlay: overlay ?? null,
  };
}

export async function unpack(sharedBuf, { overlay, ctx }) {
  const shared = JSON.parse(expand(sharedBuf.toString('utf8'), { ...ctx, style: 'slash' }));
  const merged = merge(shared, overlay ?? undefined, '');
  return Buffer.from(JSON.stringify(merged, null, 2) + '\n', 'utf8');
}
