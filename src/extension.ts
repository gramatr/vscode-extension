// gramatr VS Code Extension — Entry Point
import * as vscode from 'vscode';
import { registerAuthCommands } from './auth/commands';
import { TokenStore } from './auth/token-store';
import { GramatrClient } from './router/client';
import { SessionManager } from './session/manager';
import { MetricsTracker } from './metrics/tracker';
import { GramatrStatusBar } from './metrics/status-bar';
import { createHandler } from './participant/handler';
import { createFollowupProvider } from './participant/followups';
import { buildClassificationFeedbackPayload, extractFeedbackContext } from './router/feedback';
import { TraceStore } from './trace/store';
import { SessionViewProvider } from './views/session-view';
import { MetricsViewProvider } from './views/metrics-view';
import { ActivityViewProvider } from './views/activity-view';
import { EntitiesViewProvider } from './views/entities-view';
import { GramatrDashboardPanel } from './views/dashboard';
import { getServerUrl, getTimeout, isEnabled } from './config/settings';

let session: SessionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('gramatr');
  outputChannel.appendLine('gramatr extension activating...');
  const trace = new TraceStore(200, event => {
    outputChannel.appendLine(`[${event.kind}] ${event.message}${event.detail ? ` — ${event.detail}` : ''}`);
  });
  const tokenStore = new TokenStore(context.secrets);

  void tokenStore.migrateLegacyToken().then(migrated => {
    if (migrated) {
      trace.add('auth', 'Migrated legacy token into secret storage', undefined, 'success');
      outputChannel.appendLine('Migrated gramatr.token setting into VS Code Secret Storage.');
    }
  });

  void tokenStore.getTokenSource().then(source => {
    if (source === 'none') {
      trace.add('auth', 'No saved API token detected', 'Use gramatr: Connect Account or gramatr: Set API Key', 'warning');
      outputChannel.appendLine('No gramatr API token found. Run "gramatr: Connect Account" or "gramatr: Set API Key".');
    }
  });

  // 1. Build the client from settings
  const client = new GramatrClient(
    getServerUrl(),
    () => tokenStore.getToken(),
    getTimeout()
  );

  // 2. Create session manager and start session (non-blocking)
  session = new SessionManager(client, context.globalState, trace);
  session.start().catch(err => {
    trace.add('session', 'Session start failed', err instanceof Error ? err.message : String(err), 'warning');
    outputChannel.appendLine(`Session start failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  // 3. Create metrics tracker and status bar
  const metrics = new MetricsTracker();
  const statusBar = new GramatrStatusBar();
  const sessionView = new SessionViewProvider(session);
  const metricsView = new MetricsViewProvider(metrics, client);
  const activityView = new ActivityViewProvider(trace);
  const entitiesView = new EntitiesViewProvider(client, trace);

  if (!isEnabled()) {
    statusBar.setDisabled();
  }

  // 4. Register the chat participant
  const handler = createHandler(client, session, metrics, statusBar, trace);
  const participant = vscode.chat.createChatParticipant('gramatr.participant', handler);
  participant.iconPath = new vscode.ThemeIcon('zap');
  participant.followupProvider = createFollowupProvider(session);
  trace.add('extension', 'Chat participant registered', 'participant=@gramatr', 'success');

  // 5. Register feedback handler
  participant.onDidReceiveFeedback(feedback => {
    void (async () => {
      try {
        const rating = feedback.kind === vscode.ChatResultFeedbackKind.Helpful ? 8 : 3;
        const context = extractFeedbackContext(feedback.result.metadata);
        const payload = buildClassificationFeedbackPayload(context, rating, 'vscode-native-feedback');

        if (!payload) {
          trace.add('feedback', 'Feedback ignored', 'Missing correlation metadata', 'warning');
          outputChannel.appendLine('Feedback ignored: missing correlation metadata.');
          return;
        }

        const submitted = await client.classificationFeedback(payload);
        if (submitted) {
          metrics.recordFeedback(rating, 'native');
          trace.add('feedback', 'Native feedback submitted', `rating=${rating}`, 'success');
          outputChannel.appendLine(`Feedback submitted: rating=${rating}/10`);
        } else {
          trace.add('feedback', 'Native feedback submission failed', `rating=${rating}`, 'warning');
          outputChannel.appendLine('Feedback submission failed: server unavailable.');
        }
      } catch (err) {
        trace.add('feedback', 'Native feedback errored', err instanceof Error ? err.message : String(err), 'error');
        outputChannel.appendLine(`Feedback submission errored: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  });

  // 6. Register commands
  const toggleCmd = vscode.commands.registerCommand('gramatr.toggleEnrichment', async () => {
    const config = vscode.workspace.getConfiguration('gramatr');
    const current = config.get<boolean>('enabled', true);
    await config.update('enabled', !current, vscode.ConfigurationTarget.Global);

    if (!current) {
      statusBar.setIdle();
      vscode.window.showInformationMessage('gramatr enrichment enabled');
    } else {
      statusBar.setDisabled();
      vscode.window.showInformationMessage('gramatr enrichment disabled');
    }
  });

  const resetCmd = vscode.commands.registerCommand('gramatr.resetSession', async () => {
    if (session) {
      await session.reset();
      metrics.reset();
      statusBar.setIdle();
      trace.clear();
      trace.add('session', 'Session reset from command palette', session.getSessionId(), 'success');
      vscode.window.showInformationMessage('gramatr session reset');
    }
  });

  const showDashboardCmd = vscode.commands.registerCommand('gramatr.showDashboard', () => {
    GramatrDashboardPanel.createOrShow(context.extensionUri, session!, metrics, trace, client);
  });

  const startAgentSessionCmd = vscode.commands.registerCommand('gramatr.startAgentSession', async () => {
    await vscode.commands.executeCommand('vscode.editorChat.start');
    vscode.window.showInformationMessage('gramatr agent session started. In chat, use @gramatr for the full authenticated gramatr workflow.');
  });

  const refreshEntitiesCmd = vscode.commands.registerCommand('gramatr.refreshEntities', async () => {
    await entitiesView.refresh();
    vscode.window.showInformationMessage('gramatr entities refreshed');
  });

  const searchEntitiesCmd = vscode.commands.registerCommand('gramatr.searchEntities', async () => {
    const term = await vscode.window.showInputBox({
      prompt: 'Search gramatr entities by name pattern',
      placeHolder: 'auth, copilot, session, ...',
    });

    if (term === undefined) {
      return;
    }

    if (term.trim().length === 0) {
      entitiesView.clearSearch();
      vscode.window.showInformationMessage('gramatr entity search cleared');
      return;
    }

    await entitiesView.setSearchTerm(term);
    vscode.window.showInformationMessage(`gramatr entity search: ${term}`);
  });

  const clearActivityCmd = vscode.commands.registerCommand('gramatr.clearActivity', () => {
    trace.clear();
    trace.add('activity', 'Activity trace cleared');
  });
  const authCommands = registerAuthCommands(tokenStore, trace, outputChannel);

  const sessionTree = vscode.window.createTreeView('gramatr.sessionView', { treeDataProvider: sessionView });
  const metricsTree = vscode.window.createTreeView('gramatr.metricsView', { treeDataProvider: metricsView });
  const activityTree = vscode.window.createTreeView('gramatr.activityView', { treeDataProvider: activityView });
  const entitiesTree = vscode.window.createTreeView('gramatr.entitiesView', { treeDataProvider: entitiesView });

  void metricsView.refresh();
  void entitiesView.refresh();

  const refreshInterval = setInterval(() => {
    void metricsView.refresh();
    sessionView.refresh();
  }, 30000);

  // 7. Watch for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('gramatr.enabled')) {
      if (isEnabled()) {
        statusBar.setIdle();
        trace.add('config', 'gramatr enrichment enabled');
      } else {
        statusBar.setDisabled();
        trace.add('config', 'gramatr enrichment disabled', undefined, 'warning');
      }
    }
  });

  const intervalDisposable = new vscode.Disposable(() => clearInterval(refreshInterval));

  // 8. Push all disposables
  context.subscriptions.push(
    participant,
    trace,
    session,
    metrics,
    statusBar,
    sessionView,
    metricsView,
    activityView,
    entitiesView,
    sessionTree,
    metricsTree,
    activityTree,
    entitiesTree,
    toggleCmd,
    resetCmd,
    showDashboardCmd,
    startAgentSessionCmd,
    refreshEntitiesCmd,
    searchEntitiesCmd,
    clearActivityCmd,
    ...authCommands,
    configWatcher,
    intervalDisposable,
    outputChannel
  );

  outputChannel.appendLine('gramatr extension activated');
}

export function deactivate(): void {
  // Fire-and-forget session end
  if (session) {
    session.end().catch(() => {
      // Best-effort — extension is shutting down
    });
  }
}
