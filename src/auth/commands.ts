import * as vscode from 'vscode';
import { getDashboardUrl } from '../config/settings';
import type { TraceStore } from '../trace/store';
import { TokenStore } from './token-store';

export function registerAuthCommands(
  tokenStore: TokenStore,
  trace: TraceStore,
  outputChannel: vscode.OutputChannel
): vscode.Disposable[] {
  const connectCommand = vscode.commands.registerCommand('gramatr.connectAccount', async () => {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: 'Sign In Via Dashboard',
          description: 'Use the Firebase-backed gramatr login flow in the dashboard',
          action: 'open-dashboard' as const,
        },
        {
          label: 'Paste Existing API Key',
          description: 'Fallback for automation or headless use',
          action: 'paste-token' as const,
        },
        {
          label: 'Clear Saved API Key',
          description: 'Remove the locally stored API key for this extension',
          action: 'clear-token' as const,
        },
      ],
      {
        title: 'Connect gramatr',
        placeHolder: 'Choose how to authenticate the extension',
      }
    );

    if (!choice) {
      return;
    }

    if (choice.action === 'open-dashboard') {
      await openDashboard(trace, outputChannel);
      return;
    }

    if (choice.action === 'paste-token') {
      await promptForApiKey(tokenStore, trace, outputChannel);
      return;
    }

    await clearStoredToken(tokenStore, trace, outputChannel);
  });

  const setApiKeyCommand = vscode.commands.registerCommand('gramatr.setApiKey', async () => {
    await promptForApiKey(tokenStore, trace, outputChannel);
  });

  const clearAuthCommand = vscode.commands.registerCommand('gramatr.clearAuth', async () => {
    await clearStoredToken(tokenStore, trace, outputChannel);
  });

  const openDashboardCommand = vscode.commands.registerCommand('gramatr.openDashboard', async () => {
    await openDashboard(trace, outputChannel);
  });

  return [connectCommand, setApiKeyCommand, clearAuthCommand, openDashboardCommand];
}

async function promptForApiKey(
  tokenStore: TokenStore,
  trace: TraceStore,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const token = await vscode.window.showInputBox({
    title: 'Save gramatr API key',
    prompt: 'Paste a gramatr API key. It will be stored in VS Code Secret Storage.',
    placeHolder: 'gramatr_sk_...',
    password: true,
    ignoreFocusOut: true,
    validateInput: value => value.trim().length === 0 ? 'API key cannot be empty.' : undefined,
  });

  if (token === undefined) {
    return;
  }

  await tokenStore.setToken(token);
  trace.add('auth', 'API key stored securely', undefined, 'success');
  outputChannel.appendLine('gramatr API key saved to VS Code Secret Storage.');
  vscode.window.showInformationMessage('gramatr API key saved securely.');
}

async function clearStoredToken(
  tokenStore: TokenStore,
  trace: TraceStore,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  await tokenStore.clearStoredToken();
  trace.add('auth', 'Stored API key cleared', undefined, 'warning');
  outputChannel.appendLine('gramatr stored API key cleared.');
  vscode.window.showInformationMessage('gramatr stored API key cleared.');
}

async function openDashboard(
  trace: TraceStore,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const dashboardUrl = new URL('/login', ensureTrailingSlash(getDashboardUrl())).toString();
  await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
  trace.add('auth', 'Opened dashboard login page', dashboardUrl, 'success');
  outputChannel.appendLine(`Opened dashboard: ${dashboardUrl}`);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
