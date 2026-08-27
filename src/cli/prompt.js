// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Every prompt here can be fed EOF instead of an answer (a pipe, a
// harness, a closed terminal). That must be a clear error, not a process
// that silently evaporates mid-question.

import readline from 'node:readline';

const NO_TTY = 'This command needs an interactive terminal. Run it in a real terminal window.';

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

// Masked input on raw mode: readline's muted-output trick proved
// unreliable on Windows terminals, and typing deserves feedback — every
// character echoes as '*', backspace works. Control keys are compared by
// code point so no invisible characters live in this source file.
const CR = 13;
const LF = 10;
const CTRL_C = 3;
const BS = 8;
const DEL = 127;

export function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error(NO_TTY));
      return;
    }
    process.stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    };
    const onData = (chunk) => {
      for (const ch of chunk.toString('utf8')) {
        const code = ch.codePointAt(0);
        if (code === CR || code === LF) {
          cleanup();
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (code === CTRL_C) {
          cleanup();
          process.stderr.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (code === BS || code === DEL) {
          if (value.length) {
            value = value.slice(0, -1);
            process.stderr.write('\b \b');
          }
          continue;
        }
        if (code < 32) continue; // other control characters
        value += ch;
        process.stderr.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

export async function askChoice(question, choices) {
  for (;;) {
    const menu = choices.map((c) => `  [${c.key}] ${c.label}`).join('\n');
    const a = await ask(`${question}\n${menu}\n> `);
    const hit = choices.find((c) => c.key === a);
    if (hit) return hit.key;
    process.stderr.write('Not one of the options. Pick again.\n');
  }
}
