/**
 * After enough turns, summarizes the session into identity MEMORY.md and truncates stored messages.
 * Next turns still get long-term context via IdentityMemoryStore (MEMORY.md in system prompt).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LLMProvider } from 'claude-to-im/src/lib/bridge/host.js';
import type {
  BridgeStore,
  BridgeSession,
  BridgeMessage,
  UpsertChannelBindingInput,
  AuditLogInput,
  PermissionLinkInput,
  PermissionLinkRecord,
  OutboundRefInput,
} from 'claude-to-im/src/lib/bridge/host.js';
import type { ChannelBinding, ChannelType } from 'claude-to-im/src/lib/bridge/types.js';
import type { IdentityMemoryStore } from './identity-memory-store.js';

const MAX_TRANSCRIPT_CHARS = 100_000;

function stripAttachmentMarkers(content: string): string {
  return content.replace(/<!--files:[\s\S]*?-->/g, '[attachment]').slice(0, 8000);
}

async function collectStreamText(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      for (const line of value.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload) as { type?: string; data?: string };
          if (j.type === 'text' && typeof j.data === 'string') out += j.data;
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return out.trim();
}

export class MemoryCompressionStore implements BridgeStore {
  private compressing = new Set<string>();

  constructor(
    private readonly inner: IdentityMemoryStore,
    private readonly llm: LLMProvider,
    private readonly identityDir: string,
    private readonly threshold: number,
    private readonly keepAfter: number,
  ) {}

  private async runCompress(sessionId: string): Promise<void> {
    if (this.threshold <= 0 || this.compressing.has(sessionId)) return;
    const { messages } = this.inner.getMessages(sessionId, { limit: 10_000 });
    if (messages.length < this.threshold) return;

    this.compressing.add(sessionId);
    try {
      const transcript = messages
        .map((m) => `${m.role.toUpperCase()}: ${stripAttachmentMarkers(m.content)}`)
        .join('\n\n')
        .slice(0, MAX_TRANSCRIPT_CHARS);

      const prompt = `You are archiving an IM session into long-term memory.

Conversation transcript:
---
${transcript}
---

Output ONLY markdown bullet lines (each line starts with "- "). Capture: user goals, decisions, names, preferences, open tasks, and facts to remember for future chats. No preamble, no code fences. Max ~40 bullets.`;

      const abort = new AbortController();
      const stream = this.llm.streamChat({
        prompt,
        sessionId: `compress-${sessionId}`,
        workingDirectory: this.identityDir,
        permissionMode: 'ask',
        abortController: abort,
        conversationHistory: [],
      });

      const summary = await collectStreamText(stream);
      if (!summary || summary.length < 20) {
        console.warn('[ide-im] memory-compress: empty summary, truncating anyway');
      }

      const memoryPath = path.join(this.identityDir, 'MEMORY.md');
      fs.mkdirSync(this.identityDir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 10);
      const block = `\n\n## Session archive ${stamp}\n\n${summary || '(summary failed — truncated only)'}\n`;
      fs.appendFileSync(memoryPath, block, 'utf-8');
      this.inner.truncateSessionMessages(sessionId, this.keepAfter);
      console.log(
        `[ide-im] memory-compress: session ${sessionId.slice(0, 8)}… → MEMORY.md, kept ${this.keepAfter} msgs`,
      );
    } catch (e) {
      console.error('[ide-im] memory-compress failed:', e instanceof Error ? e.message : e);
    } finally {
      this.compressing.delete(sessionId);
    }
  }

  getSetting(key: string): string | null {
    return this.inner.getSetting(key);
  }
  getChannelBinding(channelType: string, chatId: string): ChannelBinding | null {
    return this.inner.getChannelBinding(channelType, chatId);
  }
  upsertChannelBinding(data: UpsertChannelBindingInput): ChannelBinding {
    return this.inner.upsertChannelBinding(data);
  }
  updateChannelBinding(id: string, updates: Partial<ChannelBinding>): void {
    this.inner.updateChannelBinding(id, updates);
  }
  listChannelBindings(channelType?: ChannelType): ChannelBinding[] {
    return this.inner.listChannelBindings(channelType);
  }
  getSession(id: string): BridgeSession | null {
    return this.inner.getSession(id);
  }
  createSession(
    name: string,
    model: string,
    systemPrompt?: string,
    cwd?: string,
    mode?: string,
  ): BridgeSession {
    return this.inner.createSession(name, model, systemPrompt, cwd, mode);
  }
  updateSessionProviderId(sessionId: string, providerId: string): void {
    this.inner.updateSessionProviderId(sessionId, providerId);
  }
  addMessage(sessionId: string, role: string, content: string, usage?: string | null): void {
    this.inner.addMessage(sessionId, role, content, usage);
    if (role === 'assistant' && this.threshold > 0) {
      setImmediate(() => {
        void this.runCompress(sessionId);
      });
    }
  }
  getMessages(sessionId: string, opts?: { limit?: number }): { messages: BridgeMessage[] } {
    return this.inner.getMessages(sessionId, opts);
  }
  acquireSessionLock(sessionId: string, lockId: string, owner: string, ttlSecs: number): boolean {
    return this.inner.acquireSessionLock(sessionId, lockId, owner, ttlSecs);
  }
  renewSessionLock(sessionId: string, lockId: string, ttlSecs: number): void {
    this.inner.renewSessionLock(sessionId, lockId, ttlSecs);
  }
  releaseSessionLock(sessionId: string, lockId: string): void {
    this.inner.releaseSessionLock(sessionId, lockId);
  }
  setSessionRuntimeStatus(sessionId: string, status: string): void {
    this.inner.setSessionRuntimeStatus(sessionId, status);
  }
  updateSdkSessionId(sessionId: string, sdkSessionId: string): void {
    this.inner.updateSdkSessionId(sessionId, sdkSessionId);
  }
  updateSessionModel(sessionId: string, model: string): void {
    this.inner.updateSessionModel(sessionId, model);
  }
  syncSdkTasks(sessionId: string, todos: unknown): void {
    this.inner.syncSdkTasks(sessionId, todos);
  }
  getProvider(id: string) {
    return this.inner.getProvider(id);
  }
  getDefaultProviderId(): string | null {
    return this.inner.getDefaultProviderId();
  }
  insertAuditLog(entry: AuditLogInput): void {
    this.inner.insertAuditLog(entry);
  }
  checkDedup(key: string): boolean {
    return this.inner.checkDedup(key);
  }
  insertDedup(key: string): void {
    this.inner.insertDedup(key);
  }
  cleanupExpiredDedup(): void {
    this.inner.cleanupExpiredDedup();
  }
  insertOutboundRef(ref: OutboundRefInput): void {
    this.inner.insertOutboundRef(ref);
  }
  insertPermissionLink(link: PermissionLinkInput): void {
    this.inner.insertPermissionLink(link);
  }
  getPermissionLink(permissionRequestId: string): PermissionLinkRecord | null {
    return this.inner.getPermissionLink(permissionRequestId);
  }
  markPermissionLinkResolved(permissionRequestId: string): boolean {
    return this.inner.markPermissionLinkResolved(permissionRequestId);
  }
  listPendingPermissionLinksByChat(chatId: string): PermissionLinkRecord[] {
    return this.inner.listPendingPermissionLinksByChat(chatId);
  }
  getChannelOffset(key: string): string {
    return this.inner.getChannelOffset(key);
  }
  setChannelOffset(key: string, offset: string): void {
    this.inner.setChannelOffset(key, offset);
  }
}
