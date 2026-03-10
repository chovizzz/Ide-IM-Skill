---
name: ide-im
description: |
  Ide-IM-Skill: Bridge Cursor (or Claude Code / Codex) to Telegram, Discord, Feishu/Lark, or QQ so the
  user can chat with AI from their phone. Use for: setting up, starting, stopping,
  or diagnosing the ide-im bridge daemon; IM 桥接、消息推送、连上飞书、手机上看、启动桥接、诊断、查看日志、配置.
  Subcommands: setup, start, stop, status, logs, reconfigure, doctor.
  Do NOT use for: building standalone bots, webhook integrations, or coding with IM SDKs.
argument-hint: "setup | start | stop | status | logs [N] | reconfigure | doctor"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - Grep
  - Glob
---

# Ide-IM-Skill

You are managing the Ide-IM-Skill bridge (IM → AI 桥接，可在 Cursor 内启动与管理).
User data path is controlled by **CTI_HOME** (default `~/.claude-to-im/`). 配哪个就用哪个路径。

The skill directory (SKILL_DIR) is the directory containing this SKILL.md.
Resolve it by: Glob for `**/Ide-IM-Skill/SKILL.md` or `**/ide-im-skill/SKILL.md` and use the parent of the file's directory.

## Command parsing

Parse the user's intent into one of these subcommands:

| User says (examples) | Subcommand |
|---|---|
| `setup`, `configure`, `配置`, `我想在飞书上用 Cursor`, `帮我连接 Telegram` | setup |
| `start`, `start bridge`, `启动`, `启动桥接` | start |
| `stop`, `stop bridge`, `停止`, `停止桥接` | stop |
| `status`, `bridge status`, `状态`, `运行状态` | status |
| `logs`, `logs 200`, `查看日志` | logs |
| `reconfigure`, `修改配置`, `帮我改一下 token` | reconfigure |
| `doctor`, `diagnose`, `诊断`, `挂了`, `没反应了`, `出问题了` | doctor |

**Disambiguation: `status` vs `doctor`** — Use `status` for "is it running?". Use `doctor` when the user reports a problem.

Extract optional numeric argument for `logs` (default 50).

Before asking for platform credentials, read `SKILL_DIR/references/setup-guides.md` and present the relevant guide to the user.

## Runtime detection (Cursor vs others)

- **Cursor** — You are in Cursor. `AskUserQuestion` may be available for interactive setup. SKILL_DIR is the folder containing this SKILL.md (e.g. Ide-IM-Skill or ide-im-skill).
- **No AskUserQuestion** — Show `SKILL_DIR/config.env.example` and instruct the user to create `$CTI_HOME/config.env` (default `~/.claude-to-im/config.env`) manually.

## Config check (for `start`, `stop`, `status`, `logs`, `reconfigure`, `doctor`)

If config.env does NOT exist (under CTI_HOME, default ~/.claude-to-im):
- With AskUserQuestion: start the `setup` wizard.
- Without: show `SKILL_DIR/config.env.example` and ask the user to create the file; do not start the daemon.

If it exists, proceed with the requested subcommand.

## Subcommands

### `setup`

Run an interactive setup wizard when AskUserQuestion is available. Otherwise show `SKILL_DIR/config.env.example` with field-by-field explanations.

When interactive, collect **one field at a time**, confirm each value (mask secrets to last 4 chars).

**Step 1 — Choose channels**

Ask which channels to enable: telegram, discord, feishu, qq (comma-separated). Briefly:
- **telegram** — Personal use, streaming, inline permission buttons.
- **discord** — Team use, server/channel access control.
- **feishu** (Lark) — Feishu/Lark teams, event-based.
- **qq** — QQ C2C only, text `/perm` for permissions.

**Step 2 — Collect tokens per channel**

For each enabled channel, use `SKILL_DIR/references/setup-guides.md`. Collect:
- **Telegram**: Bot Token → Chat ID → Allowed User IDs (optional). At least Chat ID or Allowed Users required.
- **Discord**: Bot Token → Allowed User IDs → Allowed Channel IDs / Guild IDs (optional). At least one of Allowed Users or Allowed Channels required.
- **Feishu**: App ID → App Secret → Domain (optional) → Allowed User IDs (optional). Guide through permissions, bot, events (long connection), publish.
- **QQ**: App ID → App Secret → Allowed User OpenIDs (optional) → Image Enabled / Max Image Size (optional). Remind: C2C only, no inline buttons.

**Step 3 — General settings**

- **Runtime**: `claude`, `codex`, `auto`, or `cursor`
  - `claude` — Claude Code CLI + Claude Agent SDK
  - `codex` — OpenAI Codex SDK
  - `auto` — Try Claude first, fall back to Codex
  - `cursor` — Use Cursor CLI (`agent`); install: curl https://cursor.com/install -fsS | bash
- **Working Directory**: default `$CWD` or workspace root
- **Model** (optional): leave blank to use runtime default
- **Mode**: `code`, `plan`, `ask`

**Step 4 — Write config and validate**

1. Summary table (secrets masked).
2. Confirm, then: `mkdir -p "$CTI_HOME"/{data,logs,runtime,data/messages}` (CTI_HOME 未设时用 ~/.claude-to-im)
3. Write `$CTI_HOME/config.env` (KEY=VALUE).
4. `chmod 600 $CTI_HOME/config.env`
5. Validate tokens per `SKILL_DIR/references/token-validation.md`
6. On success: "Setup complete! Run **ide-im start** (or say «启动桥接») to start the bridge."

### `start`

Ensure config.env exists under CTI_HOME. Then:

`bash "SKILL_DIR/scripts/daemon.sh" start`

On failure, suggest `ide-im doctor` and `ide-im logs`.

### `stop`

`bash "SKILL_DIR/scripts/daemon.sh" stop`

### `status`

`bash "SKILL_DIR/scripts/daemon.sh" status`

### `logs`

Optional line count N (default 50): `bash "SKILL_DIR/scripts/daemon.sh" logs N`

### `reconfigure`

1. Read config from CTI_HOME/config.env, show table (secrets masked).
2. Ask what to change, update config atomically (tmp + rename).
3. Re-validate changed tokens.
4. Remind: "Run **ide-im stop** then **ide-im start** to apply."

### `doctor`

`bash "SKILL_DIR/scripts/doctor.sh"`

Suggest fixes; for details see `SKILL_DIR/references/troubleshooting.md`.

## Notes

- Mask secrets (last 4 chars only) in all output.
- Always check config.env exists before starting the daemon.
- Config path: CTI_HOME/config.env（未设 CTI_HOME 时为 ~/.claude-to-im/config.env）。配哪个就用哪个。
