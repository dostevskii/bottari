// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// First-run wizard. Signs in, looks at the cloud, and lays out what will
// happen — flow A (this machine's data goes up for the first time) or
// flow B (the cloud already has a bundle; merge this machine with it).

import { openCloud, obtainDek } from './context.js';
import { performSync } from './sync.js';
import { askChoice } from './prompt.js';
import { log } from '../util/log.js';

export default async function init(args) {
  const rememberKey = args.includes('--remember-key');
  const yes = args.includes('--yes'); // scripted runs cannot answer prompts
  log.out('bottari 시작 — Google Drive에 로그인합니다.');
  const ctx = await openCloud();

  if (!ctx.meta) {
    log.out('');
    log.out('클라우드에 보따리가 없습니다. 처음 시작하시는군요.');
    log.out('이 컴퓨터의 스킬·설정을 정리하고 암호화해서 내 Google Drive의');
    log.out('bottari 폴더에 올립니다. 평문은 클라우드에 올라가지 않습니다.');
    if (!yes) {
      const go = await askChoice('진행할까요?', [
        { key: 'y', label: '올린다' },
        { key: 'n', label: '그만둔다' },
      ]);
      if (go === 'n') return 0;
    }
  } else {
    log.out('');
    log.out(`클라우드에 이미 보따리가 있습니다 (세대 ${ctx.meta.head}).`);
    log.out('내려받아 이 컴퓨터와 비교·병합한 뒤, 결과를 다시 올립니다.');
    log.out('한쪽에만 있는 것은 무조건 보존됩니다 — 지워지는 일은 없습니다.');
    if (!yes) {
      const go = await askChoice('진행할까요?', [
        { key: 'y', label: '동기화한다' },
        { key: 'n', label: '그만둔다' },
      ]);
      if (go === 'n') return 0;
    }
  }

  const dek = await obtainDek(ctx, { rememberKey });
  await performSync(ctx, dek, {});
  log.out('');
  log.out('다음부터는 `bottari sync` 하나로 같은 일을 합니다.');
  return 0;
}
