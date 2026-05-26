// gramatr VS Code Extension — Metrics Tracker
import * as vscode from 'vscode';
import type { ExecutionSummary, IntelligencePacketV2 } from '../router/types';
import { getExecutionSummary, getTokensSaved } from '../router/types';

/**
 * Simple accumulator for classification metrics.
 * Tracks total classifications, token savings, and latency.
 */
export class MetricsTracker {
  private readonly emitter = new vscode.EventEmitter<void>();
  private totalClassifications = 0;
  private totalTokensSaved = 0;
  private totalLatencyMs = 0;
  private cacheHits = 0;
  private helpfulFeedback = 0;
  private unhelpfulFeedback = 0;
  private explicitRatingTotal = 0;
  private explicitRatingCount = 0;

  readonly onDidChange = this.emitter.event;

  /** Record a successful classification */
  recordClassification(result: IntelligencePacketV2): void {
    this.totalClassifications++;

    const summary: ExecutionSummary | undefined = getExecutionSummary(result);
    if (summary) {
      this.totalTokensSaved += getTokensSaved(result);
      this.totalLatencyMs += summary.execution_time_ms ?? 0;
      if (!(summary.degraded_components?.includes('routing.cache_miss') ?? false)) {
        this.cacheHits++;
      }
    }

    this.emitter.fire();
  }

  getTotalClassifications(): number {
    return this.totalClassifications;
  }

  getTotalTokensSaved(): number {
    return this.totalTokensSaved;
  }

  getAverageLatency(): number {
    if (this.totalClassifications === 0) {
      return 0;
    }
    return Math.round(this.totalLatencyMs / this.totalClassifications);
  }

  getCacheHitRate(): number {
    if (this.totalClassifications === 0) {
      return 0;
    }
    return Math.round((this.cacheHits / this.totalClassifications) * 100);
  }

  recordFeedback(rating: number, source: 'native' | 'explicit' = 'native'): void {
    if (rating >= 7) {
      this.helpfulFeedback++;
    } else {
      this.unhelpfulFeedback++;
    }

    if (source === 'explicit') {
      this.explicitRatingCount++;
      this.explicitRatingTotal += rating;
    }

    this.emitter.fire();
  }

  getFeedbackCount(): number {
    return this.helpfulFeedback + this.unhelpfulFeedback;
  }

  getHelpfulFeedbackCount(): number {
    return this.helpfulFeedback;
  }

  getUnhelpfulFeedbackCount(): number {
    return this.unhelpfulFeedback;
  }

  getAverageExplicitRating(): number | null {
    if (this.explicitRatingCount === 0) {
      return null;
    }

    return Math.round((this.explicitRatingTotal / this.explicitRatingCount) * 10) / 10;
  }

  /** Return a human-readable summary */
  getSummary(): string {
    const parts: string[] = [
      `Classifications: ${this.totalClassifications}`,
      `Tokens saved: ~${this.totalTokensSaved.toLocaleString()}`,
      `Avg latency: ${this.getAverageLatency()}ms`,
      `Cache hit rate: ${this.getCacheHitRate()}%`,
    ];
    return parts.join(' | ');
  }

  /** Reset all counters */
  reset(): void {
    this.totalClassifications = 0;
    this.totalTokensSaved = 0;
    this.totalLatencyMs = 0;
    this.cacheHits = 0;
    this.helpfulFeedback = 0;
    this.unhelpfulFeedback = 0;
    this.explicitRatingTotal = 0;
    this.explicitRatingCount = 0;
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
