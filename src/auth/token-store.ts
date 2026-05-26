import * as vscode from 'vscode';
import { GRAMATR_SECTION, getLegacyToken } from '../config/settings';

const SECRET_KEY = 'gramatr.token';

export type TokenSource = 'secretStorage' | 'legacySetting' | 'environment' | 'none';

export class TokenStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getToken(): Promise<string> {
    const secure = await this.secrets.get(SECRET_KEY);
    if (secure) {
      return secure.trim();
    }

    return getLegacyToken().trim();
  }

  async getTokenSource(): Promise<TokenSource> {
    const secure = await this.secrets.get(SECRET_KEY);
    if (secure?.trim()) {
      return 'secretStorage';
    }

    const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
    const legacy = config.get<string>('token', '').trim();
    if (legacy) {
      return 'legacySetting';
    }

    if ((process.env['GRAMATR_TOKEN'] ?? '').trim()) {
      return 'environment';
    }

    return 'none';
  }

  async hasToken(): Promise<boolean> {
    return (await this.getToken()).length > 0;
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, token.trim());
  }

  async clearStoredToken(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    await vscode.workspace.getConfiguration(GRAMATR_SECTION).update('token', '', vscode.ConfigurationTarget.Global);
  }

  async migrateLegacyToken(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration(GRAMATR_SECTION);
    const legacy = config.get<string>('token', '').trim();

    if (!legacy) {
      return false;
    }

    const existing = await this.secrets.get(SECRET_KEY);
    if (!existing?.trim()) {
      await this.secrets.store(SECRET_KEY, legacy);
    }

    await config.update('token', '', vscode.ConfigurationTarget.Global);
    return true;
  }
}