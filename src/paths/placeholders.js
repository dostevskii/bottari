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

// One home spelling → patterns tolerating /, \ and \\ between segments,
// case-insensitive (NTFS), so the lowercase, forward-slash and
// JSON-escaped spellings of the home path all match from the single
// os.homedir() value. A Windows home additionally matches its Git Bash
// (MSYS) spelling, /c/Users/example — permission entries recorded through
// a bash shell really do look like that.
function pathPatterns(p) {
  const segs = p.split(/[\\/]+/).filter(Boolean);
  const sep = '(?:[\\\\/]|\\\\\\\\)+';
  const patterns = [segs.map(escapeRe).join(sep)];
  const drive = /^([A-Za-z]):$/.exec(segs[0]);
  if (drive) {
    patterns.push('/+' + drive[1] + '/' + segs.slice(1).map(escapeRe).join(sep));
  }
  return patterns;
}

export function shrink(text, { home = homeDir(), projects = {} } = {}) {
  let out = text;
  // longest roots first, so a project inside home wins over home itself
  const roots = [
    ...Object.entries(projects).map(([slug, root]) => ({ token: `\${BOTTARI_PROJECT:${slug}}`, root })),
    { token: '${BOTTARI_HOME}', root: home },
  ].sort((a, b) => b.root.length - a.root.length);
  for (const { token, root } of roots) {
    for (const pattern of pathPatterns(root)) {
      out = out.replace(new RegExp(pattern, 'gi'), token.replace(/\$/g, '$$$$'));
    }
  }
  return out;
}

// style: 'slash' (default — every OS accepts it) or 'backslash' for files
// whose native writer uses Windows separators (codex config.toml).
//
// The placeholder and the path tail glued to it are rendered as one unit,
// so '${BOTTARI_HOME}\proj' on a Linux target becomes /home/…/proj, not a
// half-translated mix of separators.
// Each tail hop needs a real segment after its separator (+, not *): a
// lone backslash right before a quote is JSON escaping the quote, and
// consuming it would corrupt the document.
const PLACEHOLDER_WITH_TAIL =
  /\$\{BOTTARI_(HOME|PROJECT:[A-Za-z0-9._-]+)\}((?:(?:\\\\|[\\/])[^"'\\/\][}\r\n]+)*)/g;

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
// "s:" inside "https://…" reads as a drive. The MSYS spelling of a user
// directory (/c/Users/example) counts too.
const ABS_PATH = /(?:(?:^|[^A-Za-z0-9])[A-Za-z]:(?:[\\/]|\\\\)|(?:^|["'\s=(])\/(?:home|Users)\/|\/[A-Za-z]\/(?:Users|home)\/)/i;

export function hasAbsolutePath(text) {
  return ABS_PATH.test(text);
}

export function listUnresolvedPlaceholders(text) {
  return [...text.matchAll(/\$\{BOTTARI_(?:SECRET|PROJECT):([A-Za-z0-9._-]+)\}/g)].map((m) => m[0]);
}
