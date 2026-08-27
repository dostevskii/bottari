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
        throw new Error(`'${name}' exists on Drive as a file, not a folder. Move or delete it and retry.`);
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

  // Drive's multipart endpoint caps the payload at 5MB; anything bigger
  // goes through a resumable session: initiate, PUT the bytes, and if the
  // PUT dies mid-flight ask the session where it stopped (308 + Range)
  // and send the remainder.
  async function uploadResumable({ name, parentId, data, fileId, mimeType = 'application/octet-stream' }) {
    const meta = fileId ? { name } : { name, parents: parentId ? [parentId] : [] };
    const init = await client.request(fileId ? `/files/${fileId}` : '/files', {
      method: fileId ? 'PATCH' : 'POST',
      upload: true,
      raw: true,
      query: { uploadType: 'resumable', fields: 'id,name,size' },
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(data.length),
      },
      body: JSON.stringify(meta),
    });
    const session = init.headers.get('location');
    if (!session) throw new Error('No resumable session address received');

    const putFrom = (offset) => client.rawFetch(session, {
      method: 'PUT',
      headers: {
        'Content-Length': String(data.length - offset),
        ...(offset > 0
          ? { 'Content-Range': `bytes ${offset}-${data.length - 1}/${data.length}` }
          : {}),
      },
      body: offset > 0 ? data.subarray(offset) : data,
    });

    let res = await putFrom(0);
    if (!res.ok && res.status !== 308) {
      // where did it stop? ask the session, then send the rest once
      const probe = await client.rawFetch(session, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${data.length}`, 'Content-Length': '0' },
      });
      if (probe.status === 308) {
        const range = probe.headers.get('range'); // "bytes=0-N"
        const offset = range ? Number(range.split('-')[1]) + 1 : 0;
        res = await putFrom(offset);
      }
    }
    if (!res.ok) {
      throw new Error(`Resumable upload failed (${res.status})`);
    }
    return res.json();
  }

  async function download(fileId) {
    const res = await client.request(`/files/${fileId}`, { query: { alt: 'media' }, raw: true });
    return Buffer.from(await res.arrayBuffer());
  }

  async function remove(fileId) {
    await client.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  // multipart under the 5MB endpoint cap, resumable above it
  async function upload(args) {
    return args.data.length > 4 * 1024 * 1024
      ? uploadResumable(args)
      : uploadSmall(args);
  }

  return { findChild, ensureFolder, list, uploadSmall, uploadResumable, upload, download, remove };
}
