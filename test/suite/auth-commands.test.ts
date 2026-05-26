import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockShowQuickPick,
  mockShowInputBox,
  mockShowInformationMessage,
  mockOpenExternal,
  mockRegisterCommand,
} = vi.hoisted(() => ({
  mockShowQuickPick: vi.fn(),
  mockShowInputBox: vi.fn(),
  mockShowInformationMessage: vi.fn(),
  mockOpenExternal: vi.fn(async () => true),
  mockRegisterCommand: vi.fn((_command: string, handler: (...args: unknown[]) => unknown) => ({
    dispose: () => undefined,
    handler,
  })),
}));

vi.mock('vscode', () => ({
  Uri: {
    parse: (value: string) => ({ toString: () => value }),
  },
  window: {
    showQuickPick: mockShowQuickPick,
    showInputBox: mockShowInputBox,
    showInformationMessage: mockShowInformationMessage,
  },
  env: {
    openExternal: mockOpenExternal,
  },
  commands: {
    registerCommand: mockRegisterCommand,
  },
}));

vi.mock('../../src/config/settings', () => ({
  getDashboardUrl: () => 'https://app.gramatr.com',
}));

import { registerAuthCommands } from '../../src/auth/commands';

function createDeps() {
  return {
    tokenStore: {
      setToken: vi.fn(async () => undefined),
      clearStoredToken: vi.fn(async () => undefined),
    },
    trace: {
      add: vi.fn(),
    },
    outputChannel: {
      appendLine: vi.fn(),
    },
  };
}

describe('registerAuthCommands', () => {
  beforeEach(() => {
    mockShowQuickPick.mockReset();
    mockShowInputBox.mockReset();
    mockShowInformationMessage.mockReset();
    mockOpenExternal.mockReset();
    mockOpenExternal.mockResolvedValue(true);
    mockRegisterCommand.mockClear();
  });

  it('stores an API key from the quick pick flow', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);

    const connectHandler = mockRegisterCommand.mock.calls.find(call => call[0] === 'gramatr.connectAccount')?.[1];
    mockShowQuickPick.mockResolvedValueOnce({ action: 'paste-token' });
    mockShowInputBox.mockResolvedValueOnce('gramatr_sk_test');

    await connectHandler();

    expect(deps.tokenStore.setToken).toHaveBeenCalledWith('gramatr_sk_test');
    expect(deps.trace.add).toHaveBeenCalledWith('auth', 'API key stored securely', undefined, 'success');
  });

  it('opens the dashboard from the dedicated command', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);

    const openHandler = mockRegisterCommand.mock.calls.find(call => call[0] === 'gramatr.openDashboard')?.[1];

    await openHandler();

    expect(mockOpenExternal).toHaveBeenCalled();
    expect(deps.trace.add).toHaveBeenCalledWith(
      'auth',
      'Opened dashboard login page',
      'https://app.gramatr.com/login',
      'success'
    );
  });

  it('clears stored auth from the dedicated command', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);

    const clearHandler = mockRegisterCommand.mock.calls.find(call => call[0] === 'gramatr.clearAuth')?.[1];

    await clearHandler();

    expect(deps.tokenStore.clearStoredToken).toHaveBeenCalled();
    expect(deps.trace.add).toHaveBeenCalledWith('auth', 'Stored API key cleared', undefined, 'warning');
  });
});
