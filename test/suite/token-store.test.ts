import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConfig = {
  get: vi.fn(),
  update: vi.fn(async () => undefined),
};

vi.mock('vscode', () => ({
  ConfigurationTarget: {
    Global: 1,
  },
  workspace: {
    getConfiguration: vi.fn(() => mockConfig),
  },
}));

import { TokenStore } from '../../src/auth/token-store';

function createSecrets() {
  const values = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => values.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

describe('TokenStore', () => {
  beforeEach(() => {
    mockConfig.get.mockReset();
    mockConfig.update.mockReset();
    mockConfig.update.mockResolvedValue(undefined);
    delete process.env['GRAMATR_TOKEN'];
  });

  it('prefers secret storage over legacy settings', async () => {
    const secrets = createSecrets();
    const store = new TokenStore(secrets as any);

    mockConfig.get.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'token') return 'legacy-token';
      return defaultValue;
    });
    await secrets.store('gramatr.token', 'secure-token');

    await expect(store.getToken()).resolves.toBe('secure-token');
    await expect(store.getTokenSource()).resolves.toBe('secretStorage');
  });

  it('falls back to environment token when nothing is stored', async () => {
    const secrets = createSecrets();
    const store = new TokenStore(secrets as any);

    mockConfig.get.mockImplementation((_key: string, defaultValue: unknown) => defaultValue);
    process.env['GRAMATR_TOKEN'] = 'env-token';

    await expect(store.getToken()).resolves.toBe('env-token');
    await expect(store.getTokenSource()).resolves.toBe('environment');
  });

  it('migrates legacy settings into secret storage', async () => {
    const secrets = createSecrets();
    const store = new TokenStore(secrets as any);

    mockConfig.get.mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'token') return 'legacy-token';
      return defaultValue;
    });

    await expect(store.migrateLegacyToken()).resolves.toBe(true);
    expect(secrets.store).toHaveBeenCalledWith('gramatr.token', 'legacy-token');
    expect(mockConfig.update).toHaveBeenCalledWith('token', '', 1);
  });

  it('clears stored secrets and legacy setting state', async () => {
    const secrets = createSecrets();
    const store = new TokenStore(secrets as any);

    await store.clearStoredToken();

    expect(secrets.delete).toHaveBeenCalledWith('gramatr.token');
    expect(mockConfig.update).toHaveBeenCalledWith('token', '', 1);
  });
});