// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Automatic resolution for diverged .jsonl files. Session transcripts are
// append-only, so most "conflicts" are just one side being ahead; history
// files are line-independent, so both sides' new lines can coexist.

// One side ahead of the other? byte-exact prefix check.
export function resolveAppendOnly(a, b) {
  if (a.equals(b)) return { action: 'equal' };
  const [short, long, winner] = a.length <= b.length ? [a, b, 'b'] : [b, a, 'a'];
  if (short.equals(long.subarray(0, short.length))) {
    return { action: 'take', side: winner, merged: long };
  }
  return null;
}

// For line-independent files: keep the common prefix, then local's new
// lines, then remote's new lines that local does not already have. Only
// meaningful where line order across machines does not matter.
export function lineUnion(localBuf, remoteBuf) {
  const split = (buf) => {
    const t = buf.toString('utf8');
    const lines = t.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines;
  };
  const a = split(localBuf);
  const b = split(remoteBuf);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const merged = a.slice(0, common);
  const seen = new Set(merged);
  for (const line of [...a.slice(common), ...b.slice(common)]) {
    if (!seen.has(line)) {
      seen.add(line);
      merged.push(line);
    }
  }
  return Buffer.from(merged.join('\n') + (merged.length ? '\n' : ''), 'utf8');
}
