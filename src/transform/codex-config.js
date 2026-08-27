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

// Naming an OS-specific binary means the line describes a runtime this
// machine installed for itself. Sharing it plants a path that cannot
// exist elsewhere — a Windows node_repl.exe landing on Linux.
const isOsSpecific = (line) => /\.(exe|bat|cmd|dll|dylib|so)\b/i.test(line);

// Identity of a table, and of a root assignment — used to keep either
// from being declared twice, which TOML refuses outright.
const headerKey = (line) => line.trim().replace(/\s+/g, '');
const rootKey = (line) => (line.match(/^\s*([^=#\s]+)\s*=/) ?? [])[1];

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
    // same rule as sections: a machine-truth path or an OS-specific
    // binary belongs to this machine alone (root keys carry them too —
    // codex writes its notify hook up here).
    if (hasAbsolutePath(s) || isOsSpecific(s)) overlayRoot.push(line);
    else sharedRoot.push(s);
  }

  const sharedSections = [];
  const overlaySections = [];
  // Two headers that differ only in a detail shrink erases — a drive
  // letter's case, a separator — become the same table once shrunk.
  // Emitting both would declare it twice and make TOML reject the file,
  // so the first spelling wins.
  const claimed = new Set();
  for (const sec of sections) {
    const isWindows = /^\s*\[windows(\.|\])/.test(sec.header);
    const shrunkHeader = shrink(sec.header, ctx);
    const shrunkLines = sec.lines.map((l) => shrink(l, ctx));
    const dirty = isWindows || shrunkLines.some(isOsSpecific) ||
      hasAbsolutePath(shrunkHeader) || shrunkLines.some(hasAbsolutePath);
    const key = headerKey(dirty ? sec.header : shrunkHeader);
    if (claimed.has(key)) continue;
    claimed.add(key);
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

  // A shared entry can expand into exactly what this machine already
  // keeps in its overlay — a hooks.state table keyed by an absolute path
  // is the same table once ${BOTTARI_HOME} resolves. Emitting both makes
  // TOML reject the file for a duplicate key, so the machine's own copy
  // wins and the shared one is dropped.
  const ownHeaders = new Set((overlay?.sections ?? []).map((s) => headerKey(s.split('\n')[0])));
  const ownRootKeys = new Set((overlay?.root ?? []).map(rootKey).filter(Boolean));

  // Belt and braces: also collapse anything the shared half itself
  // repeats after expansion, whatever produced it.
  const emitted = new Set(ownHeaders);
  const sharedOut = [];
  for (const s of sections) {
    const k = headerKey(s.header);
    if (emitted.has(k)) continue;
    emitted.add(k);
    sharedOut.push([s.header, ...s.lines].join('\n'));
  }

  const parts = [
    ...root.filter((l) => {
      const k = rootKey(l);
      return !k || !ownRootKeys.has(k);
    }),
    ...(overlay?.root ?? []),
    ...sharedOut,
    ...(overlay?.sections ?? []),
  ];
  return Buffer.from(parts.join('\n'), 'utf8');
}
