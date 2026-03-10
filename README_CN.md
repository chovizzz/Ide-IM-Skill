# Ide-IM-Skill

将 Cursor / Claude Code / Codex 桥接到 IM 平台 —— 在 Telegram、Discord、飞书或 QQ 中与 AI 对话。

[English](README.md)

> 基于 [Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill)，本仓库 [Ide-IM-Skill](https://github.com/chovizzz/Ide-IM-Skill) 增加 **Cursor CLI** 支持。

---

## 工作原理

后台守护进程将 IM 机器人连接到 Cursor CLI、Claude Code 或 Codex。IM 消息转发给 AI，回复（含工具调用、权限请求、流式输出）回传到聊天。

```
你 (Telegram/Discord/飞书/QQ)
  ↕ Bot API
后台守护进程 (Node.js)
  ↕ Cursor CLI / Claude SDK / Codex SDK (CTI_RUNTIME)
Cursor / Claude / Codex → 读写你的代码库
```

## 功能特点

- **四大 IM 平台** — Telegram、Discord、飞书、QQ，可任意组合
- **Cursor CLI** — `CTI_RUNTIME=cursor` 使用 Cursor CLI（`agent`）；安装：`curl https://cursor.com/install -fsS | bash`
- **Claude 与 Codex** — 可选 `claude`、`codex`、`auto`
- **交互式配置** — 向导收集 token 与设置
- **权限控制** — 工具调用在聊天中通过按钮或 `/perm` 批准
- **流式预览** — 实时查看 AI 输出（Telegram、Discord）
- **会话持久化** — 守护进程重启后对话保留
- **密钥保护** — token `chmod 600`，日志脱敏

## 前置要求

- **Node.js >= 20**
- **Cursor CLI**（`CTI_RUNTIME=cursor`）：`curl https://cursor.com/install -fsS | bash`，再 `agent login` 或设置 `CURSOR_API_KEY`
- **Claude Code CLI**（`claude`/`auto`）：安装并 `claude auth login`
- **Codex**（`codex`/`auto`）：`npm install -g @openai/codex`，`codex auth login` 或 `OPENAI_API_KEY`

## 安装

```bash
git clone git@github.com:chovizzz/Ide-IM-Skill.git ~/code/Ide-IM-Skill
cd Ide-IM-Skill && npm install && npm run build
```

**Cursor：** 将仓库放入工作区或 `.cursor/skills/ide-im-skill`，在对话中说「ide-im setup」「启动桥接」「配置 IM 桥接」等即可。

**Claude Code：** `ln -s ~/code/Ide-IM-Skill ~/.claude/skills/ide-im-skill`

## 快速开始

1. **配置**：说「**ide-im setup**」或「**配置 IM 桥接**」，按向导选择渠道、填 token、选 runtime。
2. **启动**：说「**启动桥接**」或「**ide-im start**」。
3. **聊天**：在 Telegram/Discord/飞书/QQ 给机器人发消息即可。

## 命令

| 说法 / 命令     | 说明     |
|-----------------|----------|
| ide-im setup / 配置 | 交互配置 |
| ide-im start / 启动桥接 | 启动守护进程 |
| ide-im stop / 停止桥接  | 停止     |
| ide-im status / 状态   | 状态     |
| ide-im logs [N] | 日志     |
| ide-im doctor / 诊断   | 诊断     |

## 配置路径

由 **CTI_HOME** 决定（默认 `~/.claude-to-im/`）。详见 `config.env.example` 与 [references/setup-guides.md](references/setup-guides.md)。

## 许可

MIT。
