// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// ~/.claude.json — only the mcpServers block is worth sharing; everything
// else in that file is machine identity, caches and usage counters. On
// restore the live file keeps all of its other keys: only mcpServers is
// replaced.
//
// Per server definition:
//   - secret-looking header/env values move to the OS credential store and
//     leave a ${BOTTARI_SECRET:name} behind
//   - a Windows-only command (.exe, drive-letter path that cannot shrink)
//     marks the server os:["win32"], and other OSes skip it on restore
//     instead of inheriting a dead server

import { shrink, expand, hasAbsolutePath } from '../paths/placeholders.js';
import { getSecret, setSecret } from '../keychain/index.js';
import { log } from '../util/log.js';

const SECRET_KEY = /authorization|token|secret|api[-_]?key|password/i;

const secretName = (server, key) =>
  `${server}-${key}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');

async function packServer(name, def, ctx) {
  const out = JSON.parse(JSON.stringify(def));
  for (const bag of [out.headers, out.env]) {
    if (!bag) continue;
    for (const [k, v] of Object.entries(bag)) {
      if (typeof v !== 'string' || v.startsWith('${BOTTARI_SECRET:')) continue;
      if (SECRET_KEY.test(k)) {
        const sname = secretName(name, k);
        await setSecret(`secret:${sname}`, v);
        bag[k] = `\${BOTTARI_SECRET:${sname}}`;
      } else {
        bag[k] = shrink(v, ctx);
      }
    }
  }
  for (const key of ['command', 'cwd']) {
    if (typeof out[key] === 'string') out[key] = shrink(out[key], ctx);
  }
  if (Array.isArray(out.args)) out.args = out.args.map((a) => (typeof a === 'string' ? shrink(a, ctx) : a));

  const cmd = out.command ?? '';
  const windowsOnly = /\.(exe|bat|cmd)$/i.test(cmd) || /^[A-Za-z]:[\\/]/.test(cmd);
  if (windowsOnly) out._bottari = { os: ['win32'] };
  return out;
}

export async function pack(raw, ctx) {
  const parsed = JSON.parse(raw.toString('utf8'));
  const servers = parsed.mcpServers ?? {};
  const shared = {};
  const overlay = {};
  for (const [name, def] of Object.entries(servers)) {
    const packed = await packServer(name, def, ctx);
    // still tied to a path outside this user's home? then it cannot mean
    // anything on another machine — keep the server local
    if (hasAbsolutePath(JSON.stringify(packed))) overlay[name] = def;
    else shared[name] = packed;
  }
  return {
    shared: Buffer.from(JSON.stringify({ mcpServers: shared }, null, 2) + '\n', 'utf8'),
    overlay: Object.keys(overlay).length ? { mcpServers: overlay } : null,
  };
}

async function refillSecrets(def, warnings) {
  const clone = JSON.parse(JSON.stringify(def));
  for (const bag of [clone.headers, clone.env]) {
    if (!bag) continue;
    for (const [k, v] of Object.entries(bag)) {
      const m = typeof v === 'string' && v.match(/^\$\{BOTTARI_SECRET:([A-Za-z0-9._-]+)\}$/);
      if (!m) continue;
      const stored = await getSecret(`secret:${m[1]}`);
      if (stored != null) bag[k] = stored;
      else warnings.push(m[1]); // placeholder stays visible on purpose
    }
  }
  return clone;
}

// currentRaw: the live ~/.claude.json of this machine (or null) — its
// non-mcpServers keys survive untouched.
export async function unpack(sharedBuf, { overlay, ctx, currentRaw }) {
  const shared = JSON.parse(expand(sharedBuf.toString('utf8'), { ...ctx, style: 'slash' }));
  const live = currentRaw ? JSON.parse(currentRaw.toString('utf8')) : {};
  const servers = {};
  const missing = [];
  const platform = ctx.platform ?? process.platform;
  for (const [name, def] of Object.entries(shared.mcpServers ?? {})) {
    const osList = def._bottari?.os;
    if (osList && !osList.includes(platform)) {
      log.info(`MCP 서버 '${name}' 은 ${osList.join('/')} 전용이라 이 컴퓨터에는 넣지 않습니다.`);
      continue;
    }
    const { _bottari, ...clean } = def;
    servers[name] = await refillSecrets(clean, missing);
  }
  for (const [name, def] of Object.entries(overlay?.mcpServers ?? {})) {
    servers[name] = def; // this machine's own servers always win
  }
  if (missing.length) {
    log.warn(`시크릿 ${missing.length}개가 이 컴퓨터에 없습니다: ${[...new Set(missing)].join(', ')}` +
      ` — \`bottari secrets set <이름>\` 으로 넣어주세요.`);
  }
  return Buffer.from(JSON.stringify({ ...live, mcpServers: servers }, null, 2) + '\n', 'utf8');
}
