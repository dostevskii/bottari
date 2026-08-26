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
  ['init', {
    summary: '처음 시작: 클라우드 상태를 보고 올리기/동기화를 안내합니다',
    load: () => import('./init.js'),
  }],
  ['sync', {
    summary: '동기화 (--dry-run 미리보기, --remember-key 열쇠 보관, --force-unlock)',
    load: () => import('./sync.js'),
  }],
  ['status', {
    summary: '무엇이 오르내릴지 미리 봅니다 (아무것도 바꾸지 않음)',
    load: () => import('./status.js'),
  }],
  ['generations', {
    summary: '클라우드의 세대 목록을 봅니다',
    load: () => import('./status.js').then((m) => ({ default: m.generations })),
  }],
  ['restore', {
    summary: '이전 세대로 되돌립니다 (--generation N [--path 접두어] [--dry-run] [--force])',
    load: () => import('./restore.js'),
  }],
  ['doctor', {
    summary: '환경·저장소 정합성을 진단합니다',
    load: () => import('./doctor.js'),
  }],
  ['prune', {
    summary: '오래된 세대를 정리해 용량을 회수합니다 (--keep N [--yes])',
    load: () => import('./prune.js'),
  }],
  ['projects', {
    summary: '동기화할 프로젝트 폴더를 등록/해제합니다 (list / add <경로> / remove <이름>)',
    load: () => import('./projects.js'),
  }],
  ['tools', {
    summary: '설치 도구 목록을 기록하고 컴퓨터끼리 비교합니다 (capture / show)',
    load: () => import('./tools.js'),
  }],
  ['secrets', {
    summary: '설정에서 분리된 시크릿 값을 관리합니다 (list / set <이름> / remove <이름>)',
    load: () => import('./secrets.js'),
  }],
  ['mcp', {
    summary: 'MCP 서버로 동작합니다 (Claude 데스크톱 앱 연결용)',
    load: () => import('./mcp.js'),
  }],
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
