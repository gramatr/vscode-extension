// gramatr VS Code Extension — Auth Commands Extended Tests
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

function findHandler(commandName: string) {
  return mockRegisterCommand.mock.calls.find(call => call[0] === commandName)?.[1];
}

describe('registerAuthCommands (extended)', () => {
  beforeEach(() => {
    mockShowQuickPick.mockReset();
    mockShowInputBox.mockReset();
    mockShowInformationMessage.mockReset();
    mockOpenExternal.mockReset();
    mockOpenExternal.mockResolvedValue(true);
    mockRegisterCommand.mockClear();
  });

  it('returns array of disposables', () => {
    const deps = createDeps();
    const disposables = registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    expect(disposables).toHaveLength(4);
  });

  it('handles user cancelling quick pick', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.connectAccount');
    mockShowQuickPick.mockResolvedValueOnce(undefined);

    await handler();

    expect(deps.tokenStore.setToken).not.toHaveBeenCalled();
    expect(deps.tokenStore.clearStoredToken).not.toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('opens dashboard via quick pick open-dashboard action', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.connectAccount');
    mockShowQuickPick.mockResolvedValueOnce({ action: 'open-dashboard' });

    await handler();

    expect(mockOpenExternal).toHaveBeenCalled();
    expect(deps.outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('dashboard'));
  });

  it('clears token via quick pick clear-token action', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.connectAccount');
    mockShowQuickPick.mockResolvedValueOnce({ action: 'clear-token' });

    await handler();

    expect(deps.tokenStore.clearStoredToken).toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('cleared'));
  });

  it('handles user cancelling input box for API key', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.connectAccount');
    mockShowQuickPick.mockResolvedValueOnce({ action: 'paste-token' });
    mockShowInputBox.mockResolvedValueOnce(undefined);

    await handler();

    expect(deps.tokenStore.setToken).not.toHaveBeenCalled();
  });

  it('sets API key via dedicated setApiKey command', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.setApiKey');
    mockShowInputBox.mockResolvedValueOnce('gramatr_sk_dedicated');

    await handler();

    expect(deps.tokenStore.setToken).toHaveBeenCalledWith('gramatr_sk_dedicated');
    expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('saved'));
    expect(deps.outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('saved'));
  });

  it('handles user cancelling setApiKey command', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.setApiKey');
    mockShowInputBox.mockResolvedValueOnce(undefined);

    await handler();

    expect(deps.tokenStore.setToken).not.toHaveBeenCalled();
  });

  it('clearAuth shows information message', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.clearAuth');

    await handler();

    expect(deps.tokenStore.clearStoredToken).toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('cleared'));
    expect(deps.outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('cleared'));
  });

  it('openDashboard adds trace and opens URL', async () => {
    const deps = createDeps();
    registerAuthCommands(deps.tokenStore as any, deps.trace as any, deps.outputChannel as any);
    const handler = findHandler('gramatr.openDashboard');

    await handler();

    expect(mockOpenExternal).toHaveBeenCalled();
    expect(deps.trace.add).toHaveBeenCalledWith(
      'auth', 'Opened dashboard login page', expect.stringContaining('/login'), 'success'
    );
    expect(deps.outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('dashboard'));
  });
});
