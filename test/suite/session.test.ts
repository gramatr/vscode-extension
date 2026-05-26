// gramatr VS Code Extension — SessionManager Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockStat = vi.fn();
const mockCreateDirectory = vi.fn();

// Mock vscode module
vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];

    readonly event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(value: T): void {
      this.listeners.forEach(listener => listener(value));
    }

    dispose(): void {
      this.listeners = [];
    }
  }

  return {
    EventEmitter,
    extensions: {
      getExtension: () => null, // No git extension in tests
    },
    workspace: {
      workspaceFolders: [{ name: 'gramatr', uri: { fsPath: '/workspace/gramatr' } }],
      fs: {
        readFile: (...args: unknown[]) => mockReadFile(...args),
        writeFile: (...args: unknown[]) => mockWriteFile(...args),
        stat: (...args: unknown[]) => mockStat(...args),
        createDirectory: (...args: unknown[]) => mockCreateDirectory(...args),
      },
    },
    Uri: {
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [base.fsPath, ...segments].join('/'),
      }),
    },
  };
});

// Mock crypto.randomUUID
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
}));

import { SessionManager } from '../../src/session/manager';
import type { GramatrClient } from '../../src/router/client';

function createMockClient() {
  return {
    sessionStart: vi.fn().mockResolvedValue({
      entity_id: 'ent-abc',
      interaction_id: 'int-def',
      session_id: 'sess-ghi',
      project_id: 'uuid-from-server',
      project_slug: 'gramatr',
    }),
    sessionEnd: vi.fn().mockResolvedValue(true),
    loadHandoff: vi.fn().mockResolvedValue({
      where_we_are: 'main branch, last commit abc123',
      what_shipped: '1. Feature A',
      whats_next: '1. Feature B',
      key_context: 'Uses pgvector for embeddings',
      dont_forget: 'Run migrations after checkout',
    }),
    saveHandoff: vi.fn().mockResolvedValue(true),
  };
}

function createMockGlobalState() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      return (store.get(key) as T) ?? defaultValue;
    },
    update: vi.fn(async (key: string, value: unknown) => {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }),
    keys: () => [...store.keys()],
    setKeysForSync: vi.fn(),
  };
}

describe('SessionManager', () => {
  let client: ReturnType<typeof createMockClient>;
  let globalState: ReturnType<typeof createMockGlobalState>;

  beforeEach(() => {
    client = createMockClient();
    globalState = createMockGlobalState();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockStat.mockReset();
    mockCreateDirectory.mockReset();
    // Default: no project.json exists
    mockReadFile.mockRejectedValue(new Error('File not found'));
    mockStat.mockResolvedValue({});
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('creates a new session with UUID and git context', () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    expect(session.getSessionId()).toBe('test-uuid-1234');
    // Falls back to workspace folder name since git extension is mocked as null
    expect(session.getProjectId()).toBe('gramatr');
    expect(session.getBranch()).toBe('unknown');
  });

  it('registers session with server on start()', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    expect(client.sessionStart).toHaveBeenCalledWith('gramatr', 'test-uuid-1234', undefined);
    expect(client.loadHandoff).toHaveBeenCalledWith('gramatr');
  });

  it('loads handoff on start()', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    const handoff = session.getHandoff();
    expect(handoff).not.toBeNull();
    expect(handoff!.where_we_are).toBe('main branch, last commit abc123');
    expect(handoff!.dont_forget).toBe('Run migrations after checkout');
  });

  it('handles server failure gracefully on start()', async () => {
    client.sessionStart.mockRejectedValue(new Error('network'));
    client.loadHandoff.mockRejectedValue(new Error('network'));

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    // Should not throw
    await session.start();

    expect(session.getSessionId()).toBe('test-uuid-1234');
    expect(session.getHandoff()).toBeNull();
  });

  it('persists state for crash recovery', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    // globalState.update should have been called to persist
    expect(globalState.update).toHaveBeenCalled();
    const lastCall = globalState.update.mock.calls[globalState.update.mock.calls.length - 1];
    expect(lastCall[0]).toBe('gramatr.session');
    expect(lastCall[1]).toMatchObject({
      projectId: 'gramatr',
    });
  });

  it('calls sessionEnd on end()', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();
    await session.end();

    expect(client.sessionEnd).toHaveBeenCalledWith('ent-abc');
  });

  it('clears persisted state on end()', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();
    await session.end();

    // Should clear persisted state
    const clearCall = globalState.update.mock.calls.find(
      (call: [string, unknown]) => call[0] === 'gramatr.session' && call[1] === undefined
    );
    expect(clearCall).toBeDefined();
  });

  it('resets session with new ID', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    // Start first so entityId gets set from server response
    await session.start();

    // Reconfigure mock for the second start() call during reset
    client.sessionStart.mockResolvedValueOnce({
      entity_id: 'ent-new',
      interaction_id: 'int-new',
      session_id: 'sess-new',
    });

    await session.reset();

    // Session end should have been called for the old session
    expect(client.sessionEnd).toHaveBeenCalledWith('ent-abc');

    // New session should have the server-assigned ID from the second start
    expect(session.getSessionId()).toBe('sess-new');
  });

  it('provides uptime calculation', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    // startTime is set in constructor, uptime will be very small
    const uptime = session.getUptime();
    expect(uptime).toBe('0m');
  });

  it('reloads handoff on demand', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();
    client.loadHandoff.mockResolvedValueOnce({
      where_we_are: 'updated branch state',
      what_shipped: '1. Feature B',
      whats_next: '1. Feature C',
      key_context: 'Updated context',
      dont_forget: 'Keep tests green',
    });

    const handoff = await session.reloadHandoff();

    expect(handoff?.where_we_are).toBe('updated branch state');
  });

  it('saves a generated handoff through the client', async () => {
    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();
    session.recordFeedbackContext({
      originalPrompt: 'Build Phase 2',
      classification: {
        effort_level: 'standard',
        intent_type: 'create',
      },
    });

    const saved = await session.saveHandoff('Added Phase 2 commands');

    expect(saved).not.toBeNull();
    expect(client.saveHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        what_shipped: '1. Added Phase 2 commands',
      }),
      {
        projectId: 'gramatr',
        sessionId: 'sess-ghi',
        branch: 'unknown',
        platform: 'vscode',
        conversationId: 'int-def',
      }
    );
  });

  it('restores state from globalState on construction', async () => {
    // Pre-populate globalState with persisted session
    await globalState.update('gramatr.session', {
      sessionId: 'restored-session',
      entityId: 'restored-entity',
      interactionId: 'restored-interaction',
      projectId: 'restored/project',
      branch: 'feature-branch',
      startTime: Date.now() - 60000,
    });

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    expect(session.getSessionId()).toBe('restored-session');
    expect(session.getProjectId()).toBe('restored/project');
    expect(session.getBranch()).toBe('feature-branch');
  });

  it('reads project UUID from .gramatr/project.json on start', async () => {
    const content = JSON.stringify({ project_id: 'file-uuid-123', project_slug: 'gramatr' });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    expect(session.getProjectUuid()).toBe('file-uuid-123');
    // Should pass the UUID as third arg to sessionStart
    expect(client.sessionStart).toHaveBeenCalledWith('gramatr', 'test-uuid-1234', 'file-uuid-123');
  });

  it('persists server-returned UUID when no local UUID exists', async () => {
    // No project.json file
    mockReadFile.mockRejectedValue(new Error('File not found'));

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    // Server returned project_id UUID
    expect(session.getProjectUuid()).toBe('uuid-from-server');

    // Should have written project.json
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenBytes = mockWriteFile.mock.calls[0][1] as Uint8Array;
    const written = JSON.parse(new TextDecoder().decode(writtenBytes));
    expect(written.project_id).toBe('uuid-from-server');
    expect(written.project_slug).toBe('gramatr');
  });

  it('does not overwrite local UUID with server UUID', async () => {
    const content = JSON.stringify({ project_id: 'local-uuid', project_slug: 'gramatr' });
    mockReadFile.mockResolvedValue(new TextEncoder().encode(content));

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    // Should keep the local UUID, not overwrite with server
    expect(session.getProjectUuid()).toBe('local-uuid');
    // Should NOT have written project.json since we already had one
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('restores projectUuid from globalState on construction', async () => {
    await globalState.update('gramatr.session', {
      sessionId: 'restored-session',
      entityId: 'restored-entity',
      interactionId: 'restored-interaction',
      projectId: 'restored/project',
      projectUuid: 'restored-uuid',
      branch: 'feature-branch',
      startTime: Date.now() - 60000,
    });

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    expect(session.getProjectUuid()).toBe('restored-uuid');
  });

  it('persists projectUuid in globalState', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));

    const session = new SessionManager(
      client as unknown as GramatrClient,
      globalState as any
    );

    await session.start();

    const lastPersistCall = globalState.update.mock.calls
      .filter((call: [string, unknown]) => call[0] === 'gramatr.session' && call[1] !== undefined)
      .pop();
    expect(lastPersistCall).toBeDefined();
    expect((lastPersistCall![1] as Record<string, unknown>).projectUuid).toBe('uuid-from-server');
  });
});
