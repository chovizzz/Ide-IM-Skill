# Identity and Memory (OpenClaw-style)

Ide-IM-Skill can load **identity** and **memory** from Markdown files and inject them into the session system prompt, so the model behaves with a consistent persona and has access to long-term and daily context. This aligns with [OpenClaw Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace) and [Default AGENTS](https://docs.openclaw.ai/reference/AGENTS.default).

## Identity root

- **identity_root** is the directory from which the bridge reads the files below. The composed system prompt **includes a "Workspace (identity root)" section** with the absolute path, so the agent knows where to read and update identity/memory files (like OpenClaw).
- If **CTI_IDENTITY_DIR** is set in `config.env`, all sessions use that directory.
- If **CTI_RUNTIME=cursor** and not set: default is **`~/.workspace`**. On first start the daemon seeds it from `templates/identity-default/` if missing.
- If not set, each session uses its **working directory** (default workdir or the binding’s cwd).

Place the files either:

- Under a single global directory and set `CTI_IDENTITY_DIR` to that path, or  
- Under each project’s working directory so different chats can have different SOUL/identity/memory.

## Files (relative to identity_root)

| File | Role |
|------|------|
| **AGENTS.md** | Operating instructions: how to use memory, what to read at session start, safety boundaries. Loaded first. |
| **SOUL.md** | Persona, tone, and boundaries. “Who you are” rather than generic assistant. |
| **IDENTITY.md** | External presentation: name, emoji, theme, creature, vibe, avatar. |
| **USER.md** | Who the user is and how to address them. Optional. |
| **TOOLS.md** | Local notes: cameras, SSH, TTS, device nicknames, environment-specific. |
| **MEMORY.md** | Long-term curated memory: decisions, preferences, important facts. |
| **memory/YYYY-MM-DD.md** | Daily log. Session start loads **yesterday** and **today** (by local date). |

Missing files are skipped. Files are read as UTF-8 and truncated per file (e.g. 512KB) to avoid blowing the context.

## Injection order

The composed system prompt is built in this order (only non-empty content is included):

1. AGENTS (operating instructions)  
2. SOUL (behavior / philosophy)  
3. IDENTITY (presentation)  
4. USER (who the user is)  
5. TOOLS (local notes)  
6. Long-term memory (MEMORY.md)  
7. Memory: YYYY-MM-DD (yesterday)  
8. Memory: YYYY-MM-DD (today)  

Each block is wrapped in a `## Title` section so the model can tell identity from memory.

## Default templates (bundled)

When **CTI_RUNTIME=cursor**, the default identity root is **`~/.workspace`**. The daemon auto-seeds OpenClaw-style templates on first start. You can also copy them manually:

```bash
cp SKILL_DIR/templates/identity-default/*.md ~/.workspace/
mkdir -p ~/.workspace/memory
```

Templates live under `templates/identity-default/` (see `templates/identity-default/README.md`). You can edit `~/.workspace/*.md` and `~/.workspace/memory/YYYY-MM-DD.md` after that.

## Example snippets (minimal)

You can also copy and adapt the snippets below, or use OpenClaw’s [reference templates](https://github.com/openclaw/openclaw/tree/main/docs/reference/templates).

### SOUL.md (minimal)

```markdown
# SOUL — Who You Are

- Be genuinely helpful; skip filler like "Great question!"
- Have opinions. You're allowed to prefer things and say so.
- Be resourceful before asking: read the context, then ask if stuck.
- Private things stay private. When in doubt, ask before acting externally.
- Each session you wake up fresh. These files are your memory; read and update them.
```

### IDENTITY.md (minimal)

```markdown
- **Name:** Bridge
- **Emoji:** 🤖
- **Vibe:** Helpful, concise, careful with external actions.
```

### MEMORY.md (minimal)

```markdown
# Long-term memory

- Decisions and preferences go here.
- Only load in private sessions; avoid putting secrets here.
```

### AGENTS.md (minimal)

```markdown
# Session start (required)

- Read SOUL.md, USER.md, MEMORY.md, and today+yesterday in memory/ before responding.
- Use memory/YYYY-MM-DD.md for daily notes; use MEMORY.md for durable facts and decisions.
- Don't dump directories or secrets into chat. Don't run destructive commands unless asked.
```

## Config

In `$CTI_HOME/config.env` (or `config.env` in project):

```env
# Optional: global identity/memory root. If unset, each session uses its working directory.
# CTI_IDENTITY_DIR=/path/to/workspace
```

See `config.env.example` for more options.

## Behaviour

- **New session**: When the bridge creates a session and no system prompt is provided, it reads the files above from identity_root and passes the composed text as the session’s system prompt.
- **Existing session**: On each `getSession`, the bridge can re-compute the system prompt from disk, so edits to SOUL/IDENTITY/MEMORY or daily files take effect without creating a new session.

Memory **write-back** (e.g. tools for the model to append to MEMORY.md or daily logs) is not part of this phase; it may be added later.
