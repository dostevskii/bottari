# Changelog

All notable changes to this project are documented here. This project
follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-27

First release. Running daily across Windows 11, Arch Linux and macOS.

### The sync model

- **Union merge, no deletion.** Anything present on one side is always
  kept. You are asked only when the same file changed on two machines,
  and a deleted file returns rather than propagating the deletion.
- **Generations.** Every sync commits a new generation; `bottari restore
  --generation N` brings any earlier state back. `prune` reclaims space.
- **Content-addressed storage.** Identical content is stored and
  transferred once, however many generations reference it.

### What syncs

- Skills, `CLAUDE.md`, `AGENTS.md`, hooks and other assets, byte for byte.
- Settings (`settings.json`, `config.toml`, MCP server definitions) in a
  machine-neutral form: paths become placeholders, secrets move to the OS
  credential store, and OS-specific entries stay on the machine that owns
  them.
- Session history in 8 MB chunks, so an append re-uploads one chunk;
  append-only transcripts merge themselves.
- Project folders you register, shared by name with a per-machine path.
- A per-machine record of installed tools, for `bottari tools show`.

### Security

- End-to-end encrypted: AES-256-GCM under a key wrapped by scrypt from
  your password. The cloud holds one plaintext file — the encryption
  parameters and that wrapped key.
- Object names are HMACs of the content hash, so the store leaks no
  fingerprints of what it holds.
- Credential files never leave the machine, and a fail-closed scan blocks
  credential-shaped content before any upload.
- MCP token syncing is available but **off by default**
  (`bottari secrets sync --enable`); bottari's own sign-in and data key
  are never included.

### Interfaces

- CLI: `init`, `sync`, `status`, `restore`, `generations`, `doctor`,
  `prune`, `projects`, `tools`, `secrets`, `login`, `logout`.
- MCP server for the Claude desktop app, shipped as a one-click `.mcpb`
  bundle: status, sync, conflict inspection and resolution, generation
  listing and restore.

### Requirements

Node.js 20 or newer, and a Google account. No other dependencies.
