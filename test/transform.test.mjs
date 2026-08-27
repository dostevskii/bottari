// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Tier B transforms, on pseudonymous fixtures shaped like the real files.
// Every path here is fake by design (C:\Users\example, /home/example).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BOTTARI_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bottari-tf-'));
process.env.BOTTARI_KEYCHAIN = 'file';

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const settings = await import('../src/transform/claude-settings.js');
const claudeJson = await import('../src/transform/claude-json.js');
const codexConfig = await import('../src/transform/codex-config.js');
const { shrink, expand, hasAbsolutePath } = await import('../src/paths/placeholders.js');

// platform pinned so the suite behaves identically on every host OS
const WIN = { home: 'C:\\Users\\example', projects: {}, platform: 'win32' };
const LNX = { home: '/home/example', projects: {}, platform: 'linux' };
const B = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o, null, 2), 'utf8');

// ---------- placeholders ----------

test('shrink catches every spelling: backslash, slash, escaped, msys, any case', () => {
  for (const s of [
    'C:\\Users\\example\\x', 'c:/users/example/x', 'C:\\\\Users\\\\example\\\\x',
    '/c/Users/example/x', '//c/users/example/x',
  ]) {
    const out = shrink(s, WIN);
    assert.ok(out.includes('${BOTTARI_HOME}'), `${s} → ${out}`);
    assert.ok(!hasAbsolutePath(out), `${s} still absolute: ${out}`);
  }
  // someone else's msys home is still an absolute path
  assert.ok(hasAbsolutePath('/d/Users/example2/x'));
});

test('projects shrink before home (longest root wins)', () => {
  const ctx = { home: 'C:\\Users\\example', projects: { web: 'C:\\Users\\example\\sites\\web' } };
  assert.equal(
    shrink('C:/Users/example/sites/web/index.html', ctx),
    '${BOTTARI_PROJECT:web}/index.html',
  );
});

test('expand renders the target machine, unknown slugs stay visible', () => {
  assert.equal(expand('${BOTTARI_HOME}/a', LNX), '/home/example/a');
  assert.equal(expand('${BOTTARI_HOME}\\a', { ...WIN, style: undefined }), 'C:/Users/example/a');
  assert.equal(expand('${BOTTARI_PROJECT:nope}/x', LNX), '${BOTTARI_PROJECT:nope}/x');
});

test('expand never eats a JSON quote escape (regression: real settings.json)', () => {
  // raw text: \"${BOTTARI_HOME}\\docs\\x.html\"  — as it appears inside a
  // JSON document, where \" is an escaped quote and \\ a path separator
  const text = '\\"' + '${BOTTARI_HOME}' + '\\\\docs\\\\x.html' + '\\"';
  assert.equal(expand(text, LNX), '\\"/home/example/docs/x.html\\"');
  const doc = JSON.stringify({ allow: ['Bash(cat "' + '${BOTTARI_HOME}' + '\\\\docs\\\\x.html")'] });
  assert.doesNotThrow(() => JSON.parse(expand(doc, LNX)));
});

// ---------- claude settings ----------

const SETTINGS_FIXTURE = {
  model: 'opus',
  permissions: {
    allow: ['Bash(node:*)', 'Read(C:/Users/example/Documents/**)', 'Read(d:/Data/**)'],
    additionalDirectories: ['C:\\other-drive-place'],
  },
  statusLine: { type: 'command', command: '~/.claude/statusline-command.sh' },
};

test('settings: neutral parts shared, machine paths stay home', async () => {
  const { shared, overlay } = await settings.pack(B(SETTINGS_FIXTURE), WIN);
  const s = JSON.parse(shared.toString());
  assert.deepEqual(s.permissions.allow, ['Bash(node:*)', 'Read(${BOTTARI_HOME}/Documents/**)']);
  assert.deepEqual(overlay.permissions.allow, ['Read(d:/Data/**)']);
  assert.deepEqual(overlay.permissions.additionalDirectories, ['C:\\other-drive-place']);
  assert.equal(s.statusLine.command, '~/.claude/statusline-command.sh');
  assert.ok(!shared.toString().includes('d:/Data'));
});

test('settings: same-machine roundtrip loses nothing', async () => {
  const { shared, overlay } = await settings.pack(B(SETTINGS_FIXTURE), WIN);
  const back = JSON.parse((await settings.unpack(shared, { overlay, ctx: WIN })).toString());
  assert.deepEqual(back, SETTINGS_FIXTURE);
});

test('settings: on the other OS, shared expands and foreign drives never arrive', async () => {
  const { shared } = await settings.pack(B(SETTINGS_FIXTURE), WIN);
  const back = JSON.parse((await settings.unpack(shared, { overlay: null, ctx: LNX })).toString());
  assert.deepEqual(back.permissions.allow, ['Bash(node:*)', 'Read(/home/example/Documents/**)']);
  assert.ok(!JSON.stringify(back).includes('d:/Data'));
});

// ---------- ~/.claude.json ----------

const CLAUDE_JSON_FIXTURE = {
  machineID: 'not-yours-to-share',
  cachedExperimentData: { big: 'junk' },
  mcpServers: {
    'api-server': {
      type: 'http',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer abcdefghijklmnop12345678' },
    },
    'win-tool': { command: 'C:\\Users\\example\\tools\\thing.exe', args: ['mcp'] },
    foreign: { command: 'D:\\somewhere\\x.exe', args: [] },
  },
};

test('claude.json: only mcpServers is shared; secrets and identity never', async () => {
  const { shared, overlay } = await claudeJson.pack(B(CLAUDE_JSON_FIXTURE), WIN);
  const text = shared.toString();
  const s = JSON.parse(text);
  assert.deepEqual(Object.keys(s), ['mcpServers']);
  assert.ok(!text.includes('machineID') && !text.includes('not-yours-to-share'));
  assert.ok(!text.includes('Bearer abcdefghijklmnop'), 'the token itself must not be in shared');
  assert.equal(s.mcpServers['api-server'].headers.Authorization, '${BOTTARI_SECRET:api-server-authorization}');
  assert.deepEqual(s.mcpServers['win-tool']._bottari, { os: ['win32'] });
  assert.equal(s.mcpServers['win-tool'].command, '${BOTTARI_HOME}\\tools\\thing.exe');
  assert.deepEqual(Object.keys(overlay.mcpServers), ['foreign']); // D:\ = this machine only
});

test('claude.json: restore refills secrets, skips foreign-OS servers, keeps live keys', async () => {
  const { shared } = await claudeJson.pack(B(CLAUDE_JSON_FIXTURE), WIN);
  const live = { numStartups: 42, mcpServers: { old: { command: 'x' } } };
  const back = JSON.parse(
    (await claudeJson.unpack(shared, { overlay: null, ctx: LNX, currentRaw: B(live) })).toString(),
  );
  assert.equal(back.numStartups, 42, 'live keys outside mcpServers survive');
  assert.ok(!('win-tool' in back.mcpServers), 'a win32-only server must not land on linux');
  // the secret was stored during pack (file keychain) and comes back
  assert.equal(back.mcpServers['api-server'].headers.Authorization, 'Bearer abcdefghijklmnop12345678');
  assert.ok(!('_bottari' in back.mcpServers['api-server']));
});

// ---------- codex config.toml ----------

const CODEX_FIXTURE = [
  'model = "gpt-5"',
  'notify = true',
  '',
  "[projects.'c:\\users\\example\\proj-one']",
  'trust_level = "trusted"',
  '',
  '[windows]',
  'sandbox = "on"',
  '',
  '[mcp_servers.local]',
  'command = "node"',
  'args = ["server.js"]',
  '',
  "[external.tool]",
  'path = "D:\\\\tools\\\\ext"',
].join('\n');

test('codex config: windows/foreign sections stay home, the rest shrinks', async () => {
  const { shared, overlay } = await codexConfig.pack(B(CODEX_FIXTURE), WIN);
  const text = shared.toString();
  assert.ok(text.includes("[projects.'${BOTTARI_HOME}\\proj-one']"));
  assert.ok(!text.includes('[windows]') && !text.includes('D:'));
  assert.equal(overlay.sections.length, 2);
  assert.ok(overlay.sections[0].startsWith('[windows]'));
  assert.ok(overlay.sections[1].includes('D:\\\\tools\\\\ext'));
});

test('codex config: same-machine roundtrip is stable (pack∘unpack∘pack fixed point)', async () => {
  const p1 = await codexConfig.pack(B(CODEX_FIXTURE), WIN);
  const restored = await codexConfig.unpack(p1.shared, { overlay: p1.overlay, ctx: WIN });
  assert.ok(restored.toString().includes('[windows]'), 'overlay sections came back');
  const p2 = await codexConfig.pack(restored, WIN);
  assert.equal(p1.shared.toString(), p2.shared.toString());
  assert.deepEqual(p1.overlay, p2.overlay);
});

// The real incident: a Windows path came back as '//C:\...' and a second
// placeholder survived unexpanded, which made codex refuse to start its
// node_repl MCP server (os error 123, invalid path).
test('a home path survives a Windows -> Linux -> Windows round trip intact', async () => {
  const original = "cache_dir = 'C:\\Users\\example\\.codex\\cache'";
  const { shared } = await codexConfig.pack(Buffer.from(original), WIN);
  assert.ok(!shared.toString().includes('C:'), 'the drive path must be shrunk');

  // land on Linux, pack again there, come home
  const onLinux = (await codexConfig.unpack(shared, { overlay: null, ctx: LNX })).toString();
  assert.equal(onLinux.trim(), "cache_dir = '/home/example/.codex/cache'");
  const { shared: fromLinux } = await codexConfig.pack(Buffer.from(onLinux), LNX);
  const backHome = (await codexConfig.unpack(fromLinux, { overlay: null, ctx: WIN })).toString();

  assert.equal(backHome.trim(), original.trim(), 'the round trip must not alter the path');
  assert.ok(!backHome.includes('//'), 'no stray separator may be introduced');
});

test('a PATH-style list expands every placeholder, not just the first', () => {
  const list = "P = '${BOTTARI_HOME}\\.codex;${BOTTARI_HOME}\\AppData\\Local'";
  const out = expand(list, { ...WIN, style: 'backslash' });
  assert.ok(!out.includes('${BOTTARI_'), `a placeholder survived: ${out}`);
  assert.equal(out, "P = 'C:\\Users\\example\\.codex;C:\\Users\\example\\AppData\\Local'");
});

// The real incident: a shared hooks.state table expanded into the exact
// table this machine already had in its overlay, and codex refused the
// file with "duplicate key".
test('codex config: a shared section that expands onto an overlay one is dropped', async () => {
  const shared = Buffer.from([
    "[hooks.state.'${BOTTARI_HOME}/.codex/hooks.json:stop:0:0']",
    'trusted_hash = "sha256:aaa"',
  ].join('\n'));
  const overlay = {
    root: [],
    sections: ["[hooks.state.'/home/example/.codex/hooks.json:stop:0:0']\ntrusted_hash = \"sha256:bbb\""],
  };
  const out = (await codexConfig.unpack(shared, { overlay, ctx: LNX })).toString();
  const headers = out.split('\n').filter((l) => l.startsWith('[hooks.state'));
  assert.equal(headers.length, 1, `the table must appear once, got:\n${out}`);
  assert.ok(out.includes('sha256:bbb'), "this machine's own value wins");
});

test('codex config: a root key held in the overlay is not duplicated by the shared half', async () => {
  const shared = Buffer.from('model = "shared"\nnotify = ["from-shared"]');
  const overlay = { root: ['notify = ["from-this-machine"]'], sections: [] };
  const out = (await codexConfig.unpack(shared, { overlay, ctx: LNX })).toString();
  assert.equal(out.split('\n').filter((l) => l.startsWith('notify')).length, 1);
  assert.ok(out.includes('from-this-machine') && !out.includes('from-shared'));
  assert.ok(out.includes('model = "shared"'), 'unrelated shared keys survive');
});

test('codex config: a section naming an OS-specific binary stays machine-local', async () => {
  const fixture = [
    '[mcp_servers.node_repl]',
    "command = 'C:\\Users\\example\\AppData\\Local\\App\\bin\\node_repl.exe'",
    '',
    '[mcp_servers.portable]',
    'command = "node"',
  ].join('\n');
  const { shared, overlay } = await codexConfig.pack(Buffer.from(fixture), WIN);
  assert.ok(!shared.toString().includes('node_repl'), 'the .exe server must not be shared');
  assert.ok(shared.toString().includes('mcp_servers.portable'), 'the portable one still is');
  assert.ok(overlay.sections.some((s) => s.includes('node_repl')));
  // and it comes back on the machine that owns it
  const restored = (await codexConfig.unpack(shared, { overlay, ctx: WIN })).toString();
  assert.ok(restored.includes('node_repl.exe'));
});

test('codex config: on linux the shared half expands with slashes, no windows section', async () => {
  const { shared } = await codexConfig.pack(B(CODEX_FIXTURE), WIN);
  const text = (await codexConfig.unpack(shared, { overlay: null, ctx: LNX })).toString();
  assert.ok(text.includes("[projects.'/home/example/proj-one']"));
  assert.ok(!text.includes('[windows]'));
  assert.ok(text.startsWith('model = "gpt-5"'), 'root keys stay before the first table');
});
