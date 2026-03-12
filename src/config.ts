import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Config {
  runtime: 'claude' | 'codex' | 'auto' | 'cursor';
  enabledChannels: string[];
  defaultWorkDir: string;
  defaultModel?: string;
  defaultMode: string;
  // Telegram
  tgBotToken?: string;
  tgChatId?: string;
  tgAllowedUsers?: string[];
  // Feishu
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuDomain?: string;
  feishuAllowedUsers?: string[];
  /** Group messages require @mention to respond (default true for Feishu). */
  feishuRequireMention?: boolean;
  /** Group message policy: 'open' (default) or 'disabled'. */
  feishuGroupPolicy?: 'open' | 'disabled';
  // Discord
  discordBotToken?: string;
  discordAllowedUsers?: string[];
  discordAllowedChannels?: string[];
  discordAllowedGuilds?: string[];
  /** Guild messages require @mention to respond (default false). */
  discordRequireMention?: boolean;
  /** Guild message policy: 'open' (default) or 'disabled' (ignore all). */
  discordGroupPolicy?: 'open' | 'disabled';
  /** Allow other bots' messages to trigger responses (default false). */
  discordAllowBotMessages?: boolean;
  // QQ
  qqAppId?: string;
  qqAppSecret?: string;
  qqAllowedUsers?: string[];
  qqImageEnabled?: boolean;
  qqMaxImageSize?: number;
  // Auto-approve all tool permission requests without user confirmation
  autoApprove?: boolean;
  /** Cursor CLI sandbox mode: 'enabled' | 'disabled' | undefined (use CLI default). */
  cursorSandbox?: 'enabled' | 'disabled';
  /** Optional global identity/memory root (SOUL, AGENTS, MEMORY, etc.). Empty = use session workingDirectory. */
  identityDir?: string;
}

export const CTI_HOME = process.env.CTI_HOME || path.join(os.homedir(), ".ide-im");
export const CONFIG_PATH = path.join(CTI_HOME, "config.env");

function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }
  return entries;
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): Config {
  let env = new Map<string, string>();
  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    env = parseEnvFile(content);
  } catch {
    // Config file doesn't exist yet — use defaults
  }

  const rawRuntime = env.get("CTI_RUNTIME") || "claude";
  const runtime = (["claude", "codex", "auto", "cursor"].includes(rawRuntime) ? rawRuntime : "claude") as Config["runtime"];

  // Default working directory strategy:
  // - If CTI_DEFAULT_WORKDIR is set, always respect it.
  // - Otherwise, choose a sensible global workspace per runtime:
  //   - cursor: use a global workspace folder under the user's home (e.g. ~/workspace),
  //             so different Cursor projects可以共享一个默认工作区。
  //   - others: fall back to current process cwd (保持上游行为).
  const envDefaultWorkDir = env.get("CTI_DEFAULT_WORKDIR");
  const inferredDefaultWorkDir =
    envDefaultWorkDir ||
    (runtime === "cursor"
      ? path.join(os.homedir(), ".workspace")
      : process.cwd());

  // Identity/memory root (SOUL.md, AGENTS.md, MEMORY.md, etc.):
  // - If CTI_IDENTITY_DIR is set, use it.
  // - If runtime is cursor and unset: prefer skill workspace (IDE_IM_SKILL_DIR/workspace)
  //   so the agent's identity lives under the skill; else ~/.workspace.
  // - Otherwise leave unset (session uses working_directory as identity root).
  const envIdentityDir = env.get("CTI_IDENTITY_DIR")?.trim();
  const skillWorkspace =
    process.env.IDE_IM_SKILL_DIR
      ? path.join(process.env.IDE_IM_SKILL_DIR, ".workspace")
      : "";
  const inferredIdentityDir =
    envIdentityDir ||
    (runtime === "cursor"
      ? (skillWorkspace || inferredDefaultWorkDir)
      : undefined);

  return {
    runtime,
    enabledChannels: splitCsv(env.get("CTI_ENABLED_CHANNELS")) ?? [],
    defaultWorkDir: inferredDefaultWorkDir,
    defaultModel: env.get("CTI_DEFAULT_MODEL") || undefined,
    defaultMode: env.get("CTI_DEFAULT_MODE") || "code",
    tgBotToken: env.get("CTI_TG_BOT_TOKEN") || undefined,
    tgChatId: env.get("CTI_TG_CHAT_ID") || undefined,
    tgAllowedUsers: splitCsv(env.get("CTI_TG_ALLOWED_USERS")),
    feishuAppId: env.get("CTI_FEISHU_APP_ID") || undefined,
    feishuAppSecret: env.get("CTI_FEISHU_APP_SECRET") || undefined,
    feishuDomain: env.get("CTI_FEISHU_DOMAIN") || undefined,
    feishuAllowedUsers: splitCsv(env.get("CTI_FEISHU_ALLOWED_USERS")),
    feishuRequireMention: env.has("CTI_FEISHU_REQUIRE_MENTION")
      ? env.get("CTI_FEISHU_REQUIRE_MENTION") !== "false"
      : undefined,
    feishuGroupPolicy: (env.get("CTI_FEISHU_GROUP_POLICY") as Config["feishuGroupPolicy"]) || undefined,
    discordBotToken: env.get("CTI_DISCORD_BOT_TOKEN") || undefined,
    discordAllowedUsers: splitCsv(env.get("CTI_DISCORD_ALLOWED_USERS")),
    discordAllowedChannels: splitCsv(
      env.get("CTI_DISCORD_ALLOWED_CHANNELS")
    ),
    discordAllowedGuilds: splitCsv(env.get("CTI_DISCORD_ALLOWED_GUILDS")),
    discordAllowBotMessages: env.has("CTI_DISCORD_ALLOW_BOT_MESSAGES")
      ? env.get("CTI_DISCORD_ALLOW_BOT_MESSAGES") === "true"
      : undefined,
    discordRequireMention: env.has("CTI_DISCORD_REQUIRE_MENTION")
      ? env.get("CTI_DISCORD_REQUIRE_MENTION") === "true"
      : undefined,
    discordGroupPolicy: (env.get("CTI_DISCORD_GROUP_POLICY") as Config["discordGroupPolicy"]) || undefined,
    qqAppId: env.get("CTI_QQ_APP_ID") || undefined,
    qqAppSecret: env.get("CTI_QQ_APP_SECRET") || undefined,
    qqAllowedUsers: splitCsv(env.get("CTI_QQ_ALLOWED_USERS")),
    qqImageEnabled: env.has("CTI_QQ_IMAGE_ENABLED")
      ? env.get("CTI_QQ_IMAGE_ENABLED") === "true"
      : undefined,
    qqMaxImageSize: env.get("CTI_QQ_MAX_IMAGE_SIZE")
      ? Number(env.get("CTI_QQ_MAX_IMAGE_SIZE"))
      : undefined,
    autoApprove: env.get("CTI_AUTO_APPROVE") === "true",
    cursorSandbox: (env.get("CTI_CURSOR_SANDBOX") as Config["cursorSandbox"]) || undefined,
    identityDir: inferredIdentityDir || undefined,
  };
}

function formatEnvLine(key: string, value: string | undefined): string {
  if (value === undefined || value === "") return "";
  return `${key}=${value}\n`;
}

export function saveConfig(config: Config): void {
  let out = "";
  out += formatEnvLine("CTI_RUNTIME", config.runtime);
  out += formatEnvLine(
    "CTI_ENABLED_CHANNELS",
    config.enabledChannels.join(",")
  );
  out += formatEnvLine("CTI_DEFAULT_WORKDIR", config.defaultWorkDir);
  if (config.defaultModel) out += formatEnvLine("CTI_DEFAULT_MODEL", config.defaultModel);
  out += formatEnvLine("CTI_DEFAULT_MODE", config.defaultMode);
  out += formatEnvLine("CTI_TG_BOT_TOKEN", config.tgBotToken);
  out += formatEnvLine("CTI_TG_CHAT_ID", config.tgChatId);
  out += formatEnvLine(
    "CTI_TG_ALLOWED_USERS",
    config.tgAllowedUsers?.join(",")
  );
  out += formatEnvLine("CTI_FEISHU_APP_ID", config.feishuAppId);
  out += formatEnvLine("CTI_FEISHU_APP_SECRET", config.feishuAppSecret);
  out += formatEnvLine("CTI_FEISHU_DOMAIN", config.feishuDomain);
  out += formatEnvLine(
    "CTI_FEISHU_ALLOWED_USERS",
    config.feishuAllowedUsers?.join(",")
  );
  if (config.feishuRequireMention !== undefined)
    out += formatEnvLine("CTI_FEISHU_REQUIRE_MENTION", String(config.feishuRequireMention));
  if (config.feishuGroupPolicy)
    out += formatEnvLine("CTI_FEISHU_GROUP_POLICY", config.feishuGroupPolicy);
  out += formatEnvLine("CTI_DISCORD_BOT_TOKEN", config.discordBotToken);
  out += formatEnvLine(
    "CTI_DISCORD_ALLOWED_USERS",
    config.discordAllowedUsers?.join(",")
  );
  out += formatEnvLine(
    "CTI_DISCORD_ALLOWED_CHANNELS",
    config.discordAllowedChannels?.join(",")
  );
  out += formatEnvLine(
    "CTI_DISCORD_ALLOWED_GUILDS",
    config.discordAllowedGuilds?.join(",")
  );
  if (config.discordAllowBotMessages !== undefined)
    out += formatEnvLine("CTI_DISCORD_ALLOW_BOT_MESSAGES", String(config.discordAllowBotMessages));
  if (config.discordRequireMention !== undefined)
    out += formatEnvLine("CTI_DISCORD_REQUIRE_MENTION", String(config.discordRequireMention));
  if (config.discordGroupPolicy)
    out += formatEnvLine("CTI_DISCORD_GROUP_POLICY", config.discordGroupPolicy);
  out += formatEnvLine("CTI_QQ_APP_ID", config.qqAppId);
  out += formatEnvLine("CTI_QQ_APP_SECRET", config.qqAppSecret);
  out += formatEnvLine(
    "CTI_QQ_ALLOWED_USERS",
    config.qqAllowedUsers?.join(",")
  );
  if (config.qqImageEnabled !== undefined)
    out += formatEnvLine("CTI_QQ_IMAGE_ENABLED", String(config.qqImageEnabled));
  if (config.qqMaxImageSize !== undefined)
    out += formatEnvLine("CTI_QQ_MAX_IMAGE_SIZE", String(config.qqMaxImageSize));
  if (config.cursorSandbox) out += formatEnvLine("CTI_CURSOR_SANDBOX", config.cursorSandbox);
  if (config.identityDir) out += formatEnvLine("CTI_IDENTITY_DIR", config.identityDir);

  fs.mkdirSync(CTI_HOME, { recursive: true });
  const tmpPath = CONFIG_PATH + ".tmp";
  fs.writeFileSync(tmpPath, out, { mode: 0o600 });
  fs.renameSync(tmpPath, CONFIG_PATH);
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

export function configToSettings(config: Config): Map<string, string> {
  const m = new Map<string, string>();
  m.set("remote_bridge_enabled", "true");

  // ── Telegram ──
  // Upstream keys: telegram_bot_token, bridge_telegram_enabled,
  //   telegram_bridge_allowed_users, telegram_chat_id
  m.set(
    "bridge_telegram_enabled",
    config.enabledChannels.includes("telegram") ? "true" : "false"
  );
  if (config.tgBotToken) m.set("telegram_bot_token", config.tgBotToken);
  if (config.tgAllowedUsers)
    m.set("telegram_bridge_allowed_users", config.tgAllowedUsers.join(","));
  if (config.tgChatId) m.set("telegram_chat_id", config.tgChatId);

  // ── Discord ──
  // Upstream keys: bridge_discord_bot_token, bridge_discord_enabled,
  //   bridge_discord_allowed_users, bridge_discord_allowed_channels,
  //   bridge_discord_allowed_guilds
  m.set(
    "bridge_discord_enabled",
    config.enabledChannels.includes("discord") ? "true" : "false"
  );
  if (config.discordBotToken)
    m.set("bridge_discord_bot_token", config.discordBotToken);
  if (config.discordAllowedUsers)
    m.set("bridge_discord_allowed_users", config.discordAllowedUsers.join(","));
  if (config.discordAllowedChannels)
    m.set(
      "bridge_discord_allowed_channels",
      config.discordAllowedChannels.join(",")
    );
  if (config.discordAllowedGuilds)
    m.set(
      "bridge_discord_allowed_guilds",
      config.discordAllowedGuilds.join(",")
    );
  if (config.discordRequireMention !== undefined)
    m.set("bridge_discord_require_mention", String(config.discordRequireMention));
  if (config.discordGroupPolicy)
    m.set("bridge_discord_group_policy", config.discordGroupPolicy);
  if (config.discordAllowBotMessages !== undefined)
    m.set("bridge_discord_allow_bot_messages", String(config.discordAllowBotMessages));
  // Disable streaming preview to prevent duplicate messages (preview + final)
  m.set("bridge_discord_stream_enabled", "false");

  // ── Feishu ──
  // Upstream keys: bridge_feishu_app_id, bridge_feishu_app_secret,
  //   bridge_feishu_domain, bridge_feishu_enabled, bridge_feishu_allowed_users
  m.set(
    "bridge_feishu_enabled",
    config.enabledChannels.includes("feishu") ? "true" : "false"
  );
  if (config.feishuAppId) m.set("bridge_feishu_app_id", config.feishuAppId);
  if (config.feishuAppSecret)
    m.set("bridge_feishu_app_secret", config.feishuAppSecret);
  if (config.feishuDomain) m.set("bridge_feishu_domain", config.feishuDomain);
  if (config.feishuAllowedUsers)
    m.set("bridge_feishu_allowed_users", config.feishuAllowedUsers.join(","));
  if (config.feishuRequireMention !== undefined)
    m.set("bridge_feishu_require_mention", String(config.feishuRequireMention));
  if (config.feishuGroupPolicy)
    m.set("bridge_feishu_group_policy", config.feishuGroupPolicy);

  // ── QQ ──
  // Upstream keys: bridge_qq_enabled, bridge_qq_app_id, bridge_qq_app_secret,
  //   bridge_qq_allowed_users, bridge_qq_image_enabled, bridge_qq_max_image_size
  m.set(
    "bridge_qq_enabled",
    config.enabledChannels.includes("qq") ? "true" : "false"
  );
  if (config.qqAppId) m.set("bridge_qq_app_id", config.qqAppId);
  if (config.qqAppSecret) m.set("bridge_qq_app_secret", config.qqAppSecret);
  if (config.qqAllowedUsers)
    m.set("bridge_qq_allowed_users", config.qqAllowedUsers.join(","));
  if (config.qqImageEnabled !== undefined)
    m.set("bridge_qq_image_enabled", String(config.qqImageEnabled));
  if (config.qqMaxImageSize !== undefined)
    m.set("bridge_qq_max_image_size", String(config.qqMaxImageSize));

  // ── Defaults ──
  // Upstream keys: bridge_default_work_dir, bridge_default_model, default_model
  m.set("bridge_default_work_dir", config.defaultWorkDir);
  if (config.defaultModel) {
    m.set("bridge_default_model", config.defaultModel);
    m.set("default_model", config.defaultModel);
  }
  m.set("bridge_default_mode", config.defaultMode);

  return m;
}
