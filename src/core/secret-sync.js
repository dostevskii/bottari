// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>
//
// Opt-in syncing of the MCP credentials that transforms split out of the
// configs (the ${BOTTARI_SECRET:name} values). Off by default: with it
// off, a credential exists only in the credential store of the machine
// that owns it, and no amount of cloud access reaches it. Turning it on
// trades that for not retyping a token on every machine — the passphrase
// then guards the tokens too, so it is a real widening of what one
// leaked passphrase costs.
//
// Only the 'secret:' namespace travels. bottari's own Google sign-in and
// the data key itself are deliberately not in it: shipping the key that
// decrypts the store into the store would make the encryption a
// formality.

import { listSecretNames, getSecret, setSecret } from '../keychain/index.js';
import { loadConfig, saveConfig } from '../model/config.js';
import { seal, unseal } from '../crypto/envelope.js';
import { log } from '../util/log.js';

const FILE = 'secrets.enc';
const NS = 'secret:';

export function isEnabled() {
  return loadConfig().syncSecrets === true;
}

export function setEnabled(on) {
  const config = loadConfig();
  config.syncSecrets = on === true;
  saveConfig(config);
}

// Never let anything outside the MCP namespace near the cloud copy.
const shareable = (name) => !name.startsWith('bottari-') && name !== 'google-refresh-token';

async function readRemote(store, files, dek) {
  const f = await files.findChild(FILE, store.rootId);
  if (!f) return { entries: {}, fileId: null };
  try {
    const plain = unseal(await files.download(f.id), dek).plain;
    return { entries: JSON.parse(plain.toString('utf8')), fileId: f.id };
  } catch (e) {
    log.warn(`the shared secrets file could not be opened (${e.message}); leaving it alone`);
    return { entries: null, fileId: f.id };
  }
}

// Fill in what this machine is missing. A value already held locally is
// never overwritten: a machine may legitimately use its own token.
export async function pull(store, files, dek) {
  const { entries } = await readRemote(store, files, dek);
  if (!entries) return { added: [] };
  const added = [];
  for (const [name, value] of Object.entries(entries)) {
    if (!shareable(name)) continue;
    if ((await getSecret(NS + name)) != null) continue;
    await setSecret(NS + name, value);
    added.push(name);
  }
  if (added.length) log.info(`filled in ${added.length} secret(s) from the bundle: ${added.join(', ')}`);
  return { added };
}

// Publish this machine's secrets, keeping any the cloud has that this
// machine does not — the same union rule the rest of bottari follows.
export async function push(store, files, dek) {
  const { entries: remote, fileId } = await readRemote(store, files, dek);
  if (remote === null) return { pushed: 0 }; // unreadable: do not clobber
  const merged = { ...remote };
  let changed = 0;
  for (const name of listSecretNames()) {
    if (!shareable(name)) continue;
    const value = await getSecret(NS + name);
    if (value == null || merged[name] === value) continue;
    merged[name] = value;
    changed++;
  }
  if (!changed) return { pushed: 0 };
  const sealed = seal(Buffer.from(JSON.stringify(merged), 'utf8'), dek, { gzip: true });
  await (files.upload ?? files.uploadSmall)({
    name: FILE, parentId: store.rootId, fileId: fileId ?? undefined, data: sealed,
  });
  return { pushed: changed };
}

// A freshly received secret is useless until the config that references
// it is written again — the file on disk still holds the placeholder,
// and it will not be downloaded again on its own because the shared half
// did not change. Rebuild the tier B files from the current generation:
// same shared content, this machine's overlay, and now the real values.
async function refillConfigs(store, dek, meta) {
  const [{ getManifestById, listObjects }, { parseManifest }, { unseal },
    { fetchEntry, materialize }, { tierBSources }, { machineContext }] = await Promise.all([
    import('./generation.js'), import('../model/manifest.js'), import('../crypto/envelope.js'),
    import('./restore.js'), import('../paths/mapping.js'), import('../transform/index.js'),
  ]);
  if (!meta?.headManifestId) return 0;
  const manifest = parseManifest(unseal(await getManifestById(store, meta.headManifestId), dek).plain);
  const index = await listObjects(store);
  const ctx = machineContext();
  let rebuilt = 0;
  for (const src of tierBSources()) {
    const entry = manifest.entries[src.logical];
    if (!entry) continue;
    const buf = await fetchEntry(store, dek, entry, index, src.logical);
    if (await materialize(src.logical, entry, buf, { ctx })) rebuilt++;
  }
  return rebuilt;
}

export async function syncSecrets(store, files, dek, meta) {
  if (!isEnabled()) return null;
  const { added } = await pull(store, files, dek);
  const { pushed } = await push(store, files, dek);
  let rebuilt = 0;
  if (added.length) {
    try {
      rebuilt = await refillConfigs(store, dek, meta);
    } catch (e) {
      log.warn(`could not rewrite the configs with the new secrets (${e.message}); ` +
        'the next sync will do it');
    }
  }
  return { added: added.length, pushed, rebuilt };
}
