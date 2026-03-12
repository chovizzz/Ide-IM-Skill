#!/usr/bin/env node
/**
 * Post-install patch for upstream claude-to-im discord adapter.
 *
 * The upstream discord-adapter.js unconditionally filters all bot messages
 * (`if (message.author.bot) return;`). This patch replaces that with a
 * configurable check that respects `bridge_discord_allow_bot_messages`.
 *
 * Runs automatically via npm postinstall.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');

const TARGETS = [
  // Compiled JS (what esbuild actually bundles)
  path.join(SKILL_DIR, 'node_modules/claude-to-im/dist/lib/bridge/adapters/discord-adapter.js'),
  // TypeScript source (in case esbuild resolves it)
  path.join(SKILL_DIR, 'node_modules/claude-to-im/src/lib/bridge/adapters/discord-adapter.ts'),
];

// Patterns to find and their replacements

const PATCHES = [
  {
    name: 'allow_bot_messages (dist)',
    // Upstream dist: single-line bot filter (various formatting)
    find: /if\s*\(message\.author\.bot\)\s*\{?\s*(?:console\.log\([^)]*\);\s*)?return;\s*\}?/,
    replace: `// Always filter own messages
        if (this.botUserId && message.author.id === this.botUserId) return;
        // Filter other bots unless allow_bot_messages is enabled
        if (message.author.bot) {
            const allowBots = getBridgeContext().store.getSetting('bridge_discord_allow_bot_messages') === 'true';
            if (!allowBots) return;
        }`,
  },
];

let patchedCount = 0;

for (const target of TARGETS) {
  if (!fs.existsSync(target)) continue;

  let content = fs.readFileSync(target, 'utf-8');
  let changed = false;

  // Skip if already patched
  if (content.includes('bridge_discord_allow_bot_messages')) {
    console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: already patched, skipping`);
    continue;
  }

  for (const patch of PATCHES) {
    if (patch.find.test(content)) {
      content = content.replace(patch.find, patch.replace);
      changed = true;
      console.log(`[patch-upstream] ${path.relative(SKILL_DIR, target)}: applied "${patch.name}"`);
    }
  }

  if (changed) {
    fs.writeFileSync(target, content, 'utf-8');
    patchedCount++;
  }
}

if (patchedCount > 0) {
  console.log(`[patch-upstream] Patched ${patchedCount} file(s)`);
} else {
  console.log('[patch-upstream] No files needed patching');
}
