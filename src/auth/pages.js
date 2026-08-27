// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The pages a browser lands on after the Google sign-in. Built from the
// Figma design (1440x1024 frame): a dark card holding a status dot, a
// title and one line of instruction, the wordmark below it, a licence
// footer.
//
// Nothing is loaded from anywhere. No stylesheet, no font file, no image
// URL — a security tool must not phone home on the very page that just
// handled a credential. Inter ships inside the repository (SIL OFL 1.1,
// which permits redistribution; see assets/Inter-OFL.txt) and is inlined
// as a data URI, so the design renders identically everywhere without a
// single request leaving the machine. A test asserts the markup contains
// no http(s) URL at all, which is why the inline SVG carries no xmlns.
//
// Sizes are em-based off one clamped root so the card keeps the design's
// proportions at any window size; 1em == 20px reproduces the Figma frame.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDMARK } from './wordmark.js';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

// Inter is a variable font: one file covers every weight the design uses.
// Missing or unreadable, the page still renders in the nearest system
// grotesque — a font is never worth failing a sign-in over.
function fontFace() {
  try {
    const woff2 = fs.readFileSync(path.join(ASSETS, 'Inter.woff2')).toString('base64');
    return `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;` +
      `font-display:block;src:url(data:font/woff2;base64,${woff2}) format('woff2');}`;
  } catch {
    return '';
  }
}

const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
  "'Helvetica Neue', Arial, sans-serif";

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: #fff;
    color: #242424;
    font-family: ${FONT_STACK};
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
  }
  .middle {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(56px, 14vh, 165px);
  }
  .card {
    font-size: clamp(8px, 1.45vw, 20px);
    max-width: 100%;
    background: #242424;
    border-radius: 0.95em;
    padding: 1.65em var(--pad) 2.1em;
    display: flex;
    flex-direction: column;
  }
  .row { display: flex; align-items: center; gap: 0.836em; }
  .dot {
    flex: none;
    width: 2em;
    height: 2em;
    border-radius: 50%;
    /* sits on the cap-height centre of the title, not its line box */
    margin-top: 0.3em;
  }
  h1 {
    margin: 0;
    font-size: 3.45em;
    font-weight: 600;
    line-height: 1.217;
    letter-spacing: -0.02em;
    color: #f2f2f2;
  }
  .sub {
    /* clears the dot column: (2em dot + 1.286em offset) measured in this
       element's own larger em, i.e. 65.72px / 36px */
    margin: 0.722em 0 0 1.826em;
    font-size: 1.8em;
    font-weight: 400;
    line-height: 1.222;
    color: #ececec;
  }
  .wordmark {
    width: clamp(120px, 13.5vw, 194px);
    height: auto;
    display: block;
    color: #231f20;
  }
  footer {
    font-size: 12px;
    line-height: 1.25;
    text-align: center;
    color: #000;
    padding-bottom: 2vh;
  }
  footer a { color: inherit; }
`;

// title/sub are plain text from this file only — never anything a request
// carried in, so there is nothing to escape here.
function page({ title, sub, dot, pad }) {
  return '<!doctype html>' +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>bottari — ${title}</title>` +
    `<style>${fontFace()}${STYLE}</style></head><body><div class="page">` +
    '<div class="middle">' +
    `<main class="card" style="--pad:${pad}">` +
    `<div class="row"><span class="dot" style="background:${dot}"></span><h1>${title}</h1></div>` +
    `<p class="sub">${sub}</p>` +
    '</main>' +
    `<div class="wordmark">${WORDMARK}</div>` +
    '</div>' +
    '<footer>GPL-3.0-only · Copyright (C) 2026 JUNG HWANGBO &lt;' +
    '<a href="mailto:dostevskii@gmail.com">dostevskii@gmail.com</a>&gt;</footer>' +
    '</div></body></html>';
}

// Built on first use: the pages are only needed during a sign-in, and
// each one carries the ~64KB inlined font.
let ok = null;
let denied = null;

export function pageOk() {
  ok ??= page({
    title: 'Signed in',
    sub: 'You can close this tab and return to the terminal.',
    dot: '#69E26F',
    pad: '2.84em',
  });
  return ok;
}

export function pageDenied() {
  denied ??= page({
    title: 'Sign-in refused',
    sub: 'Please try again in the terminal.',
    dot: '#C93B3B',
    pad: '5.476em',
  });
  return denied;
}
