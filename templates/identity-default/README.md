# OpenClaw-style default identity (official templates)

These files are sourced from [OpenClaw’s reference templates](https://github.com/openclaw/openclaw/tree/main/docs/reference/templates). Ide-IM-Skill injects them when the identity root is skill's `SKILL_DIR/.workspace`, or `~/.workspace`, or `CTI_IDENTITY_DIR`.

**Files:**

| File | Role |
|------|------|
| **AGENTS.md** | Workspace operating contract: session startup, memory rules, red lines, group chats, heartbeats. |
| **SOUL.md** | Who you are: core truths, boundaries, vibe, continuity. |
| **IDENTITY.md** | Name, creature, vibe, emoji, avatar — fill in during first conversation. |
| **USER.md** | About your human: name, pronouns, timezone, context. |
| **TOOLS.md** | Local notes: cameras, SSH, TTS, device nicknames, environment-specific. |
| **MEMORY.md** | Long-term curated memory (OpenClaw doesn’t ship this; we add a minimal placeholder). |

Create `memory/` for daily logs: `memory/YYYY-MM-DD.md`.

**Install to default identity root (e.g. skill's `.workspace` or `~/.workspace`):**

```bash
cp SKILL_DIR/templates/identity-default/*.md SKILL_DIR/.workspace/
mkdir -p SKILL_DIR/.workspace/memory
# or for global: cp ... ~/.workspace/ && mkdir -p ~/.workspace/memory
```

See `references/identity-and-memory.md` for injection order and config.
