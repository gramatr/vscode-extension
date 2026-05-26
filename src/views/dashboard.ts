import * as vscode from 'vscode';
import type { GramatrClient } from '../router/client';
import type { DashboardStats } from '../router/types';
import type { MetricsTracker } from '../metrics/tracker';
import type { SessionManager } from '../session/manager';
import type { TraceStore } from '../trace/store';

export class GramatrDashboardPanel implements vscode.Disposable {
  private static currentPanel: GramatrDashboardPanel | undefined;

  static createOrShow(
    extensionUri: vscode.Uri,
    session: SessionManager,
    metrics: MetricsTracker,
    trace: TraceStore,
    client: GramatrClient
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (GramatrDashboardPanel.currentPanel) {
      GramatrDashboardPanel.currentPanel.panel.reveal(column);
      void GramatrDashboardPanel.currentPanel.render();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gramatr.dashboard',
      'gramatr Dashboard',
      column ?? vscode.ViewColumn.Beside,
      { enableScripts: false }
    );

    GramatrDashboardPanel.currentPanel = new GramatrDashboardPanel(panel, extensionUri, session, metrics, trace, client);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly session: SessionManager,
    private readonly metrics: MetricsTracker,
    private readonly trace: TraceStore,
    private readonly client: GramatrClient
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.trace.onDidChange(() => void this.render());
    this.metrics.onDidChange(() => void this.render());
    this.session.onDidChange(() => void this.render());
    void this.render();
  }

  dispose(): void {
    GramatrDashboardPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }

  private async render(): Promise<void> {
    const stats = await this.client.fetchDashboardStats();
    const traceEvents = this.trace.getEvents(10);
    const handoff = this.session.getHandoff();

    this.panel.webview.html = renderHtml({
      stats,
      session: this.session,
      metrics: this.metrics,
      traceEvents,
      handoff,
    });
  }
}

function renderHtml(input: {
  stats: DashboardStats | null;
  session: SessionManager;
  metrics: MetricsTracker;
  traceEvents: ReturnType<TraceStore['getEvents']>;
  handoff: ReturnType<SessionManager['getHandoff']>;
}): string {
  const cards = [
    card('Session', `${escapeHtml(input.session.getProjectId())} · ${escapeHtml(input.session.getBranch())}`),
    card('Tokens Saved', `~${input.metrics.getTotalTokensSaved().toLocaleString()}`),
    card('Classifier Accuracy', input.stats ? `${Math.round(input.stats.classifier_accuracy)}%` : 'Unavailable'),
    card('Entities', input.stats ? String(input.stats.total_entities) : 'Unavailable'),
  ].join('');

  const activity = input.traceEvents.length === 0
    ? '<li>No activity captured yet.</li>'
    : input.traceEvents.map(event => `<li><strong>${escapeHtml(event.kind)}</strong>: ${escapeHtml(event.message)}${event.detail ? `<br><span>${escapeHtml(event.detail)}</span>` : ''}</li>`).join('');

  const handoff = input.handoff
    ? `<section><h2>Handoff</h2><p><strong>Where we are:</strong> ${escapeHtml(input.handoff.where_we_are)}</p><p><strong>What next:</strong> ${escapeHtml(input.handoff.whats_next)}</p></section>`
    : '<section><h2>Handoff</h2><p>No handoff loaded.</p></section>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>gramatr Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
    h1, h2 { margin: 0 0 12px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0 24px; }
    .card { background: linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(15, 23, 42, 0.92)); border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 14px; padding: 14px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
    .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    section { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 0 0 10px; }
    span { color: #94a3b8; }
  </style>
</head>
<body>
  <h1>gramatr Dashboard</h1>
  <p>Observe what gramatr is doing behind the scenes while you work inside Copilot Chat.</p>
  <div class="cards">${cards}</div>
  <section>
    <h2>Runtime Metrics</h2>
    <p><strong>Classifications:</strong> ${input.metrics.getTotalClassifications()}</p>
    <p><strong>Avg latency:</strong> ${input.metrics.getAverageLatency()}ms</p>
    <p><strong>Cache hit rate:</strong> ${input.metrics.getCacheHitRate()}%</p>
    <p><strong>Feedback:</strong> ${input.metrics.getHelpfulFeedbackCount()} helpful / ${input.metrics.getUnhelpfulFeedbackCount()} unhelpful</p>
  </section>
  ${handoff}
  <section>
    <h2>Activity Trace</h2>
    <ul>${activity}</ul>
  </section>
</body>
</html>`;
}

function card(label: string, value: string): string {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
