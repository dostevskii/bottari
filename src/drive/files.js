// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// File-level Drive operations on top of drive/client.js. Everything is
// scoped to what drive.file can see: files this app created.

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,size,mimeType,modifiedTime';

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function makeFiles(client) {
  async function findChild(name, parentId) {
    const q = [
      `name = '${esc(name)}'`,
      `'${parentId ?? 'root'}' in parents`,
      'trashed = false',
    ].join(' and ');
    const res = await client.request('/files', { query: { q, fields: `files(${FIELDS})`, pageSize: 2 } });
    return res.files[0] ?? null;
  }

  async function ensureFolder(name, parentId) {
    const existing = await findChild(name, parentId);
    if (existing) {
      if (existing.mimeType !== FOLDER_MIME) {
        throw new Error(`Drive에 '${name}' 이(가) 폴더가 아닌 파일로 존재합니다. 옮기거나 지운 뒤 다시 시도하세요.`);
      }
      return existing.id;
    }
    const created = await client.request('/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : [] }),
      query: { fields: 'id' },
    });
    return created.id;
  }

  async function list(parentId, { pageSize = 1000 } = {}) {
    const out = [];
    let pageToken;
    do {
      const res = await client.request('/files', {
        query: {
          q: `'${parentId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${FIELDS})`,
          pageSize,
          pageToken,
        },
      });
      out.push(...res.files);
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  // Multipart create-or-update for anything comfortably held in memory
  // (metadata, manifests, sealed chunks up to 8MB). fileId updates in place.
  async function uploadSmall({ name, parentId, data, fileId, mimeType = 'application/octet-stream' }) {
    const boundary = 'bottari-' + Math.random().toString(36).slice(2);
    const meta = fileId ? { name } : { name, parents: parentId ? [parentId] : [] };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const path = fileId ? `/files/${fileId}` : '/files';
    const res = await client.request(path, {
      method: fileId ? 'PATCH' : 'POST',
      upload: true,
      query: { uploadType: 'multipart', fields: 'id,name,size' },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res;
  }

  async function download(fileId) {
    const res = await client.request(`/files/${fileId}`, { query: { alt: 'media' }, raw: true });
    return Buffer.from(await res.arrayBuffer());
  }

  async function remove(fileId) {
    await client.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  return { findChild, ensureFolder, list, uploadSmall, download, remove };
}
