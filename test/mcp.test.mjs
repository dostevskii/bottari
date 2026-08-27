// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Golden test against a real spawned server process: initialize,
// tools/list, a local tool call, and a cloud tool failing cleanly when
// nothing is signed in.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-mcp-'));

test('MCP golden conversation', async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'bottari.mjs'), 'mcp'], {
    env: { ...process.env, BOTTARI_HOME: HOME, BOTTARI_KEYCHAIN: 'file' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch { /* ignore non-JSON noise */ }
  });
  let nextId = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} 응답 없음`)), 15000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  try {
    const init = await call('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    assert.equal(init.result.serverInfo.name, 'bottari');
    assert.equal(init.result.protocolVersion, '2025-06-18');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const list = await call('tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    assert.deepEqual(names.sort(), [
      'bottari_get_conflict_diff', 'bottari_list_generations',
      'bottari_projects_list', 'bottari_resolve_conflicts', 'bottari_restore',
      'bottari_status', 'bottari_sync',
    ]);
    // registering folders decides what leaves the machine — human-only, CLI-only
    assert.ok(!names.includes('bottari_projects_add'));
    assert.ok(list.result.tools.every((t) => t.description && t.inputSchema?.type === 'object'));

    // a purely local tool works with no cloud at all
    const projects = await call('tools/call', { name: 'bottari_projects_list', arguments: {} });
    assert.equal(projects.result.isError, undefined);
    assert.deepEqual(JSON.parse(projects.result.content[0].text), { projects: {} });

    // a cloud tool with nothing signed in: a clean isError, not a crash
    const status = await call('tools/call', { name: 'bottari_status', arguments: {} });
    assert.equal(status.result.isError, true);
    assert.match(status.result.content[0].text, /Sign-in|key|bundle/i);

    const unknown = await call('tools/call', { name: 'no_such_tool', arguments: {} });
    assert.equal(unknown.error.code, -32602);

    const bad = await call('bogus/method', {});
    assert.equal(bad.error.code, -32601);
  } finally {
    child.kill();
  }
});
