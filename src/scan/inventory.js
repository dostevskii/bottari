// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// What is installed here? Binaries cannot sync across OSes, but the list
// of them can — enough for another machine to say "this one is missing".

import { execFileSync } from 'node:child_process';

const TOOLS = ['node', 'npm', 'git', 'claude', 'codex'];

export function captureInventory() {
  const tools = {};
  for (const tool of TOOLS) {
    try {
      tools[tool] = execFileSync(tool, ['--version'], {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        // npm/claude/codex are .cmd shims on Windows
        shell: process.platform === 'win32',
      }).trim().split('\n')[0];
    } catch {
      tools[tool] = null;
    }
  }
  return {
    os: process.platform,
    arch: process.arch,
    capturedAt: new Date().toISOString(),
    tools,
  };
}

// -> lines describing how `theirs` differs from `mine`
export function diffInventories(mine, theirs) {
  const lines = [];
  const names = new Set([...Object.keys(mine.tools), ...Object.keys(theirs.tools)]);
  for (const name of names) {
    const a = mine.tools[name];
    const b = theirs.tools[name];
    if (a === b) continue;
    if (a && !b) lines.push(`${name}: 이 컴퓨터 ${a} ↔ 상대 컴퓨터에 없음`);
    else if (!a && b) lines.push(`${name}: 이 컴퓨터에 없음 ↔ 상대 ${b}`);
    else lines.push(`${name}: 이 컴퓨터 ${a} ↔ 상대 ${b}`);
  }
  return lines;
}
