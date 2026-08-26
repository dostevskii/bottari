// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import zlib from 'node:zlib';

// Sync is fine here: envelope payloads are capped at one 8MB chunk.
export function gzipBuf(buf) {
  return zlib.gzipSync(buf, { level: 6 });
}

export function gunzipBuf(buf) {
  return zlib.gunzipSync(buf);
}
