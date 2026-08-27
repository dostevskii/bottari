<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/bottari_logo_dark.svg">
    <img src="docs/assets/bottari_logo_light.svg" alt="BOTTARI" width="440">
  </picture>
</p>

<p align="center"><b>보따리</b> — pack up your CLI world: skills, settings and sessions,<br>
and carry it between your machines through your own Google Drive.</p>

<p align="center"><a href="README.md"><b>English</b></a> · <a href="README.ko.md">한국어</a></p>

---

Your Claude Code and Codex CLI setup lives on more than one machine —
Windows, an old Linux laptop, a Mac. **bottari** keeps them in step: it packs
your skills, settings, session history and project folders into an encrypted
bundle on **your own Google Drive**, and every machine syncs to it. Only
encrypted data ever leaves your computer.

- **Union merge, nothing deleted.** What exists on one side is always kept.
  You are only asked when the same file changed on two machines.
- **Version history.** Every sync is a generation; `bottari restore` brings
  any earlier state back.
- **End-to-end encrypted.** The cloud holds one plaintext file (encryption
  parameters and a wrapped key). Forget your password and there is no way in —
  there is no back door.
- **Zero dependencies.** Node.js 20+ and nothing else.

> **Status: 0.1.0.** In daily use across Windows, Linux and macOS. Early —
> expect rough edges, and read [SECURITY.md](SECURITY.md) before trusting it
> with anything you cannot lose.

## Install

You need **Node.js 20 or newer** and a **Google account**. Check Node with
`node -v`; if it is missing or older, install it first (per-OS below).

### Windows

```powershell
# 1) Node — skip if `node -v` already prints v20+
winget install OpenJS.NodeJS.LTS

# 2) get bottari (pick one)
git clone https://github.com/dostevskii/bottari.git
#   or: download the ZIP from the green "Code" button and unzip it
cd bottari
npm link          # makes `bottari` available everywhere (optional)
```

### macOS

```bash
# 1) Node — skip if `node -v` already prints v20+
#    with Homebrew:
brew install node
#    or download the LTS .pkg from https://nodejs.org

# 2) get bottari
git clone https://github.com/dostevskii/bottari.git
cd bottari
npm link          # optional; or run `node bin/bottari.mjs` directly
```

### Linux

```bash
# 1) Node 20+ — use your distro (examples)
#    Arch:   sudo pacman -S nodejs npm
#    Debian/Ubuntu: sudo apt install nodejs npm   (check: node -v ≥ v20)
#    Fedora: sudo dnf install nodejs
# 2) get bottari
git clone https://github.com/dostevskii/bottari.git
cd bottari
# A desktop keyring (gnome-keyring + libsecret) is recommended so the
# sign-in is stored securely; without one, bottari falls back to a 0600
# file and warns.
```

## First run

On the machine that has the most data (usually your main one), run:

```
bottari init --remember-key
```

- It signs you in to Google in the browser and asks you to set a password.
- **Remember this password.** It locks the whole bundle and cannot be recovered.
- `--remember-key` stores the key in your OS credential store so you are not
  asked again — and so the Claude Desktop extension can work without it.

On every other machine, run the same command: bottari downloads the bundle,
merges it with that machine (keeping everything unique to each), and uploads
the result.

After that, day to day, it is just:

```
bottari sync
```

## Commands

| | |
|---|---|
| `bottari sync` | synchronize (`--dry-run` to preview) |
| `bottari status` | show what would go up or down, changing nothing |
| `bottari restore --generation N` | bring files back to an earlier version |
| `bottari generations` | list the versions in the cloud |
| `bottari doctor` | diagnose the environment and store |
| `bottari prune --keep N` | reclaim space from old generations |
| `bottari projects add <path>` | add a project folder to the sync |
| `bottari tools capture` / `show` | record and compare installed tools |
| `bottari secrets set <name>` | fill a secret that was split out of a config |
| `bottari secrets sync --enable` | carry MCP tokens in the bundle too (off by default — see [SECURITY.md](SECURITY.md)) |
| `bottari login` / `logout` | sign in / out of Google Drive |

## Claude Desktop (MCP)

bottari ships an MCP server so Claude can drive it from the desktop app.

1. Build the bundle: `node scripts/build-mcpb.mjs` → `dist/bottari.mcpb`
2. Claude Desktop → **Settings → Extensions** → drag `bottari.mcpb` in.

Once you have run `bottari sync --remember-key` once in a terminal (so the key
is stored), just ask Claude: *"check my bottari status"* or *"sync bottari"*.
Conflicts come back as a list; you choose, and the next sync applies it.

## What syncs

| | example | how |
|---|---|---|
| assets | skills, CLAUDE.md, AGENTS.md, hooks | as-is |
| settings | settings.json, config.toml, MCP servers | machine-neutral form only; paths become placeholders, secrets move to your OS credential store |
| session history | conversation `.jsonl` | 8 MB chunks, appends auto-merge |
| projects | folders you register | shared by name, path per machine |

Credential files (`.credentials.json`, `auth.json`, …) never leave your
machine, and a fail-closed scan blocks any credential-looking content before
upload. Regenerable folders (`node_modules`, `dist`, …) and caches are excluded.

## Google account

The build embeds an OAuth client scoped to `drive.file` — it only ever sees
files this app created, never the rest of your Drive. Any Google account can
sign in. Because the app is not through Google's verification (which
`drive.file` does not require), the browser shows an "unverified app" notice
once; **Advanced → continue** proceeds.

As with any installed app, the embedded client is not a secret (RFC 8252
§8.5) — it identifies bottari, not you. If you fork and redistribute,
register your own client and set `BOTTARI_CLIENT_ID` / `BOTTARI_CLIENT_SECRET`.

## Security

Design and threat model: [SECURITY.md](SECURITY.md). The sync model itself is
defined in [docs/SYNC-MODEL.md](docs/SYNC-MODEL.md).

## License

GPL-3.0-only · Copyright (C) 2026 JUNG HWANGBO &lt;dostevskii@gmail.com&gt;
