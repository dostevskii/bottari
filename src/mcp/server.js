// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// A hand-rolled MCP server: newline-delimited JSON-RPC 2.0 over stdio.
// bottari needs three methods and a handful of tools — the official SDK
// and its dependency tree buy nothing here. If the protocol grows a
// mandatory capability this cannot express, switching to the SDK is the
// agreed follow-up.
//
// stdout belongs to the protocol; every human-facing message in the core
// already goes to stderr.

import readline from 'node:readline';
import { createRequire } from 'node:module';
import { TOOLS } from './tools.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const PROTOCOL_VERSION = '2025-06-18';

export function serve({ input = process.stdin, output = process.stdout } = {}) {
  const send = (obj) => output.write(JSON.stringify(obj) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  const rl = readline.createInterface({ input, terminal: false });
  rl.on('line', async (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // not JSON-RPC; nothing sane to answer
    }
    const { id, method, params } = msg;

    if (method === 'initialize') {
      reply(id, {
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'bottari', version: pkg.version },
      });
      return;
    }
    if (method === 'notifications/initialized' || id === undefined) {
      return; // notifications get no response
    }
    if (method === 'ping') {
      reply(id, {});
      return;
    }
    if (method === 'tools/list') {
      reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
      return;
    }
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        fail(id, -32602, `알 수 없는 도구입니다: ${params?.name}`);
        return;
      }
      try {
        const result = await tool.handler(params?.arguments ?? {});
        reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        reply(id, { content: [{ type: 'text', text: '오류: ' + e.message }], isError: true });
      }
      return;
    }
    fail(id, -32601, `지원하지 않는 메서드입니다: ${method}`);
  });

  return new Promise((resolve) => rl.on('close', resolve));
}
