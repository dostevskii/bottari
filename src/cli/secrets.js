// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The local half of ${BOTTARI_SECRET:name}: values live only in this
// machine's credential store and are refilled into configs on restore.

import { listSecretNames, getSecret, setSecret, deleteSecret, backendLabel } from '../keychain/index.js';
import { askHidden } from './prompt.js';
import { log } from '../util/log.js';

export default async function secrets(args) {
  const [sub, name] = args;
  if (sub === 'list' || !sub) {
    const names = listSecretNames();
    if (!names.length) {
      log.out('보관 중인 시크릿이 없습니다.');
      return 0;
    }
    log.out(`보관 위치: ${await backendLabel()}`);
    for (const n of names) {
      const present = (await getSecret(`secret:${n}`)) != null;
      log.out(`  ${n}${present ? '' : '   (이름만 있고 값이 없음 — set 으로 채우세요)'}`);
    }
    return 0;
  }
  if (sub === 'set' && name) {
    const value = await askHidden(`'${name}' 의 값 (입력해도 화면에 보이지 않습니다): `);
    if (!value) {
      log.error('빈 값은 저장하지 않습니다.');
      return 1;
    }
    await setSecret(`secret:${name}`, value);
    log.out(`저장했습니다: ${name}`);
    return 0;
  }
  if (sub === 'remove' && name) {
    await deleteSecret(`secret:${name}`);
    log.out(`지웠습니다: ${name}`);
    return 0;
  }
  log.error('사용법: bottari secrets [list | set <이름> | remove <이름>]');
  return 1;
}
