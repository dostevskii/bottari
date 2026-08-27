#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
import { run } from '../src/cli/index.js';

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (e) {
  process.stderr.write('오류: ' + (e?.message ?? String(e)) + '\n');
  process.exitCode = 1;
}
