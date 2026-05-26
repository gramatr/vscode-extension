// gramatr VS Code Extension — Status Bar
import * as vscode from 'vscode';
import type { IntelligencePacketV2 } from '../router/types';
import { getExecutionSummary, getTokensSaved } from '../router/types';

/**
 * GramatrStatusBar — displays classification info in the VS Code status bar.
 * Shows effort level and token savings after each classification.
 */
export class GramatrStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = 'gramatr';
    this.item.command = 'gramatr.toggleEnrichment';
    this.setIdle();
    this.item.show();
  }

  /** Update status bar after a classification */
  update(classification: IntelligencePacketV2): void {
    const effort = classification.classification?.effort_level ?? 'unknown';
    const intent = classification.classification?.intent_type ?? '';
    const summary = getExecutionSummary(classification);

    this.item.text = `$(zap) gramatr: ${effort}`;

    const tooltipLines: string[] = [
      `Effort: ${effort}`,
      `Intent: ${intent}`,
    ];

    if (summary) {
      tooltipLines.push(
        `Latency: ${summary.execution_time_ms}ms`,
        `Tokens saved: ~${getTokensSaved(classification)}`,
        `Model: ${summary.classifier_model ?? 'unknown'}`,
        `Degraded components: ${(summary.degraded_components ?? []).length}`
      );
    }

    this.item.tooltip = tooltipLines.join('\n');
  }

  /** Set to idle state (no recent classification) */
  setIdle(): void {
    this.item.text = '$(zap) gramatr';
    this.item.tooltip = 'gramatr — waiting for classification';
  }

  /** Set to disabled state */
  setDisabled(): void {
    this.item.text = '$(circle-slash) gramatr: off';
    this.item.tooltip = 'gramatr enrichment is disabled';
  }

  /** Set to classifying state */
  setClassifying(): void {
    this.item.text = '$(loading~spin) gramatr...';
    this.item.tooltip = 'Classifying request...';
  }

  /** Set to error state */
  setError(message: string): void {
    this.item.text = '$(warning) gramatr';
    this.item.tooltip = `gramatr: ${message}`;
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
