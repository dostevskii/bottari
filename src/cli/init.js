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
  log.out('bottari — signing in to Google Drive.');
  const ctx = await openCloud();

  if (!ctx.meta) {
    log.out('');
    log.out('No bundle in the cloud yet — this is a first start.');
    log.out('This machine\'s skills and settings will be packed, encrypted and');
    log.out('uploaded to the bottari folder of your Google Drive.');
    log.out('Nothing leaves this machine unencrypted.');
    if (!yes) {
      const go = await askChoice('Proceed?', [
        { key: 'y', label: 'upload' },
        { key: 'n', label: 'quit' },
      ]);
      if (go === 'n') return 0;
    }
  } else {
    log.out('');
    log.out(`The cloud already has a bundle (generation ${ctx.meta.head}).`);
    log.out('It will be downloaded, merged with this machine, and uploaded again.');
    log.out('Anything that exists on only one side is always kept — nothing gets deleted.');
    if (!yes) {
      const go = await askChoice('Proceed?', [
        { key: 'y', label: 'sync' },
        { key: 'n', label: 'quit' },
      ]);
      if (go === 'n') return 0;
    }
  }

  const dek = await obtainDek(ctx, { rememberKey });
  await performSync(ctx, dek, {});
  log.out('');
  log.out('From now on, `bottari sync` does all of this in one step.');
  return 0;
}
