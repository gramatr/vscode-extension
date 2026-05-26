import * as vscode from 'vscode';
import type { SessionManager } from '../session/manager';

export function createFollowupProvider(session: SessionManager): vscode.ChatFollowupProvider {
  return {
    provideFollowups(result: vscode.ChatResult): vscode.ChatFollowup[] {
      const metadata = (result.metadata ?? {}) as Record<string, unknown>;
      const classification = metadata.classification as { intent_type?: string } | undefined;
      const followups: vscode.ChatFollowup[] = [
        { prompt: '/status', label: 'Show gramatr session status' },
      ];

      if (!session.getHandoff()) {
        followups.push({ prompt: '/handoff load', label: 'Load handoff context' });
      }

      switch (classification?.intent_type) {
        case 'create':
          followups.push({ prompt: 'Break this into concrete implementation steps', label: 'Plan implementation' });
          break;
        case 'analyze':
          followups.push({ prompt: 'What are the main risks or regressions here?', label: 'Analyze risks' });
          break;
        case 'search':
        case 'retrieve':
          followups.push({ prompt: 'Summarize the most relevant gramatr context for this task', label: 'Summarize context' });
          break;
        case 'update':
          followups.push({ prompt: 'Generate the precise patch for this change', label: 'Generate patch' });
          break;
        default:
          followups.push({ prompt: '/classify Explain why gramatr classified the last request this way', label: 'Inspect routing' });
          break;
      }

      return followups.slice(0, 3);
    },
  };
}
