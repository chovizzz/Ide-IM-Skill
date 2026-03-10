# Troubleshooting

## Bridge won't start

**Symptoms**: `ide-im start` fails or daemon exits immediately.

**Steps**:

1. Run `ide-im doctor` to identify the issue
2. Check that Node.js >= 20 is installed: `node --version`
3. Check that Claude Code CLI is available: `claude --version`
4. Verify config exists: `ls -la $CTI_HOME/config.env` (default ~/.claude-to-im)
5. Check logs for startup errors: `ide-im logs`

**Common causes**:
- Missing or invalid config.env -- run `ide-im setup`
- Node.js not found or wrong version -- install Node.js >= 20
- Port or resource conflict -- check if another instance is running with `ide-im status`

## Messages not received

**Symptoms**: Bot is online but doesn't respond to messages.

**Steps**:

1. Verify the bot token is valid: `ide-im doctor`
2. Check allowed user IDs in config -- if set, only listed users can interact
3. For Telegram: ensure you've sent `/start` to the bot first
4. For Discord: verify the bot has been invited to the server with message read permissions
5. For Feishu: confirm the app has been approved and event subscriptions are configured
6. Check logs for incoming message events: `ide-im logs 200`

## Cursor CLI: Authentication required

**Symptoms**: Error: `Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.`

**Cause**: When `CTI_RUNTIME=cursor`, the bridge spawns Cursor CLI (`agent`) in the background. The daemon has no interactive session, so `agent login` from your terminal may not be visible to it.

**Fix** (choose one):

1. **Set CURSOR_API_KEY in config** (recommended for daemon):
   - Add to `~/.claude-to-im/config.env`: `CURSOR_API_KEY=你的API密钥`
   - Get the key from your Cursor account/settings (e.g. [cursor.com](https://cursor.com) → Settings → API).
   - Restart the bridge: `ide-im stop` then `ide-im start`.

2. **Try `agent login` first** (if your Cursor CLI stores auth in a file the daemon can read):
   - In a terminal run: `agent login`
   - Complete the login, then restart the bridge. If the error persists, use option 1.

## Permission timeout

**Symptoms**: Claude Code session starts but times out waiting for tool approval.

**Steps**:

1. The bridge runs Claude Code in non-interactive mode; ensure your Claude Code configuration allows the necessary tools
2. Consider using `--allowedTools` in your configuration to pre-approve common tools
3. Check network connectivity if the timeout occurs during API calls

## High memory usage

**Symptoms**: The daemon process consumes increasing memory over time.

**Steps**:

1. Check current memory usage: `ide-im status`
2. Restart the daemon to reset memory:
   ```
   ide-im stop
   ide-im start
   ```
3. If the issue persists, check how many concurrent sessions are active -- each Claude Code session consumes memory
4. Review logs for error loops that may cause memory leaks

## Stale PID file

**Symptoms**: Status shows "running" but the process doesn't exist, or start refuses because it thinks a daemon is already running.

The daemon management script (`daemon.sh`) handles stale PID files automatically. If you still encounter issues:

1. Run `ide-im stop` -- it will clean up the stale PID file
2. If stop also fails, manually remove the PID file:
   ```bash
   rm $CTI_HOME/runtime/bridge.pid
   ```
3. Run `ide-im start` to launch a fresh instance
