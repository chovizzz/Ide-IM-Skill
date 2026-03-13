/**
 * Cursor CLI Provider — LLMProvider implementation using Cursor CLI (`agent`).
 *
 * Spawns `agent -p "..." --output-format stream-json --stream-partial-output --workspace <dir> --trust`
 * and parses NDJSON output into the SSE stream format expected by the bridge.
 *
 * Requires Cursor CLI to be installed: https://cursor.com/docs/cli/overview
 * Install: curl https://cursor.com/install -fsS | bash
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { LLMProvider, StreamChatParams } from 'claude-to-im/src/lib/bridge/host.js';
import type { PendingPermissions } from './permission-gateway.js';
import { sseEvent } from './sse-utils.js';

const CURSOR_AGENT_ENV = process.env.CTI_CURSOR_AGENT_EXECUTABLE;

/** Max conversation history messages to include in prompt (0 = none). Default 20 (~10 turns) to balance context vs tokens. */
function getMaxHistoryMessages(): number {
  const raw = process.env.CTI_CURSOR_MAX_HISTORY_MESSAGES;
  if (raw === undefined || raw === '') return 20;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? 20 : n;
}

/**
 * Resolve path to Cursor Agent CLI.
 * Tries: CTI_CURSOR_AGENT_EXECUTABLE, then `agent` and `cursor` in PATH, then common locations.
 */
export function resolveCursorAgentPath(): string | null {
  if (CURSOR_AGENT_ENV) {
    return CURSOR_AGENT_ENV;
  }
  try {
    for (const cmd of ['agent', 'cursor']) {
      try {
        const out = execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 2000 }).trim().split('\n')[0];
        if (out) return out;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  const home = os.homedir();
  const candidates = [
    `${home}/.cursor/bin/agent`,
    `${home}/.local/bin/agent`,
    '/usr/local/bin/agent',
    '/opt/homebrew/bin/agent',
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      continue;
    }
  }
  return null;
}

/** Probe `agent --help` once to discover supported flags. */
function detectCapabilities(agentPath: string): { supportsTrust: boolean; supportsForce: boolean; supportsSandbox: boolean } {
  try {
    const help = execSync(`"${agentPath}" --help`, { encoding: 'utf-8', timeout: 5000 });
    return {
      supportsTrust: help.includes('--trust'),
      supportsForce: help.includes('--force'),
      supportsSandbox: help.includes('--sandbox'),
    };
  } catch {
    return { supportsTrust: false, supportsForce: false, supportsSandbox: false };
  }
}

/** Map Cursor CLI --mode to agent flag */
function toCursorMode(permissionMode?: string): string | undefined {
  if (!permissionMode) return undefined;
  const m = permissionMode.toLowerCase();
  if (m === 'plan') return 'plan';
  if (m === 'ask') return 'ask';
  return undefined; // agent = default
}

export class CursorCLIProvider implements LLMProvider {
  private caps: { supportsTrust: boolean; supportsForce: boolean; supportsSandbox: boolean };

  constructor(
    private _pendingPerms: PendingPermissions,
    private agentPath: string,
  ) {
    this.caps = detectCapabilities(agentPath);
    console.log(`[ide-im] Cursor CLI capabilities: trust=${this.caps.supportsTrust}, force=${this.caps.supportsForce}, sandbox=${this.caps.supportsSandbox}`);
  }

  streamChat(params: StreamChatParams): ReadableStream<string> {
    const self = this;
    const agentPath = this.agentPath;

    return new ReadableStream<string>({
      start(controller) {
        (async () => {
          const cwd = params.workingDirectory || process.cwd();
          const mode = toCursorMode(params.permissionMode);
          // Build conversation body: include recent history only to limit token use (configurable via CTI_CURSOR_MAX_HISTORY_MESSAGES).
          const maxHistory = getMaxHistoryMessages();
          const rawHistory = params.conversationHistory ?? [];
          const history = maxHistory > 0 && rawHistory.length > 0
            ? rawHistory.slice(-maxHistory)
            : [];
          const historyBlock = history.length > 0
            ? history
                .map((m) => (m.role === 'user' ? `**User:**\n\n${m.content}` : `**Assistant:**\n\n${m.content}`))
                .join('\n\n')
            : '';
          const currentTurn = `**User:**\n\n${params.prompt}`;
          const conversationBody = historyBlock ? `${historyBlock}\n\n${currentTurn}` : currentTurn;
          // Bridge passes session system_prompt (identity/memory from AGENTS.md, SOUL.md, etc.).
          // Cursor CLI has no --system-prompt; prepend so the agent sees instructions first.
          const promptText =
            params.systemPrompt && params.systemPrompt.trim()
              ? `${params.systemPrompt.trim()}\n\n---\n\n${conversationBody}`
              : conversationBody;
          const args = [
            '-p',
            promptText,
            '--output-format',
            'stream-json',
            '--stream-partial-output',
            '--workspace',
            cwd,
          ];
          if (self.caps.supportsTrust) {
            args.push('--trust');
          }
          const sandboxMode = process.env.CTI_CURSOR_SANDBOX;
          if (self.caps.supportsSandbox && sandboxMode && (sandboxMode === 'enabled' || sandboxMode === 'disabled')) {
            args.push('--sandbox', sandboxMode);
          }
          if (mode) {
            args.push('--mode', mode);
          }
          if (params.model) {
            args.push('--model', params.model);
          }

          const proc = spawn(agentPath, args, {
            cwd,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let stderrBuf = '';

          proc.stderr?.on('data', (chunk: Buffer) => {
            stderrBuf += chunk.toString();
          });

          // Cursor CLI --stream-partial-output emits assistant events as TRUE deltas
          // (each event has only the new text fragment), EXCEPT the very last assistant
          // event before `result` which duplicates the full accumulated text.
          // We accumulate emitted text and skip any event whose content equals the
          // already-accumulated total (the final duplicate).
          let accumulatedText = '';

          proc.stdout?.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter((l: string) => l.trim());
            for (const line of lines) {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                const type = event.type as string;
                if (type === 'assistant') {
                  const msg = event.message as { content?: Array<{ type?: string; text?: string }> };
                  const content = msg?.content ?? [];
                  const fragment = content
                    .filter(b => b?.type === 'text' && typeof b.text === 'string')
                    .map(b => b!.text!)
                    .join('');

                  if (!fragment) continue;

                  // Skip if this event is just the full accumulated text repeated
                  if (fragment === accumulatedText) continue;

                  // If it starts with what we've accumulated, it's a "full text" duplicate
                  // — emit only the new suffix
                  if (fragment.startsWith(accumulatedText) && accumulatedText.length > 0) {
                    const delta = fragment.slice(accumulatedText.length);
                    if (delta) {
                      accumulatedText = fragment;
                      controller.enqueue(sseEvent('text', delta));
                    }
                    continue;
                  }

                  // Normal delta: emit as-is and append
                  accumulatedText += fragment;
                  controller.enqueue(sseEvent('text', fragment));
                } else if (type === 'tool_call') {
                  accumulatedText = '';
                  const subtype = event.subtype as string;
                  const callId = (event.call_id as string) || `cursor-${Date.now()}`;
                  const toolCall = event.tool_call as Record<string, unknown>;
                  if (subtype === 'started') {
                    const name = toolCall?.readToolCall ? 'Read' : toolCall?.writeToolCall ? 'Edit' : 'Bash';
                    const input = (toolCall?.readToolCall as { args?: unknown })?.args
                      ?? (toolCall?.writeToolCall as { args?: unknown })?.args
                      ?? toolCall;
                    controller.enqueue(sseEvent('tool_use', { id: callId, name, input }));
                  } else if (subtype === 'completed') {
                    const readResult = (toolCall?.readToolCall as { result?: { success?: { content?: string } } })?.result?.success?.content;
                    const writeResult = (toolCall?.writeToolCall as { result?: { success?: { path?: string } } })?.result?.success;
                    const content = readResult ?? (writeResult ? `Wrote ${writeResult.path ?? 'file'}` : 'Done');
                    controller.enqueue(sseEvent('tool_result', {
                      tool_use_id: callId,
                      content: typeof content === 'string' ? content : JSON.stringify(content),
                      is_error: false,
                    }));
                  }
                } else if (type === 'result' && event.subtype === 'success') {
                  // Terminal event; assistant text already streamed from type=assistant
                  // Optionally emit session_id for resume: event.session_id
                }
              } catch {
                // skip malformed lines
              }
            }
          });

          proc.on('error', (err: Error) => {
            console.error('[ide-im] spawn error:', err.message);
            controller.enqueue(sseEvent('error', err.message));
            controller.close();
          });

          proc.on('close', (code: number | null) => {
            if (code !== 0 && code !== null && stderrBuf) {
              console.error('[ide-im] exit', code, stderrBuf.trim());
              try {
                controller.enqueue(sseEvent('error', stderrBuf.trim()));
              } catch {
                // already closed
              }
            }
            controller.close();
          });

          params.abortController?.signal?.addEventListener('abort', () => {
            proc.kill('SIGTERM');
          });
        })();
      },
    });
  }
}
