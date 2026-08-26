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
      log.out('등록된 프로젝트 폴더가 없습니다. `bottari projects add <경로>` 로 추가하세요.');
      return 0;
    }
    for (const [slug, root] of entries) {
      const exists = fs.existsSync(root);
      log.out(`  ${slug.padEnd(20)} ${root}${exists ? '' : '   (이 컴퓨터에 폴더 없음)'}`);
    }
    return 0;
  }

  if (sub === 'add' && rest[0]) {
    const root = path.resolve(rest[0]);
    const nameIdx = rest.indexOf('--name');
    const slug = slugify(nameIdx >= 0 && rest[nameIdx + 1] ? rest[nameIdx + 1] : path.basename(root));
    if (!slug) {
      log.error('폴더 이름에서 쓸 만한 이름을 만들지 못했습니다. --name 으로 지정하세요.');
      return 1;
    }
    let st;
    try {
      st = fs.statSync(root);
    } catch {
      log.error(`폴더가 없습니다: ${root}`);
      return 1;
    }
    if (!st.isDirectory()) {
      log.error(`폴더가 아닙니다: ${root}`);
      return 1;
    }
    if (config.projects[slug] && config.projects[slug] !== root) {
      log.error(`'${slug}' 은 이미 다른 경로로 등록되어 있습니다: ${config.projects[slug]}`);
      return 1;
    }
    config.projects[slug] = root;
    saveConfig(config);
    log.out(`등록했습니다: ${slug} → ${root}`);
    log.out('node_modules, .git, dist 같은 재생성 폴더는 자동으로 제외됩니다.');
    log.out('다른 컴퓨터에서는 그쪽 경로로 `bottari projects add <경로> --name ' + slug + '` 하면 이어집니다.');
    return 0;
  }

  if (sub === 'remove' && rest[0]) {
    if (!(rest[0] in config.projects)) {
      log.error(`등록되어 있지 않습니다: ${rest[0]}`);
      return 1;
    }
    delete config.projects[rest[0]];
    saveConfig(config);
    log.out(`등록을 해제했습니다: ${rest[0]} (폴더와 클라우드의 데이터는 그대로 둡니다)`);
    return 0;
  }

  log.error('사용법: bottari projects [list | add <경로> [--name 이름] | remove <이름>]');
  return 1;
}
