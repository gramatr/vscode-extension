import * as vscode from 'vscode';
import type { GramatrClient } from '../router/client';
import type { EntitySummary } from '../router/types';
import type { TraceStore } from '../trace/store';

interface EntityNode {
  readonly label: string;
  readonly description?: string;
  readonly tooltip?: string;
  readonly icon?: vscode.ThemeIcon;
}

export class EntitiesViewProvider implements vscode.TreeDataProvider<EntityNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<EntityNode | undefined | void>();
  private entities: EntitySummary[] = [];
  private searchTerm = '';

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly client: GramatrClient,
    private readonly trace: TraceStore
  ) {}

  async refresh(): Promise<void> {
    await this.loadEntities();
    this.emitter.fire();
  }

  async setSearchTerm(searchTerm: string): Promise<void> {
    this.searchTerm = searchTerm.trim();
    await this.refresh();
  }

  clearSearch(): void {
    this.searchTerm = '';
    void this.refresh();
  }

  getTreeItem(element: EntityNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.icon;
    return item;
  }

  async getChildren(): Promise<EntityNode[]> {
    if (this.entities.length === 0) {
      await this.loadEntities();
    }

    if (this.entities.length === 0) {
      return [{
        label: this.searchTerm ? `No entities for "${this.searchTerm}"` : 'No entities loaded',
        description: this.searchTerm ? 'Try a broader search' : 'Run @gramatr and refresh later',
        icon: new vscode.ThemeIcon('search-stop'),
      }];
    }

    return this.entities.map(entity => ({
      label: entity.name,
      description: entity.entityType,
      tooltip: [entity.name, entity.entityType, entity.snippet].filter(Boolean).join('\n'),
      icon: new vscode.ThemeIcon('symbol-field'),
    }));
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private async loadEntities(): Promise<void> {
    if (this.searchTerm) {
      const result = await this.client.searchEntities({ namePattern: this.searchTerm, limit: 20 });
      this.entities = result?.results ?? [];
    } else {
      const result = await this.client.listEntities({ pageSize: 20, sortBy: 'updated_at', sortOrder: 'desc' });
      this.entities = result?.entities ?? [];
    }

    this.trace.add(
      'entities',
      this.searchTerm ? 'Entity search completed' : 'Entity list refreshed',
      this.searchTerm ? `term=${this.searchTerm} results=${this.entities.length}` : `results=${this.entities.length}`,
      'success'
    );
  }
}
