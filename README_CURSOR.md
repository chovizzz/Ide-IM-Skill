# Ide-IM-Skill（Cursor 内使用）

在 **Cursor** 内使用的 IM 桥接 Skill：把 Telegram、Discord、飞书、QQ 接到 Cursor CLI / Claude / Codex，在手机或 IM 里和 AI 对话。

本仓库为 [Ide-IM-Skill](https://github.com/chovizzz/Ide-IM-Skill)。

## 路径与运行时

- **配置路径**：由 **CTI_HOME** 决定（默认 `~/.claude-to-im/`）。配哪个就用哪个路径。
- **运行时**：`cursor`（Cursor CLI）、`claude`、`codex`、`auto`。在 Cursor 内推荐 `CTI_RUNTIME=cursor`，需先安装 Cursor CLI 并 `agent login` 或设置 `CURSOR_API_KEY`。

## 安装

将本仓库克隆到工作区或 `.cursor/skills/ide-im-skill`（或软链）。Cursor 会通过 SKILL.md 发现技能。

```bash
git clone git@github.com:chovizzz/Ide-IM-Skill.git
cd Ide-IM-Skill && npm install && npm run build
```

## 使用

1. **配置**：在 Cursor 中说「**ide-im setup**」或「**配置 IM 桥接**」。
2. **启动**：说「**启动桥接**」或「**ide-im start**」。
3. 在 IM 里给机器人发消息即可。

## 命令

| 意图     | 示例说法           |
|----------|--------------------|
| 配置     | ide-im setup、配置  |
| 启动桥接 | ide-im start、启动桥接 |
| 停止     | ide-im stop、停止桥接  |
| 状态     | ide-im status、状态   |
| 日志     | ide-im logs         |
| 诊断     | ide-im doctor、诊断   |

## 许可

MIT。
