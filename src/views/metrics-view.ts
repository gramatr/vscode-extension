import * as vscode from 'vscode';
import type { GramatrClient } from '../router/client';
import type { StatuslineStats } from '../router/types';
import type { MetricsTracker } from '../metrics/tracker';

interface MetricsNode {
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
  readonly icon?: vscode.ThemeIcon;
}

export class MetricsViewProvider implements vscode.TreeDataProvider<MetricsNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<MetricsNode | undefined | void>();
  private serverStats: StatuslineStats | null = null;

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly metrics: MetricsTracker,
    private readonly client: GramatrClient
  ) {
    this.metrics.onDidChange(() => this.refresh());
  }

  async refresh(): Promise<void> {
    this.serverStats = await this.client.fetchStatuslineStats();
    this.emitter.fire();
  }

  getTreeItem(element: MetricsNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.icon;
    return item;
  }

  async getChildren(): Promise<MetricsNode[]> {
    if (!this.serverStats) {
      this.serverStats = await this.client.fetchStatuslineStats();
    }

    const stats = this.serverStats;
    return [
      metric('Classifications', String(this.metrics.getTotalClassifications()), 'pulse'),
      metric('Tokens Saved', `~${this.metrics.getTotalTokensSaved().toLocaleString()}`, 'savings'),
      metric('Avg Latency', `${this.metrics.getAverageLatency()}ms`, 'watch'),
      metric('Cache Hit Rate', `${this.metrics.getCacheHitRate()}%`, 'database'),
      metric('Helpful / Unhelpful', `${this.metrics.getHelpfulFeedbackCount()} / ${this.metrics.getUnhelpfulFeedbackCount()}`, 'thumbsup'),
      metric('Explicit Rating', this.metrics.getAverageExplicitRating() === null ? 'n/a' : `${this.metrics.getAverageExplicitRating()}/10`, 'star-full'),
      metric('Server Accuracy', stats ? `${Math.round((stats.classifier.accuracy ?? 0) * 100)}%` : 'unavailable', 'graph-line'),
      metric('7d Classifications', stats ? String(stats.classifications_7d) : 'unavailable', 'calendar'),
      metric('Skills Indexed', stats ? String(stats.skills_count) : 'unavailable', 'symbol-keyword'),
      metric('Ops (1h / 24h)', stats ? `${stats.operations_1h} / ${stats.operations_24h}` : 'unavailable', 'pulse'),
    ];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

function metric(label: string, description: string, iconId: string): MetricsNode {
  return {
    label,
    description,
    tooltip: `${label}: ${description}`,
    icon: new vscode.ThemeIcon(iconId),
  };
}
