// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// ~/.codex/config.toml — transformed as text, line by line, preserving
// everything codex wrote. No full TOML parser: only two shapes matter
// here, section headers and the lines inside them.
//
// Section granularity:
//   [windows]…            → overlay (OS-specific by definition)
//   any section whose header or body still names an absolute path after
//   shrinking               → overlay (machine truth)
//   everything else        → shared, with paths shrunk in place
//
// Restore = expand(shared, backslash on win32) + overlay root lines put
// back before the first section + overlay sections appended. TOML forbids
// duplicate table headers, and overlay sections were removed from shared
// wholesale, so appending them is always legal.

import { shrink, expand, hasAbsolutePath } from '../paths/placeholders.js';

const HEADER = /^\s*\[.*\]\s*(#.*)?$/;

function toSections(text) {
  const lines = text.split('\n');
  const root = [];
  const sections = []; // {header, lines}
  let current = null;
  for (const line of lines) {
    if (HEADER.test(line)) {
      current = { header: line, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      root.push(line);
    }
  }
  return { root, sections };
}

export async function pack(raw, ctx) {
  const { root, sections } = toSections(raw.toString('utf8'));

  const sharedRoot = [];
  const overlayRoot = [];
  for (const line of root) {
    const s = shrink(line, ctx);
    (hasAbsolutePath(s) ? overlayRoot : sharedRoot).push(hasAbsolutePath(s) ? line : s);
  }

  const sharedSections = [];
  const overlaySections = [];
  for (const sec of sections) {
    const isWindows = /^\s*\[windows(\.|\])/.test(sec.header);
    const shrunkHeader = shrink(sec.header, ctx);
    const shrunkLines = sec.lines.map((l) => shrink(l, ctx));
    const dirty = isWindows || hasAbsolutePath(shrunkHeader) || shrunkLines.some(hasAbsolutePath);
    if (dirty) {
      overlaySections.push([sec.header, ...sec.lines].join('\n'));
    } else {
      sharedSections.push([shrunkHeader, ...shrunkLines].join('\n'));
    }
  }

  const sharedText = [...sharedRoot, ...sharedSections].join('\n');
  const overlay = (overlayRoot.length || overlaySections.length)
    ? { root: overlayRoot, sections: overlaySections }
    : null;
  return { shared: Buffer.from(sharedText, 'utf8'), overlay };
}

export async function unpack(sharedBuf, { overlay, ctx }) {
  const style = (ctx.platform ?? process.platform) === 'win32' ? 'backslash' : 'slash';
  const expanded = expand(sharedBuf.toString('utf8'), { ...ctx, style });
  const { root, sections } = toSections(expanded);

  const parts = [
    ...root,
    ...(overlay?.root ?? []),
    ...sections.map((s) => [s.header, ...s.lines].join('\n')),
    ...(overlay?.sections ?? []),
  ];
  return Buffer.from(parts.join('\n'), 'utf8');
}
