// gramatr VS Code Extension — Session Manager
import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { GramatrClient } from '../router/client';
import type { FeedbackContext, Handoff } from '../router/types';
import type { TraceStore } from '../trace/store';
import { getGitContext, readProjectJson, writeProjectJson } from './project';
import type { SessionStartResponse } from '../router/types';

function normalizeSessionStartResponse(response: SessionStartResponse | null | undefined) {
  return {
    interactionId: response?.interaction_id || response?.interactionId || null,
    entityId: response?.entity_id || response?.entityId || null,
    resumed: response?.interaction_resumed === true || response?.interactionResumed === true,
    handoffContext: response?.handoff_context || response?.handoffContext || null,
    recentSessions: response?.recent_sessions ?? [],
  };
}

const STATE_KEY = 'gramatr.session';

interface PersistedSessionState {
  sessionId: string;
  entityId?: string;
  interactionId?: string;
  projectId: string;
  projectUuid?: string;
  branch: string;
  startTime: number;
  restoreSource?: string;
}

/**
 * SessionManager — manages session lifecycle with the gramatr server.
 * Persists state in globalState for crash recovery.
 */
export class SessionManager {
  private readonly emitter = new vscode.EventEmitter<void>();
  private sessionId: string;
  private entityId?: string;
  private interactionId?: string;
  private projectId: string;
  private projectUuid?: string;
  private branch: string;
  private startTime: number;
  private handoff: Handoff | null = null;
  private lastFeedbackContext: FeedbackContext | null = null;
  private restoreSource = 'fresh';

  constructor(
    private readonly client: GramatrClient,
    private readonly globalState: vscode.Memento,
    private readonly trace?: TraceStore
  ) {
    // Try to restore persisted state
    const persisted = this.globalState.get<PersistedSessionState>(STATE_KEY);
    if (persisted) {
      this.sessionId = persisted.sessionId;
      this.entityId = persisted.entityId;
      this.interactionId = persisted.interactionId;
      this.projectId = persisted.projectId;
      this.projectUuid = persisted.projectUuid;
      this.branch = persisted.branch;
      this.startTime = persisted.startTime;
      this.restoreSource = persisted.restoreSource ?? 'persisted_local';
    } else {
      const git = getGitContext();
      this.sessionId = crypto.randomUUID();
      this.projectId = git.projectId;
      this.branch = git.branch;
      this.startTime = Date.now();
    }
  }

  readonly onDidChange = this.emitter.event;

  /** Start a new session — fire-and-forget server registration */
  async start(): Promise<void> {
    const git = getGitContext();
    this.projectId = git.projectId;
    this.branch = git.branch;
    this.startTime = Date.now();
    this.restoreSource = this.interactionId ? 'persisted_local' : 'fresh';

    // Try to read persisted UUID from .gramatr/project.json
    try {
      const projectJson = await readProjectJson();
      if (projectJson?.project_id) {
        this.projectUuid = projectJson.project_id;
      }
    } catch {
      // Non-fatal
    }

    // Persist immediately for crash recovery
    await this.persist();
    this.trace?.add('session', 'Session initialized', `project=${this.projectId} branch=${this.branch} uuid=${this.projectUuid ?? 'n/a'}`);
    this.emitter.fire();

    // Fire-and-forget: register session + load handoff
    try {
      const result = await this.client.sessionStart(this.projectId, this.sessionId, this.projectUuid);
      if (result) {
        const normalized = normalizeSessionStartResponse(result);
        this.entityId = normalized.entityId ?? undefined;
        this.interactionId = normalized.interactionId ?? undefined;
        if (result.session_id) this.sessionId = result.session_id;
        if (normalized.resumed) {
          this.restoreSource = 'resumed_interaction';
        }

        // Persist server-returned UUID if we didn't already have one
        if (result.project_id && !this.projectUuid) {
          this.projectUuid = result.project_id;
          try {
            await writeProjectJson({
              project_id: result.project_id,
              project_slug: result.project_slug ?? this.projectId,
            });
          } catch {
            // Best-effort — don't break the session
          }
        }

        await this.persist();
        this.trace?.add('session', 'Session registered with gramatr', `entity=${this.entityId ?? 'n/a'} interaction=${this.interactionId ?? 'n/a'} uuid=${this.projectUuid ?? 'n/a'}`, 'success');
        this.emitter.fire();
      }
    } catch {
      // Non-fatal — session works without server registration
      this.trace?.add('session', 'Session registration failed', 'Continuing in local-only mode', 'warning');
    }

    try {
      await this.reloadHandoff();
    } catch {
      // Non-fatal
    }
  }

  /** End the current session */
  async end(): Promise<void> {
    if (this.entityId) {
      try {
        await this.client.sessionEnd(this.entityId);
        this.trace?.add('session', 'Session ended', `entity=${this.entityId}`, 'success');
      } catch {
        // Best-effort
        this.trace?.add('session', 'Session end failed', `entity=${this.entityId}`, 'warning');
      }
    }
    await this.globalState.update(STATE_KEY, undefined);
    this.emitter.fire();
  }

  /** Reset: end current session and start a new one */
  async reset(): Promise<void> {
    await this.end();
    this.sessionId = crypto.randomUUID();
    this.entityId = undefined;
    this.interactionId = undefined;
    // Keep projectUuid across resets — it's tied to the workspace, not the session
    this.handoff = null;
    this.lastFeedbackContext = null;
    this.restoreSource = 'fresh';
    await this.start();
    this.trace?.add('session', 'Session reset', `session=${this.sessionId}`, 'success');
    this.emitter.fire();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getProjectId(): string {
    return this.projectId;
  }

  getProjectUuid(): string | undefined {
    return this.projectUuid;
  }

  getBranch(): string {
    return this.branch;
  }

  getHandoff(): Handoff | null {
    return this.handoff;
  }

  getEntityId(): string | undefined {
    return this.entityId;
  }

  getInteractionId(): string | undefined {
    return this.interactionId;
  }

  getRestoreSource(): string {
    return this.restoreSource;
  }

  async reloadHandoff(): Promise<Handoff | null> {
    try {
      this.handoff = await this.client.loadHandoff(this.projectId);
      if (this.handoff && this.restoreSource !== 'resumed_interaction') {
        this.restoreSource = 'project_handoff';
      }
       this.trace?.add(
        'handoff',
        this.handoff ? 'Handoff loaded' : 'No handoff found',
        this.handoff?.where_we_are,
        this.handoff ? 'success' : 'info'
      );
      this.emitter.fire();
      return this.handoff;
    } catch {
      this.trace?.add('handoff', 'Handoff load failed', `project=${this.projectId}`, 'warning');
      return this.handoff;
    }
  }

  async saveHandoff(note?: string): Promise<Handoff | null> {
    const handoff = this.buildHandoff(note);
    try {
      const saved = await this.client.saveHandoff(handoff, {
        projectId: this.projectId,
        sessionId: this.sessionId,
        branch: this.branch,
        platform: 'vscode',
        conversationId: this.interactionId,
      });

      if (!saved) {
        this.trace?.add('handoff', 'Handoff save failed', `project=${this.projectId}`, 'warning');
        return null;
      }

      this.handoff = handoff;
      this.trace?.add('handoff', 'Handoff saved', handoff.what_shipped, 'success');
      this.emitter.fire();
      return this.handoff;
    } catch {
      this.trace?.add('handoff', 'Handoff save errored', `project=${this.projectId}`, 'warning');
      return null;
    }
  }

  buildHandoff(note?: string): Handoff {
    const noteText = note?.trim();
    const previous = this.handoff;
    const lastClassification = this.lastFeedbackContext?.classification
      ? `${this.lastFeedbackContext.classification.effort_level}/${this.lastFeedbackContext.classification.intent_type}`
      : 'none';

    return {
      where_we_are: `Project ${this.projectId} on branch ${this.branch}. Session ${this.sessionId.slice(0, 8)}... active for ${this.getUptime()}.`,
      what_shipped: noteText
        ? `1. ${noteText}`
        : previous?.what_shipped ?? '1. Current VS Code session state captured.',
      whats_next: previous?.whats_next ?? '1. Continue from the active VS Code session.',
      key_context: [
        `Last classified request: ${lastClassification}.`,
        previous?.key_context,
      ]
        .filter(Boolean)
        .join(' '),
      dont_forget:
        previous?.dont_forget ??
        'Save a fresh handoff after meaningful progress before ending the session.',
    };
  }

  recordFeedbackContext(context: FeedbackContext): void {
    this.lastFeedbackContext = context;
    this.emitter.fire();
  }

  getLastFeedbackContext(): FeedbackContext | null {
    return this.lastFeedbackContext;
  }

  getStartTime(): number {
    return this.startTime;
  }

  getUptime(): string {
    const ms = Date.now() - this.startTime;
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  private async persist(): Promise<void> {
    const state: PersistedSessionState = {
      sessionId: this.sessionId,
      entityId: this.entityId,
      interactionId: this.interactionId,
      projectId: this.projectId,
      projectUuid: this.projectUuid,
      branch: this.branch,
      startTime: this.startTime,
      restoreSource: this.restoreSource,
    };
    await this.globalState.update(STATE_KEY, state);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
