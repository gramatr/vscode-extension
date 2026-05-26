import * as vscode from 'vscode';
import type { SessionManager } from '../session/manager';

interface SessionNode {
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
  readonly icon?: vscode.ThemeIcon;
}

export class SessionViewProvider implements vscode.TreeDataProvider<SessionNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<SessionNode | undefined | void>();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly session: SessionManager) {
    this.session.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: SessionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.icon;
    return item;
  }

  getChildren(): SessionNode[] {
    const handoff = this.session.getHandoff();
    const context = this.session.getLastFeedbackContext();

    return [
      {
        label: 'Project',
        description: this.session.getProjectId(),
        tooltip: this.session.getProjectId(),
        icon: new vscode.ThemeIcon('repo'),
      },
      {
        label: 'Branch',
        description: this.session.getBranch(),
        tooltip: this.session.getBranch(),
        icon: new vscode.ThemeIcon('git-branch'),
      },
      {
        label: 'Session',
        description: `${this.session.getSessionId().slice(0, 8)}...`,
        tooltip: this.session.getSessionId(),
        icon: new vscode.ThemeIcon('play-circle'),
      },
      {
        label: 'Interaction',
        description: this.session.getInteractionId()?.slice(0, 8) ?? 'not registered',
        tooltip: this.session.getInteractionId() ?? 'No interaction ID returned by gramatr yet',
        icon: new vscode.ThemeIcon('link'),
      },
      {
        label: 'Restore',
        description: this.session.getRestoreSource(),
        tooltip: `Current restore source: ${this.session.getRestoreSource()}`,
        icon: new vscode.ThemeIcon('history'),
      },
      {
        label: 'Uptime',
        description: this.session.getUptime(),
        tooltip: `Started ${new Date(this.session.getStartTime()).toLocaleString()}`,
        icon: new vscode.ThemeIcon('clock'),
      },
      {
        label: 'Handoff',
        description: handoff ? 'loaded' : 'not loaded',
        tooltip: handoff?.where_we_are ?? 'No handoff loaded',
        icon: new vscode.ThemeIcon(handoff ? 'archive' : 'circle-large-outline'),
      },
      {
        label: 'Last Classification',
        description: context?.classification
          ? `${context.classification.effort_level}/${context.classification.intent_type}`
          : 'none',
        tooltip: context?.originalPrompt ?? 'No classified request yet',
        icon: new vscode.ThemeIcon('graph'),
      },
    ];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
