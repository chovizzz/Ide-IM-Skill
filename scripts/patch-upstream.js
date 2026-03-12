#!/usr/bin/env node
/**
 * Post-install patch for upstream claude-to-im discord adapter.
 *
 * The upstream discord-adapter unconditionally filters all bot messages.
 * This patch replaces that with a configurable check that respects
 * `bridge_discord_allow_bot_messages`.
 *
 * Runs automatically via npm postinstall.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');

const TARGETS = [
  path.join(SKILL_DIR, 'node_modules/claude-to-im/dist/lib/bridge/adapters/discord-adapter.js'),
  path.join(SKILL_DIR, 'node_modules/claude-to-im/src/lib/bridge/adapters/discord-adapter.ts'),
];

const REPLACEMENT = `// Always filter own messages
        if (this.botUserId && message.author.id === this.botUserId) return;
        // Filter other bots unless allow_bot_messages is enabled
        if (message.author.bot) {
            const allowBots = getBridgeContext().store.getSetting('bridge_discord_allow_bot_messages') === 'true';
            if (!allowBots) return;
        }`;

// Match the upstream bot+self filter block in various formats:
//   - dist (.js):  "if (message.author.bot) return;"  followed by  "if (this.botUserId && ...) return;"
//   - src  (.ts):  same two lines possibly with console.log and braces
// The regex captures both lines (bot filter + self filter) so they are replaced together.
const UPSTREAM_PATTERN = new RegExp(
  // Optional comment line(s) before
  '(?:[ \\t]*//[^\\n]*\\n)*' +
  // Line 1: if (message.author.bot) { ... return; }
  '[ \\t]*if\\s*\\(message\\.author\\.bot\\)\\s*\\{?\\s*(?:console\\.log\\([^)]*\\);\\s*)?return;\\s*\\}?\\s*\\n' +
  // Line 2: if (this.botUserId && message.author.id === this.botUserId) { ... return; }
  '[ \\t]*if\\s*\\(this\\.botUserId\\s*&&\\s*message\\.author\\.id\\s*===\\s*this\\.botUserId\\)\\s*\\{?\\s*(?:console\\.log\\([^)]*\\);\\s*)?return;\\s*\\}?',
  'm'
);

let patchedCount = 0;

for (const target of TARGETS) {
  if (!fs.existsSync(target)) continue;

  let content = fs.readFileSync(target, 'utf-8');

  if (content.includes('bridge_discord_allow_bot_messages')) {
    console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: already patched, skipping`);
    continue;
  }

  if (UPSTREAM_PATTERN.test(content)) {
    content = content.replace(UPSTREAM_PATTERN, REPLACEMENT);
    fs.writeFileSync(target, content, 'utf-8');
    patchedCount++;
    console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: patched`);
    continue;
  }

  // Fallback: try matching just the bot filter line alone (some upstream versions)
  const SINGLE_LINE = /[ \t]*(?:\/\/[^\n]*\n)?[ \t]*if\s*\(message\.author\.bot\)\s*\{?\s*(?:console\.log\([^)]*\);\s*)?return;\s*\}?/m;
  if (SINGLE_LINE.test(content)) {
    content = content.replace(SINGLE_LINE, REPLACEMENT);
    fs.writeFileSync(target, content, 'utf-8');
    patchedCount++;
    console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: patched (single-line fallback)`);
    continue;
  }

  console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: no matching pattern found, skipping`);
}

if (patchedCount > 0) {
  console.log(`[patch-upstream] Patched ${patchedCount} file(s)`);
} else {
  console.log('[patch-upstream] No files needed patching');
}
