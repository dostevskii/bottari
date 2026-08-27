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
    summary: 'first run: looks at the cloud and walks you through upload or merge',
    load: () => import('./init.js'),
  }],
  ['sync', {
    summary: 'synchronize (--dry-run, --prefer local|remote for scripted runs, --remember-key)',
    load: () => import('./sync.js'),
  }],
  ['status', {
    summary: 'preview what would go up or down (changes nothing)',
    load: () => import('./status.js'),
  }],
  ['generations', {
    summary: 'list the generations in the cloud',
    load: () => import('./status.js').then((m) => ({ default: m.generations })),
  }],
  ['restore', {
    summary: 'bring files back to an earlier generation (--generation N [--path p] [--dry-run] [--force])',
    load: () => import('./restore.js'),
  }],
  ['doctor', {
    summary: 'diagnose the environment and store integrity',
    load: () => import('./doctor.js'),
  }],
  ['prune', {
    summary: 'reclaim space by dropping old generations (--keep N [--yes])',
    load: () => import('./prune.js'),
  }],
  ['projects', {
    summary: 'register project folders for sync (list / add <path> / remove <name>)',
    load: () => import('./projects.js'),
  }],
  ['tools', {
    summary: 'record installed tools and compare machines (capture / show)',
    load: () => import('./tools.js'),
  }],
  ['secrets', {
    summary: 'manage secret values kept out of shared configs (list / set <name> / remove <name>)',
    load: () => import('./secrets.js'),
  }],
  ['mcp', {
    summary: 'run as an MCP server (for the Claude desktop app)',
    load: () => import('./mcp.js'),
  }],
  ['login', {
    summary: 'sign in to Google Drive (the sign-in is kept in the OS credential store)',
    load: () => import('./login.js'),
  }],
  ['logout', {
    summary: 'remove the stored sign-in',
    load: () => import('./login.js').then((m) => ({ default: m.logout })),
  }],
]);

function printHelp() {
  const lines = [
    `bottari ${pkg.version} — pack up your CLI world and sync it through your own Google Drive.`,
    '',
    'usage: bottari <command> [options]',
    '',
    'commands:',
  ];
  for (const [name, { summary }] of COMMANDS) {
    lines.push(`  ${name.padEnd(12)} ${summary}`);
  }
  lines.push('', 'options: --help  --version');
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
    process.stderr.write(`unknown command: ${cmd}\n\n`);
    printHelp();
    return 1;
  }
  const mod = await entry.load();
  return (await mod.default(rest)) ?? 0;
}
