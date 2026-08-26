// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import readline from 'node:readline';

export function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// No echo: the passphrase never appears on screen or in scrollback.
export function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stderr, terminal: true,
    });
    process.stderr.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stderr.write('\n');
      resolve(answer);
    });
  });
}

export async function askChoice(question, choices) {
  for (;;) {
    const menu = choices.map((c) => `  [${c.key}] ${c.label}`).join('\n');
    const a = await ask(`${question}\n${menu}\n선택: `);
    const hit = choices.find((c) => c.key === a);
    if (hit) return hit.key;
    process.stderr.write('그 항목은 없습니다. 다시 골라주세요.\n');
  }
}
