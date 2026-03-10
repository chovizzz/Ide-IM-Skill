# Usage Guide

This skill works in **Cursor** (say "ide-im setup", "启动桥接", "配置", "诊断" etc.) and with **Codex** (via natural language like "start bridge", "配置", "诊断"). All commands below use Claude Code syntax; Codex users can use equivalent natural language.

## setup

Interactive wizard that configures the bridge.

```
ide-im setup
```

The wizard will prompt you for:

1. **Channels to enable** -- Enter comma-separated values: `telegram`, `discord`, `feishu`, `qq`
2. **Platform credentials** -- Bot tokens, app IDs, and secrets for each enabled channel
3. **Allowed users** (optional) -- Restrict which users can interact with the bot
4. **Working directory** -- Default project directory for Claude Code sessions
5. **Model and mode** -- Claude model and interaction mode (code/plan/ask)

After collecting input, the wizard validates tokens by calling each platform's API and reports results.

Example interaction:

```
> ide-im setup
Which channels to enable? telegram,discord
Enter Telegram bot token: <your-token>
Enter Discord bot token: <your-token>
Default working directory [/current/dir]: /Users/me/projects
Model [claude-sonnet-4-20250514]:
Mode [code]:

Validating tokens...
  Telegram: OK (bot @MyBotName)
  Discord: OK (format valid)

Config written to $CTI_HOME/config.env (default ~/.claude-to-im/config.env)
```

## start

Starts the bridge daemon in the background.

```
ide-im start
```

The daemon process ID is stored in `$CTI_HOME/runtime/bridge.pid` (default ~/.claude-to-im). If the daemon is already running, the command reports the existing process.

If startup fails, run `ide-im doctor` to diagnose issues.

## stop

Stops the running bridge daemon.

```
ide-im stop
```

Sends SIGTERM to the daemon process and cleans up the PID file.

## status

Shows whether the daemon is running and basic health information.

```
ide-im status
```

Output includes:
- Running/stopped state
- PID (if running)
- Uptime
- Connected channels

## logs

Shows recent log output from the daemon.

```
ide-im logs        # Last 50 lines (default)
ide-im logs 200    # Last 200 lines
```

Logs are stored in `$CTI_HOME/logs/` (default ~/.claude-to-im) and are automatically redacted to mask secrets.

## reconfigure

Interactively update the current configuration.

```
ide-im reconfigure
```

Displays current settings with secrets masked, then prompts for changes. After updating, you must restart the daemon for changes to take effect:

```
ide-im stop
ide-im start
```

## doctor

Runs diagnostic checks and reports issues.

```
ide-im doctor
```

Checks performed:
- Node.js version (>= 20 required)
- Claude Code CLI availability
- Config file exists and has correct permissions
- Required tokens are set for enabled channels
- Token validity (API calls)
- QQ credentials and gateway reachability (if QQ enabled)
- Daemon process health
- Log directory writability

### QQ notes

QQ currently supports **C2C private chat only**:
- No inline approval buttons — permissions use text `/perm ...` commands
- No streaming preview
- Image inbound only (no image replies)
- No group/channel support yet
- Required config: `CTI_QQ_APP_ID`, `CTI_QQ_APP_SECRET` (obtain from https://q.qq.com/qqbot/openclaw)
- `CTI_QQ_ALLOWED_USERS` takes `user_openid` values, not QQ numbers
- Set `CTI_QQ_IMAGE_ENABLED=false` if the provider doesn't support image input
