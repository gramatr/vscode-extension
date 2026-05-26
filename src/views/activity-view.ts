import * as vscode from 'vscode';
import type { TraceEvent, TraceStore } from '../trace/store';

interface ActivityNode {
  readonly kind: 'empty' | 'event';
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
  readonly icon?: vscode.ThemeIcon;
}

export class ActivityViewProvider implements vscode.TreeDataProvider<ActivityNode> {
  private readonly emitter = new vscode.EventEmitter<ActivityNode | undefined | void>();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly trace: TraceStore) {
    this.trace.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ActivityNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.icon;
    return item;
  }

  getChildren(): ActivityNode[] {
    const events = this.trace.getEvents(25);
    if (events.length === 0) {
      return [{
        kind: 'empty',
        label: 'No gramatr activity yet',
        description: 'Run @gramatr in chat to populate the trace',
        icon: new vscode.ThemeIcon('history'),
      }];
    }

    return events.map(event => toActivityNode(event));
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

function toActivityNode(event: TraceEvent): ActivityNode {
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return {
    kind: 'event',
    label: event.message,
    description: `${event.kind} · ${time}`,
    tooltip: [event.message, event.detail].filter(Boolean).join('\n'),
    icon: iconForLevel(event.level),
  };
}

function iconForLevel(level: TraceEvent['level']): vscode.ThemeIcon {
  switch (level) {
    case 'success':
      return new vscode.ThemeIcon('check');
    case 'warning':
      return new vscode.ThemeIcon('warning');
    case 'error':
      return new vscode.ThemeIcon('error');
    default:
      return new vscode.ThemeIcon('pulse');
  }
}
