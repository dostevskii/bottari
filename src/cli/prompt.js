// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Every prompt here can be fed EOF instead of an answer (a pipe, a
// harness, a closed terminal). That must be a clear error, not a process
// that silently evaporates mid-question.

import readline from 'node:readline';

const NO_TTY = '입력을 받을 수 없는 환경입니다. 실제 터미널 창에서 직접 실행해주세요.';

export function ask(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
    rl.on('close', () => {
      if (!answered) reject(new Error(NO_TTY));
    });
  });
}

// No echo: the passphrase never appears on screen or in scrollback.
export function askHidden(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stderr, terminal: true,
    });
    process.stderr.write(question);
    rl._writeToOutput = () => {};
    let answered = false;
    rl.question('', (answer) => {
      answered = true;
      rl.close();
      process.stderr.write('\n');
      resolve(answer);
    });
    rl.on('close', () => {
      if (!answered) reject(new Error(NO_TTY));
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
