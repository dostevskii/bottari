// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// A moving bar is how a user tells "working" from "dead". Long phases
// (hashing, uploading, downloading) report what they are doing, how far
// along they are, and roughly how long is left.
//
//   upload   [=============>          ]  56%  84.2/150.1 MB  ~2m10s left
//
// On a TTY the line redraws in place (throttled); piped output gets one
// plain line per 25% instead. Below `min` total bytes no bar appears at
// all — flashing a bar for a 3KB sync is noise, not information.

const human = (b) =>
  b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB'
  : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB'
  : Math.ceil(b / 1e3) + ' KB';

const NOOP = { tick() {}, finish() {} };

export function makeBar(label, total, { min = 0, out = process.stderr } = {}) {
  if (!total || total < min) return NOOP;
  const tty = out.isTTY === true;
  const start = Date.now();
  let done = 0;
  let lastDraw = 0;
  let lastStep = -1;
  let finished = false;

  const eta = () => {
    const elapsed = (Date.now() - start) / 1000;
    if (done <= 0 || elapsed < 2) return '';
    const left = (total - done) / (done / elapsed);
    if (!Number.isFinite(left) || left < 1) return '';
    const m = Math.floor(left / 60);
    const s = Math.round(left % 60);
    return '  ~' + (m > 0 ? `${m}m${s > 0 ? s + 's' : ''}` : `${s}s`) + ' left';
  };

  const draw = (force) => {
    const pct = Math.min(100, Math.floor((done / total) * 100));
    if (tty) {
      const now = Date.now();
      if (!force && now - lastDraw < 100) return;
      lastDraw = now;
      const width = 24;
      const filled = Math.min(width, Math.round((pct / 100) * width));
      const bar = '='.repeat(filled) + (filled < width ? '>' + ' '.repeat(width - filled - 1) : '');
      out.write(`\r${label.padEnd(9)}[${bar}] ${String(pct).padStart(3)}%  ` +
        `${human(done)}/${human(total)}${eta()}   `);
    } else {
      const step = Math.floor(pct / 25);
      if (step > lastStep) {
        lastStep = step;
        out.write(`${label} ${pct}% (${human(done)}/${human(total)})\n`);
      }
    }
  };

  return {
    tick(n) {
      if (finished) return;
      done += n;
      draw(false);
    },
    finish() {
      if (finished) return;
      finished = true;
      done = total;
      draw(true);
      if (tty) out.write('\n');
    },
  };
}
