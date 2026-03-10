# Ide-IM-Skill

Bridge Cursor / Claude Code / Codex to IM platforms — chat with AI from Telegram, Discord, Feishu/Lark, or QQ.

[中文文档](README_CN.md)

> Based on [Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill). This fork adds **Cursor CLI** support and is published as [Ide-IM-Skill](https://github.com/chovizzz/Ide-IM-Skill).

---

## How It Works

A background daemon connects your IM bots to Cursor CLI, Claude Code, or Codex. Messages from IM are forwarded to the AI agent; responses (including tool use, permission requests, streaming) are sent back to your chat.

```
You (Telegram/Discord/Feishu/QQ)
  ↕ Bot API
Background Daemon (Node.js)
  ↕ Cursor CLI / Claude Agent SDK / Codex SDK (CTI_RUNTIME)
Cursor / Claude Code / Codex → reads/writes your codebase
```

## Features

- **Four IM platforms** — Telegram, Discord, Feishu/Lark, QQ — any combination
- **Cursor CLI** — `CTI_RUNTIME=cursor` uses Cursor CLI (`agent`); install: `curl https://cursor.com/install -fsS | bash`
- **Claude & Codex** — `claude`, `codex`, or `auto` runtime
- **Interactive setup** — guided wizard for tokens and settings
- **Permission control** — approve tool calls via inline buttons (Telegram/Discord) or `/perm` (Feishu/QQ)
- **Streaming preview** — see AI response as it types (Telegram & Discord)
- **Session persistence** — conversations survive daemon restarts
- **Secret protection** — tokens `chmod 600`, redacted in logs

## Prerequisites

- **Node.js >= 20**
- **Cursor CLI** (for `CTI_RUNTIME=cursor`): `curl https://cursor.com/install -fsS | bash`, then `agent login` or set `CURSOR_API_KEY`
- **Claude Code CLI** (for `CTI_RUNTIME=claude` or `auto`): install and `claude auth login`
- **Codex** (for `CTI_RUNTIME=codex` or `auto`): `npm install -g @openai/codex`, then `codex auth login` or `OPENAI_API_KEY`

## Installation

### Git clone

```bash
git clone git@github.com:chovizzz/Ide-IM-Skill.git ~/code/Ide-IM-Skill
cd Ide-IM-Skill && npm install && npm run build
```

**Cursor:** Put or symlink the repo into your workspace (e.g. `.cursor/skills/ide-im-skill` or open the repo as workspace). The skill is triggered by saying "ide-im setup", "启动桥接", "配置 IM 桥接", etc.

**Claude Code:** Symlink into Claude skills:

```bash
mkdir -p ~/.claude/skills
ln -s ~/code/Ide-IM-Skill ~/.claude/skills/ide-im-skill
```

**Codex:** Clone into Codex skills:

```bash
git clone git@github.com:chovizzz/Ide-IM-Skill.git ~/.codex/skills/ide-im-skill
cd ~/.codex/skills/ide-im-skill && npm install && npm run build
```

## Quick Start

### 1. Setup

In Cursor (or Claude Code / Codex), say **"ide-im setup"** or **"配置 IM 桥接"**. The wizard will ask for channels (Telegram, Discord, Feishu, QQ), tokens, working directory, and runtime (`cursor` / `claude` / `codex` / `auto`).

### 2. Start

Say **"启动桥接"** or **"ide-im start"**. The daemon runs in the background.

### 3. Chat

Send a message to your bot in Telegram/Discord/Feishu/QQ. The AI will respond. When it needs to use a tool (edit file, run command), you’ll see **Allow** / **Deny** in chat (or `/perm` on Feishu/QQ).

## Commands

| Say / Command        | Description        |
|----------------------|--------------------|
| ide-im setup / 配置  | Interactive setup  |
| ide-im start / 启动桥接 | Start daemon   |
| ide-im stop / 停止桥接  | Stop daemon    |
| ide-im status / 状态   | Daemon status  |
| ide-im logs [N]      | View logs       |
| ide-im reconfigure   | Update config   |
| ide-im doctor / 诊断  | Diagnose issues  |

## Configuration

Config and data path: **CTI_HOME** (default `~/.claude-to-im/`). Set `CTI_HOME` to use a different directory.

- `config.env` — credentials and settings
- `data/` — sessions, bindings, messages
- `logs/` — bridge.log
- `runtime/` — PID, status.json

See `config.env.example` and [references/setup-guides.md](references/setup-guides.md).

## Runtime

- **cursor** — Cursor CLI (`agent`). Install Cursor CLI and run `agent login` or set `CURSOR_API_KEY` in config.
- **claude** — Claude Code CLI + SDK
- **codex** — OpenAI Codex SDK
- **auto** — Try Claude first, fall back to Codex

## Troubleshooting

Run **ide-im doctor** (or "诊断") to check Node, config, tokens, and logs. See [references/troubleshooting.md](references/troubleshooting.md).

## Security

Credentials in `$CTI_HOME/config.env` with `chmod 600`. Tokens redacted in logs. See [SECURITY.md](SECURITY.md).

## License

MIT.
