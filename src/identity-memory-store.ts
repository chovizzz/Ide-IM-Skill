/**
 * Store wrapper that injects OpenClaw-style identity and memory into session system_prompt.
 *
 * On createSession (when systemPrompt is not provided), reads from identity_root:
 * AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md, memory/YYYY-MM-DD (yesterday + today),
 * composes them with section headers, and passes the result as system_prompt.
 * On getSession, optionally re-computes system_prompt from disk so edits to those files
 * take effect without creating a new session.
 */

import fs from 'node:fs';
import path from 'node:path';
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

const MAX_FILE_CHARS = 512 * 1024;
const IDENTITY_FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md'] as const;

function isWithinRoot(root: string, resolvedPath: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedPath = path.resolve(resolvedPath);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + path.sep);
}

function safeRead(rootDir: string, relativePath: string): string {
  if (!rootDir) return '';
  const resolved = path.resolve(rootDir, relativePath);
  if (!isWithinRoot(rootDir, resolved)) return '';
  try {
    const raw = fs.readFileSync(resolved, 'utf-8');
    return raw.length > MAX_FILE_CHARS ? raw.slice(0, MAX_FILE_CHARS) + '\n\n[... truncated ...]' : raw;
  } catch {
    return '';
  }
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function composeIdentityPrompt(identityRoot: string): string {
  const parts: string[] = [];
  // Tell the agent where its workspace (identity root) is, like OpenClaw session start.
  const workspaceNotice =
    `Your workspace (identity root) is: ${identityRoot}\n` +
    `All identity and memory files (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, MEMORY.md, memory/YYYY-MM-DD.md) live here. Read them at session start and update them as needed.`;
  parts.push(`## Workspace (identity root)\n\n${workspaceNotice}`);
  for (const file of IDENTITY_FILES) {
    const content = safeRead(identityRoot, file).trim();
    if (!content) continue;
    const sectionTitle =
      file === 'AGENTS.md' ? 'AGENTS (operating instructions)' :
      file === 'SOUL.md' ? 'SOUL (behavior / philosophy)' :
      file === 'IDENTITY.md' ? 'IDENTITY (presentation)' :
      file === 'USER.md' ? 'USER (who the user is)' :
      file === 'TOOLS.md' ? 'TOOLS (local notes)' :
      'Long-term memory';
    parts.push(`## ${sectionTitle}\n\n${content}`);
  }
  const now = new Date();
  const today = dateString(now);
  const yesterday = dateString(new Date(now.getTime() - 86400 * 1000));
  for (const d of [yesterday, today]) {
    const content = safeRead(identityRoot, path.join('memory', `${d}.md`)).trim();
    if (!content) continue;
    const label = d === yesterday ? 'yesterday' : 'today';
    parts.push(`## Memory: ${d} (${label})\n\n${content}`);
  }
  return parts.join('\n\n');
}

export class IdentityMemoryStore implements BridgeStore {
  constructor(
    private readonly identityDir: string | undefined,
    private readonly inner: BridgeStore,
  ) {}

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
    const session = this.inner.getSession(id);
    if (!session) return null;
    const identityRoot = this.identityDir || session.working_directory || '';
    const composed = composeIdentityPrompt(identityRoot).trim();
    if (!composed) return session;
    return { ...session, system_prompt: composed };
  }

  createSession(
    name: string,
    model: string,
    systemPrompt?: string,
    cwd?: string,
    mode?: string,
  ): BridgeSession {
    if (systemPrompt != null && systemPrompt !== '') {
      return this.inner.createSession(name, model, systemPrompt, cwd, mode);
    }
    const identityRoot = this.identityDir || cwd || this.inner.getSetting('bridge_default_work_dir') || '';
    const composed = composeIdentityPrompt(identityRoot).trim();
    return this.inner.createSession(name, model, composed || undefined, cwd, mode);
  }

  updateSessionProviderId(sessionId: string, providerId: string): void {
    this.inner.updateSessionProviderId(sessionId, providerId);
  }
  addMessage(sessionId: string, role: string, content: string, usage?: string | null): void {
    this.inner.addMessage(sessionId, role, content, usage);
  }
  /** Forward to JsonFileStore when present (memory compression). */
  truncateSessionMessages(sessionId: string, keepLast: number): void {
    const j = this.inner as { truncateSessionMessages?: (s: string, k: number) => void };
    if (typeof j.truncateSessionMessages === 'function') {
      j.truncateSessionMessages(sessionId, keepLast);
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
