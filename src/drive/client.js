// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// One fetch wrapper for the Drive v3 REST API: injects the access token,
// retries a 401 once after a token refresh, and backs off exponentially on
// 429/5xx. Injectable token source and fetch for tests.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeClient({ getAccessToken, fetchImpl = fetch, maxTries = 4 }) {
  // upload:true routes to the upload endpoint; raw:true returns the
  // Response for the caller to stream/buffer itself.
  async function request(path, {
    method = 'GET', query, headers = {}, body, upload = false, raw = false,
  } = {}) {
    const base = upload ? UPLOAD : API;
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      const token = await getAccessToken();
      const res = await fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...headers },
        body,
      });
      if (res.ok) return raw ? res : (res.status === 204 ? null : res.json());

      if (res.status === 401 && !refreshed) {
        refreshed = true; // the store re-derives on expiry; one retry only
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxTries) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`Drive API ${method} ${path} 실패 (${res.status}): ${text.slice(0, 300)}`);
    }
  }

  return { request };
}
