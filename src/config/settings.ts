// gramatr VS Code Extension — Configuration Settings
import * as vscode from 'vscode';

export const GRAMATR_SECTION = 'gramatr';

/** Get the gramatr server URL from settings, env var, or default */
export function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  const fromSetting = config.get<string>('serverUrl', '');
  if (fromSetting) {
    return fromSetting;
  }
  return process.env['GMTR_SERVER_URL'] ?? 'https://api.gramatr.com';
}

/** Get dashboard URL from settings or derive it from the API host */
export function getDashboardUrl(): string {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  const fromSetting = config.get<string>('dashboardUrl', '').trim();
  if (fromSetting) {
    return fromSetting;
  }

  try {
    const url = new URL(getServerUrl());
    if (url.hostname.startsWith('api.')) {
      url.hostname = `app.${url.hostname.slice(4)}`;
    }
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'https://app.gramatr.com';
  }
}

/** Get legacy auth token from settings or GRAMATR_TOKEN env var */
export function getLegacyToken(): string {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  const fromSetting = config.get<string>('token', '');
  if (fromSetting) {
    return fromSetting;
  }
  return process.env['GRAMATR_TOKEN'] ?? '';
}

/** Backwards-compatible alias for older call sites */
export function getToken(): string {
  return getLegacyToken();
}

/** Get classification timeout in ms */
export function getTimeout(): number {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  return config.get<number>('timeout', 15000);
}

/** Check if enrichment is enabled */
export function isEnabled(): boolean {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  return config.get<boolean>('enabled', true);
}

/** Check if classification summary should be shown in chat */
export function shouldShowClassification(): boolean {
  const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
  return config.get<boolean>('showClassification', true);
}
