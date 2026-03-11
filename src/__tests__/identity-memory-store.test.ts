import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonFileStore } from '../store.js';
import { IdentityMemoryStore } from '../identity-memory-store.js';

function makeSettings(workDir: string): Map<string, string> {
  return new Map([
    ['remote_bridge_enabled', 'true'],
    ['bridge_default_work_dir', workDir],
    ['bridge_default_model', 'test-model'],
    ['bridge_default_mode', 'code'],
  ]);
}

describe('IdentityMemoryStore', () => {
  let identityRoot: string;
  let workDir: string;

  beforeEach(() => {
    identityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-im-identity-'));
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-im-work-'));
  });

  afterEach(() => {
    try { fs.rmSync(identityRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('delegates createSession with explicit systemPrompt without reading files', () => {
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(undefined, inner);
    const session = store.createSession('n', 'm', 'custom prompt', workDir, 'code');
    assert.ok(session.id);
    assert.equal(session.system_prompt, 'custom prompt');
  });

  it('injects composed prompt when systemPrompt is undefined and SOUL.md exists', () => {
    fs.writeFileSync(path.join(identityRoot, 'SOUL.md'), 'Be helpful and concise.', 'utf-8');
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);
    const session = store.createSession('n', 'm', undefined, identityRoot, 'code');
    assert.ok(session.system_prompt?.includes('SOUL'));
    assert.ok(session.system_prompt?.includes('Be helpful and concise.'));
  });

  it('injects MEMORY.md when present', () => {
    fs.writeFileSync(path.join(identityRoot, 'MEMORY.md'), '- User prefers TypeScript.', 'utf-8');
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);
    const session = store.createSession('n', 'm', undefined, identityRoot, 'code');
    assert.ok(session.system_prompt?.includes('Long-term memory'));
    assert.ok(session.system_prompt?.includes('User prefers TypeScript'));
  });

  it('uses cwd as identity root when identityDir is undefined', () => {
    fs.writeFileSync(path.join(workDir, 'SOUL.md'), 'Workspace soul.', 'utf-8');
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(undefined, inner);
    const session = store.createSession('n', 'm', undefined, workDir, 'code');
    assert.ok(session.system_prompt?.includes('Workspace soul.'));
  });

  it('prefers identityDir over cwd when both set', () => {
    fs.writeFileSync(path.join(identityRoot, 'SOUL.md'), 'Global soul.', 'utf-8');
    fs.writeFileSync(path.join(workDir, 'SOUL.md'), 'Workspace soul.', 'utf-8');
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);
    const session = store.createSession('n', 'm', undefined, workDir, 'code');
    assert.ok(session.system_prompt?.includes('Global soul.'));
    assert.ok(!session.system_prompt?.includes('Workspace soul.'));
  });

  it('getSession returns session with system_prompt composed from identity root', () => {
    fs.writeFileSync(path.join(identityRoot, 'SOUL.md'), 'Soul content for getSession.', 'utf-8');
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);
    const created = store.createSession('n', 'm', undefined, identityRoot, 'code');
    assert.ok(created.system_prompt?.includes('Soul content for getSession.'));

    const fetched = store.getSession(created.id);
    assert.ok(fetched);
    assert.ok(fetched!.system_prompt?.includes('Soul content for getSession.'));
  });

  it('delegates all other methods to inner store', () => {
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);

    assert.equal(store.getSetting('bridge_default_model'), 'test-model');
    const session = store.createSession('n', 'm', 'custom', workDir, 'code');
    assert.ok(session.id);
    assert.equal(session.system_prompt, 'custom');
    const fetched = store.getSession(session.id);
    assert.ok(fetched);
    // getSession always recomputes from identity root (workspace notice + files), so prompt includes workspace path
    assert.ok(fetched!.system_prompt?.includes('Your workspace (identity root) is:'));
  });

  it('skips missing files without error', () => {
    const inner = new JsonFileStore(makeSettings(workDir));
    const store = new IdentityMemoryStore(identityRoot, inner);
    const session = store.createSession('n', 'm', undefined, identityRoot, 'code');
    assert.ok(session.id);
    // With no identity files we still get the workspace (identity root) notice so the agent knows where it is
    assert.ok(session.system_prompt?.includes('Your workspace (identity root) is:'));
    assert.ok(session.system_prompt?.includes(identityRoot));
  });
});
