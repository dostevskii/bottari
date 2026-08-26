// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Command router. Commands register here as they are implemented; the map
// stays the single source of what the CLI can do.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

// name -> { summary, load: () => import(...) }
const COMMANDS = new Map([
  ['login', {
    summary: 'Google Drive에 로그인합니다 (로그인 정보는 OS 자격증명 저장소에 보관)',
    load: () => import('./login.js'),
  }],
  ['logout', {
    summary: '저장된 로그인 정보를 지웁니다',
    load: () => import('./login.js').then((m) => ({ default: m.logout })),
  }],
]);

function printHelp() {
  const lines = [
    `bottari ${pkg.version} — CLI 환경을 보따리에 싸서 Google Drive로 동기화합니다.`,
    '',
    '사용법: bottari <명령> [옵션]',
    '',
  ];
  if (COMMANDS.size === 0) {
    lines.push('아직 사용할 수 있는 명령이 없습니다 (개발 중).');
  } else {
    lines.push('명령:');
    for (const [name, { summary }] of COMMANDS) {
      lines.push(`  ${name.padEnd(12)} ${summary}`);
    }
  }
  lines.push('', '옵션: --help  --version');
  process.stdout.write(lines.join('\n') + '\n');
}

export async function run(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return 0;
  }
  if (cmd === '--version' || cmd === '-v') {
    process.stdout.write(pkg.version + '\n');
    return 0;
  }
  const entry = COMMANDS.get(cmd);
  if (!entry) {
    process.stderr.write(`알 수 없는 명령입니다: ${cmd}\n\n`);
    printHelp();
    return 1;
  }
  const mod = await entry.load();
  return (await mod.default(rest)) ?? 0;
}
