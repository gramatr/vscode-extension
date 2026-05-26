import * as vscode from 'vscode';

export type TraceLevel = 'info' | 'success' | 'warning' | 'error';

export interface TraceEvent {
  id: string;
  timestamp: number;
  kind: string;
  message: string;
  detail?: string;
  level: TraceLevel;
}

export class TraceStore implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly events: TraceEvent[] = [];

  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly maxEvents: number = 200,
    private readonly onEvent?: (event: TraceEvent) => void
  ) {}

  add(kind: string, message: string, detail?: string, level: TraceLevel = 'info'): TraceEvent {
    const event: TraceEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: Date.now(),
      kind,
      message,
      detail,
      level,
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }

    this.onEvent?.(event);
    this.emitter.fire();
    return event;
  }

  clear(): void {
    this.events.length = 0;
    this.emitter.fire();
  }

  getEvents(limit: number = 50): TraceEvent[] {
    return this.events.slice(0, limit);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
