// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Builds the Claude Desktop one-click bundle (.mcpb — a zip with a
// manifest). bottari's MCP server has zero dependencies, so the bundle is
// just the source tree, an entry point and a manifest.
//
//   node scripts/build-mcpb.mjs        ->  dist/bottari.mcpb
//
// The installed extension still reads ~/.bottari like the CLI does: the
// one-time `bottari init --remember-key` in a terminal remains the setup.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = createRequire(import.meta.url)(path.join(ROOT, 'package.json'));
const staging = path.join(ROOT, 'dist', 'mcpb-staging');
const out = path.join(ROOT, 'dist', 'bottari.mcpb');

fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(staging, 'server'), { recursive: true });

// the whole src tree — the server pulls core/drive/auth/crypto directly
fs.cpSync(path.join(ROOT, 'src'), path.join(staging, 'src'), { recursive: true });

fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({
  name: 'bottari',
  version: pkg.version,
  type: 'module',
}, null, 2) + '\n');

fs.writeFileSync(path.join(staging, 'server', 'index.mjs'),
  "import { serve } from '../src/mcp/server.js';\n\nawait serve();\n");

const manifest = {
  manifest_version: '0.3',
  name: 'bottari',
  display_name: 'bottari',
  version: pkg.version,
  description: 'Sync your Claude Code / Codex CLI world between machines through your own Google Drive.',
  long_description:
    'bottari packs skills, settings, session history and project folders into an ' +
    'encrypted bundle on your own Google Drive and keeps every machine in step — ' +
    'union merge, generation history, nothing ever deleted.\n\n' +
    'One-time setup in a terminal first: install bottari, run ' +
    '`bottari init --remember-key`, sign in and choose a password. After that, ' +
    'Claude can check status, sync, walk you through conflicts and restore ' +
    'earlier generations from this extension.',
  author: { name: 'JUNG HWANGBO', email: 'dostevskii@gmail.com' },
  license: 'GPL-3.0-only',
  keywords: ['sync', 'backup', 'google-drive', 'claude-code', 'codex'],
  server: {
    type: 'node',
    entry_point: 'server/index.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.mjs'],
    },
  },
  tools: [
    { name: 'bottari_status', description: 'Preview what would go up or down' },
    { name: 'bottari_sync', description: 'Synchronize with the cloud bundle' },
    { name: 'bottari_get_conflict_diff', description: 'Show both sides of a conflict' },
    { name: 'bottari_resolve_conflicts', description: 'Record conflict answers by id' },
    { name: 'bottari_list_generations', description: 'List the bundle generations' },
    { name: 'bottari_projects_list', description: 'List registered project folders' },
    { name: 'bottari_restore', description: 'Preview/apply a restore to an earlier generation' },
  ],
  compatibility: {
    platforms: ['win32', 'darwin', 'linux'],
    runtimes: { node: '>=20.0.0' },
  },
};
fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// official packer first (validates the manifest); plain zip as fallback,
// because an .mcpb is a zip archive. Arguments go as arrays — no strings
// interpolated into a shell.
try {
  execFileSync('npx', ['-y', '@anthropic-ai/mcpb', 'pack', staging, out],
    { stdio: 'inherit', shell: process.platform === 'win32' });
} catch {
  console.log('mcpb CLI unavailable - packing as a plain zip');
  const zip = out.replace(/\.mcpb$/, '.zip');
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${staging.replaceAll('\\', '/')}/*' -DestinationPath '${zip.replaceAll('\\', '/')}' -Force`]);
  } else {
    execFileSync('zip', ['-r', zip, '.'], { cwd: staging });
  }
  fs.renameSync(zip, out);
}
const size = fs.statSync(out).size;
console.log(`built: ${out} (${Math.round(size / 1024)} KB)`);
