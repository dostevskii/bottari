// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Project folders are opt-in: the user names each one. The slug is what
// machines share; the path is this machine's business alone.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig } from '../model/config.js';
import { log } from '../util/log.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣._-]+/g, '-').replace(/^-+|-+$/g, '');

export default async function projects(args) {
  const [sub, ...rest] = args;
  const config = loadConfig();

  if (sub === 'list' || !sub) {
    const entries = Object.entries(config.projects);
    if (!entries.length) {
      log.out('No project folders registered. Add one with `bottari projects add <path>`.');
      return 0;
    }
    for (const [slug, root] of entries) {
      const exists = fs.existsSync(root);
      log.out(`  ${slug.padEnd(20)} ${root}${exists ? '' : '   (folder missing on this machine)'}`);
    }
    return 0;
  }

  if (sub === 'add' && rest[0]) {
    const root = path.resolve(rest[0]);
    const nameIdx = rest.indexOf('--name');
    const slug = slugify(nameIdx >= 0 && rest[nameIdx + 1] ? rest[nameIdx + 1] : path.basename(root));
    if (!slug) {
      log.error('Could not derive a usable name from the folder. Pass one with --name.');
      return 1;
    }
    let st;
    try {
      st = fs.statSync(root);
    } catch {
      log.error(`No such folder: ${root}`);
      return 1;
    }
    if (!st.isDirectory()) {
      log.error(`Not a folder: ${root}`);
      return 1;
    }
    if (config.projects[slug] && config.projects[slug] !== root) {
      log.error(`'${slug}' is already registered for a different path: ${config.projects[slug]}`);
      return 1;
    }
    config.projects[slug] = root;
    saveConfig(config);
    log.out(`registered: ${slug} -> ${root}`);
    log.out('Regenerable folders (node_modules, .git, dist, ...) are excluded automatically.');
    log.out('On another machine, run `bottari projects add <its-path> --name ' + slug + '` to link up.');
    return 0;
  }

  if (sub === 'remove' && rest[0]) {
    if (!(rest[0] in config.projects)) {
      log.error(`Not registered: ${rest[0]}`);
      return 1;
    }
    delete config.projects[rest[0]];
    saveConfig(config);
    log.out(`unregistered: ${rest[0]} (the folder and its cloud data stay as they are)`);
    return 0;
  }

  log.error('usage: bottari projects [list | add <path> [--name name] | remove <name>]');
  return 1;
}
