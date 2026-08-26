// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Machine-neutral text: absolute paths shrink to placeholders on the way
// up and expand to this machine's reality on the way down.
//
//   ${BOTTARI_HOME}          — the user's home directory
//   ${BOTTARI_PROJECT:slug}  — a registered project root
//   ${BOTTARI_SECRET:name}   — a secret held in the OS credential store
//
// Shrinking matches every spelling a config file may use: backslash,
// forward slash, JSON-escaped double backslash, any drive-letter case.
// A string that still contains an absolute path after shrinking is not
// machine-neutral and must stay in the machine overlay.

import { homeDir } from '../util/fs.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One home spelling → a pattern tolerating /, \ and \\ between segments,
// case-insensitive (NTFS), so the lowercase, forward-slash and
// JSON-escaped spellings of the home path all match from the single
// os.homedir() value.
function pathPattern(p) {
  const segs = p.split(/[\\/]+/).filter(Boolean);
  return segs.map(escapeRe).join('(?:[\\\\/]|\\\\\\\\)+');
}

export function shrink(text, { home = homeDir(), projects = {} } = {}) {
  let out = text;
  // longest roots first, so a project inside home wins over home itself
  const roots = [
    ...Object.entries(projects).map(([slug, root]) => ({ token: `\${BOTTARI_PROJECT:${slug}}`, root })),
    { token: '${BOTTARI_HOME}', root: home },
  ].sort((a, b) => b.root.length - a.root.length);
  for (const { token, root } of roots) {
    out = out.replace(new RegExp(pathPattern(root), 'gi'), token.replace(/\$/g, '$$$$'));
  }
  return out;
}

// style: 'slash' (default — every OS accepts it) or 'backslash' for files
// whose native writer uses Windows separators (codex config.toml).
//
// The placeholder and the path tail glued to it are rendered as one unit,
// so '${BOTTARI_HOME}\proj' on a Linux target becomes /home/…/proj, not a
// half-translated mix of separators.
const PLACEHOLDER_WITH_TAIL =
  /\$\{BOTTARI_(HOME|PROJECT:[A-Za-z0-9._-]+)\}((?:(?:\\\\|[\\/])[^"'\\/\][}\r\n]*)*)/g;

export function expand(text, { home = homeDir(), projects = {}, style = 'slash' } = {}) {
  const render = (p) => {
    const sep = style === 'backslash' ? '\\' : '/';
    const lead = /^[\\/]/.test(p) ? sep : '';
    return lead + p.split(/[\\/]+/).filter(Boolean).join(sep);
  };
  return text.replace(PLACEHOLDER_WITH_TAIL, (whole, kind, tail) => {
    let root;
    if (kind === 'HOME') {
      root = home;
    } else {
      const slug = kind.slice('PROJECT:'.length);
      if (!(slug in projects)) return whole; // unknown slug stays visible
      root = projects[slug];
    }
    return render(root + (tail ?? ''));
  });
}

// Does machine-specific reality still leak from this string? A drive
// letter must not be preceded by another letter or digit — otherwise the
// "s:" inside "https://…" reads as a drive.
const ABS_PATH = /(?:(?:^|[^A-Za-z0-9])[A-Za-z]:(?:[\\/]|\\\\)|(?:^|["'\s=(])\/(?:home|Users)\/)/;

export function hasAbsolutePath(text) {
  return ABS_PATH.test(text);
}

export function listUnresolvedPlaceholders(text) {
  return [...text.matchAll(/\$\{BOTTARI_(?:SECRET|PROJECT):([A-Za-z0-9._-]+)\}/g)].map((m) => m[0]);
}
