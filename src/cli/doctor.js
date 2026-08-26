// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { openCloud, obtainDek } from './context.js';
import { checkStore } from '../core/maintenance.js';
import { hasRefreshToken } from '../auth/token-store.js';
import { backendLabel } from '../keychain/index.js';
import { loadPendingState } from '../core/conflicts.js';
import { log } from '../util/log.js';

export default async function doctor() {
  let bad = 0;
  const ok = (label, value = '') => log.out(`  ok    ${label}${value ? '  ' + value : ''}`);
  const fail = (label, why) => { bad++; log.out(`  문제  ${label}  ${why}`); };

  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 20) ok('Node.js', process.versions.node);
  else fail('Node.js', `${process.versions.node} — 20 이상이 필요합니다`);

  ok('시크릿 보관', await backendLabel());
  if (await hasRefreshToken()) ok('로그인', '저장된 로그인 있음');
  else fail('로그인', '없음 — `bottari login`');

  const pending = loadPendingState();
  if (pending.conflicts.length) {
    log.out(`  참고  미해소 충돌 ${pending.conflicts.length}건 — \`bottari resolve\``);
  }

  let ctx;
  try {
    ctx = await openCloud({ interactive: false });
  } catch (e) {
    fail('클라우드 접속', e.message);
    return 1;
  }
  if (!ctx.meta) {
    log.out('  참고  클라우드에 보따리가 아직 없습니다 (`bottari init` 전 상태)');
    return bad ? 1 : 0;
  }
  ok('메타', `스키마 ${ctx.meta.schema}, HEAD 세대 ${ctx.meta.head}`);

  const lock = await ctx.files.findChild('lock.json', ctx.store.rootId);
  if (lock) {
    try {
      const l = JSON.parse((await ctx.files.download(lock.id)).toString());
      if (l.expiresAt > Date.now()) log.out('  참고  다른 동기화의 잠금이 살아 있습니다');
      else log.out('  참고  만료된 잠금이 남아 있습니다 (`bottari sync --force-unlock`)');
    } catch { log.out('  참고  읽을 수 없는 잠금 파일이 있습니다'); }
  }

  const dek = await obtainDek(ctx);
  const report = await checkStore(ctx.store, ctx.meta, dek);
  if (!report.headReadable) {
    fail('HEAD 매니페스트', report.reason);
    return 1;
  }
  ok('HEAD 매니페스트', `엔트리 ${report.entryCount}개 복호·검증됨`);
  if (report.missingObjects.length) {
    fail('객체 정합성', `${report.missingObjects.length}개가 없습니다 (Drive 웹에서 지워졌을 수 있음). ` +
      '로컬에 원본이 있으면 다음 sync 가 자연 복구합니다.');
  } else {
    ok('객체 정합성', `HEAD가 참조하는 ${report.neededObjects}개 전부 존재`);
  }
  if (report.unreferencedByHead > 0) {
    log.out(`  참고  HEAD 기준 미참조 객체 ${report.unreferencedByHead}개 (이전 세대 소속 — \`bottari prune\` 대상)`);
  }
  return bad ? 1 : 0;
}
