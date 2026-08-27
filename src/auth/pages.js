// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// The pages a browser lands on after the Google sign-in. Built from the
// Figma design (1440x1024): a dark card holding a status dot, a title and
// one line of instruction, the wordmark below it, a licence footer.
//
// Two rules govern this file:
//
//   1. Nothing is loaded from anywhere. No stylesheet, no font file, no
//      image URL — a security tool must not phone home on the very page
//      that just handled a credential. A test asserts the markup contains
//      no http(s) URL at all, which is why the inline SVG carries no xmlns.
//   2. No font binary ships with bottari. The design uses Switzer, whose
//      licence forbids redistribution through a repository, and bottari is
//      GPL-3.0 source on a public host. So Switzer is named first and used
//      when the viewer has it installed; everyone else gets the nearest
//      grotesque their system already has.
//
// Sizes are em-based off one clamped root so the card keeps the design's
// proportions at any window size; 1em == 20px reproduces the Figma frame.

import { WORDMARK } from './wordmark.js';

const FONT_STACK =
  "'Switzer', 'Switzer Variable', -apple-system, BlinkMacSystemFont, " +
  "'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif";

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
    padding: 1.5em 2.4em 1.9em;
    display: flex;
    flex-direction: column;
  }
  .row { display: flex; align-items: center; gap: 1.286em; }
  .dot {
    flex: none;
    width: 2em;
    height: 2em;
    border-radius: 50%;
  }
  h1 {
    margin: 0;
    font-size: 3.45em;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: #f2f2f2;
  }
  .sub {
    /* indented to clear the dot column: (2em dot + 1.286em gap) measured
       in this element's own larger em, i.e. 3.286 / 1.8 */
    margin: 0.85em 0 0 1.826em;
    font-size: 1.8em;
    font-weight: 400;
    line-height: 1.2;
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
    line-height: 1.4;
    text-align: center;
    color: #000;
    padding-bottom: 2vh;
  }
  footer a { color: inherit; }
  @media (prefers-color-scheme: dark) {
    body { background: #fff; }
  }
`;

// title/sub are plain text from this file only — never anything a request
// carried in, so there is nothing to escape here.
function page({ title, sub, dot }) {
  return '<!doctype html>' +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>bottari — ${title}</title>` +
    `<style>${STYLE}</style></head><body><div class="page">` +
    '<div class="middle">' +
    '<main class="card">' +
    `<div class="row"><span class="dot" style="background:${dot}"></span><h1>${title}</h1></div>` +
    `<p class="sub">${sub}</p>` +
    '</main>' +
    `<div class="wordmark">${WORDMARK}</div>` +
    '</div>' +
    '<footer>GPL-3.0-only · Copyright (C) 2026 JUNG HWANGBO &lt;' +
    '<a href="mailto:dostevskii@gmail.com">dostevskii@gmail.com</a>&gt;</footer>' +
    '</div></body></html>';
}

export const PAGE_OK = page({
  title: 'Signed in',
  sub: 'You can close this tab and return to the terminal.',
  dot: '#69E26F',
});

export const PAGE_DENIED = page({
  title: 'Sign-in refused',
  sub: 'Please try again in the terminal.',
  dot: '#C93B3B',
});
