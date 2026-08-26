// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Results go to stdout, progress and problems to stderr, so piping bottari
// output stays clean.

const quiet = process.env.BOTTARI_QUIET === '1';

export const log = {
  out: (msg) => process.stdout.write(msg + '\n'),
  info: (msg) => { if (!quiet) process.stderr.write(msg + '\n'); },
  warn: (msg) => process.stderr.write('경고: ' + msg + '\n'),
  error: (msg) => process.stderr.write('오류: ' + msg + '\n'),
};
