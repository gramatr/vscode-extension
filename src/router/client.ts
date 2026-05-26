// gramatr VS Code Extension — REST/MCP JSON-RPC Client
import type {
  ClassificationFeedback,
  DashboardStats,
  EntitiesListResponse,
  EntitySearchResponse,
  EntitySummary,
  FeedbackContext,
  Handoff,
  IntelligencePacketV2,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  RouteRequestOptions,
  StatuslineStats,
  VscodeSessionStartResponse,
} from './types';
import { buildClassificationFeedbackPayload } from './feedback';

/**
 * GramatrClient — communicates with the gramatr server via MCP JSON-RPC over HTTP.
 *
 * Uses POST to /mcp with tools/call JSON-RPC bodies since the REST API (#9)
 * isn't built yet. All methods are fail-safe: returns null on any failure.
 */
export class GramatrClient {
  private requestId = 0;

  constructor(
    private readonly serverUrl: string,
    private readonly tokenSource: string | (() => string | Promise<string>),
    private readonly timeout: number = 15000
  ) {}

  /**
   * Pre-classify a prompt via the decision router.
   * Returns the v2 intelligence packet or null on failure.
   */
  async routeRequest(
    prompt: string,
    options: RouteRequestOptions = {}
  ): Promise<IntelligencePacketV2 | null> {
    const args: Record<string, unknown> = { prompt };
    // Prefer UUID for project_id when available
    if (options.projectUuid) {
      args['project_id'] = options.projectUuid;
      if (options.projectId) {
        args['project_slug'] = options.projectId;
      }
    } else if (options.projectId) {
      args['project_id'] = options.projectId;
    }
    if (options.sessionId) {
      args['session_id'] = options.sessionId;
    }
    if (options.branch) {
      args['branch'] = options.branch;
    }

    const raw = await this.callTool('gramatr_route_request', args);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as IntelligencePacketV2;
      // Stash the raw text for system prompt injection / downstream debugging.
      parsed.raw_intelligence = raw;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Register a new session with the server */
  async sessionStart(
    projectId?: string,
    sessionId?: string,
    projectUuid?: string
  ): Promise<VscodeSessionStartResponse | null> {
    const args: Record<string, unknown> = { client_type: 'vscode' };
    // If we have a persisted UUID, send it as project_id (server expects UUID)
    if (projectUuid) {
      args['project_id'] = projectUuid;
      if (projectId) {
        args['project_slug'] = projectId;
      }
    } else if (projectId) {
      args['project_id'] = projectId;
    }
    if (sessionId) {
      args['session_id'] = sessionId;
    }

    const raw = await this.callTool('gramatr_session_start', args);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as VscodeSessionStartResponse;
    } catch {
      return null;
    }
  }

  /** End a session */
  async sessionEnd(
    entityId: string,
    summary?: string
  ): Promise<boolean> {
    const args: Record<string, unknown> = { entity_id: entityId };
    if (summary) {
      args['summary'] = summary;
    }

    const raw = await this.callTool('gramatr_session_end', args);
    return raw !== null;
  }

  /** Load the active handoff for a project */
  async loadHandoff(projectId?: string): Promise<Handoff | null> {
    const args: Record<string, unknown> = {};
    if (projectId) {
      args['project_id'] = projectId;
    }

    const raw = await this.callTool('gramatr_load_handoff', args);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as Handoff;
    } catch {
      return null;
    }
  }

  /** Save a structured handoff for the current project */
  async saveHandoff(
    handoff: Handoff,
    options: { projectId?: string; sessionId?: string; branch?: string; platform?: string; conversationId?: string } = {}
  ): Promise<boolean> {
    const args: Record<string, unknown> = {
      where_we_are: handoff.where_we_are,
      what_shipped: handoff.what_shipped,
      whats_next: handoff.whats_next,
      key_context: handoff.key_context,
      dont_forget: handoff.dont_forget,
      platform: options.platform || 'vscode',
    };

    if (options.projectId) {
      args['project_id'] = options.projectId;
    }
    if (options.sessionId) {
      args['session_id'] = options.sessionId;
    }
    if (options.branch) {
      args['branch'] = options.branch;
    }
    if (options.conversationId) {
      args['conversation_id'] = options.conversationId;
    }

    const raw = await this.callTool('gramatr_save_handoff', args);
    return raw !== null;
  }

  /** Submit classification feedback for the learning flywheel */
  async classificationFeedback(feedback: ClassificationFeedback): Promise<boolean> {
    const raw = await this.callTool('gramatr_classification_feedback', feedback as unknown as Record<string, unknown>);
    return raw !== null;
  }

  /** Persist a lightweight reflection for standard+ runs */
  async saveReflection(args: {
    taskDescription: string;
    effortLevel: string;
    criteriaCount: number;
    criteriaPassed: number;
    criteriaFailed: number;
    q1: string;
    q2: string;
    q3: string;
    impliedSentiment?: number;
  }): Promise<boolean> {
    const raw = await this.callTool('gramatr_save_reflection', {
      task_description: args.taskDescription,
      effort_level: args.effortLevel,
      criteria_count: args.criteriaCount,
      criteria_passed: args.criteriaPassed,
      criteria_failed: args.criteriaFailed,
      reflection_q1: args.q1,
      reflection_q2: args.q2,
      reflection_q3: args.q3,
      implied_sentiment: args.impliedSentiment,
      client_type: 'vscode',
      agent_name: 'VS Code',
      within_budget: true,
    });
    return raw !== null;
  }

  /** Submit an explicit 1-10 rating via the classification feedback channel */
  async submitRating(
    rating: number,
    context: FeedbackContext | null,
    comment?: string
  ): Promise<boolean> {
    const payload = buildClassificationFeedbackPayload(context, rating, 'vscode-rate', comment);
    if (!payload) {
      return false;
    }

    return this.classificationFeedback(payload);
  }

  async fetchStatuslineStats(): Promise<StatuslineStats | null> {
    return this.fetchRestJson<StatuslineStats>('/api/v1/stats/statusline');
  }

  async fetchDashboardStats(): Promise<DashboardStats | null> {
    return this.fetchRestJson<DashboardStats>('/api/v1/stats');
  }

  async listEntities(options: {
    page?: number;
    pageSize?: number;
    entityType?: string;
    sortBy?: 'name' | 'created_at' | 'updated_at';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<EntitiesListResponse | null> {
    const data = await this.fetchRestJson<Record<string, unknown>>('/api/v1/entities', {
      page: options.page,
      page_size: options.pageSize,
      entity_type: options.entityType,
      sort_by: options.sortBy,
      sort_order: options.sortOrder,
    });

    if (!data) {
      return null;
    }

    const entities = Array.isArray(data.entities)
      ? data.entities.map(item => normalizeEntity(item as Record<string, unknown>))
      : [];
    const pagination = (data.pagination ?? {}) as Record<string, unknown>;

    return {
      entities,
      pagination: {
        page: asNumber(pagination.page, 1),
        page_size: asNumber(pagination.page_size, options.pageSize ?? 20),
        total_count: asNumber(pagination.total_count, entities.length),
        total_pages: asNumber(pagination.total_pages, 1),
      },
    };
  }

  async searchEntities(options: {
    namePattern?: string;
    entityType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<EntitySearchResponse | null> {
    const data = await this.fetchRestJson<Record<string, unknown>>('/api/v1/entities/search', {
      name_pattern: options.namePattern,
      entity_type: options.entityType,
      limit: options.limit,
      offset: options.offset,
    });

    if (!data) {
      return null;
    }

    const results = Array.isArray(data.results)
      ? data.results.map(item => normalizeEntity(item as Record<string, unknown>))
      : [];

    return {
      results,
      count: asNumber(data.count, results.length),
      limit: asNumber(data.limit, options.limit ?? results.length),
      offset: asNumber(data.offset, options.offset ?? 0),
    };
  }

  /**
   * Low-level MCP JSON-RPC tool call.
   * Returns the text content from the first result item, or null on any failure.
   */
  private async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string | null> {
    const body: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.serverUrl.replace(/\/+$/, '')}/mcp`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.getAuthorizationHeader()),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as McpJsonRpcResponse;

      if (json.error) {
        return null;
      }

      const content = json.result?.content;
      if (!content || content.length === 0) {
        return null;
      }

      return content[0].text ?? null;
    } catch {
      // Timeout, network error, or parse error — fail silently
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchRestJson<T>(path: string, query?: Record<string, unknown>): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const base = this.serverUrl.replace(/\/+$/, '');
      const url = new URL(path, `${base}/`);

      if (query) {
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
          }
        }
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(await this.getAuthorizationHeader()),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getAuthorizationHeader(): Promise<Record<string, string>> {
    const token = await this.resolveToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async resolveToken(): Promise<string> {
    if (typeof this.tokenSource === 'function') {
      const value = await this.tokenSource();
      return value?.trim() ?? '';
    }

    return this.tokenSource.trim();
  }
}

function normalizeEntity(raw: Record<string, unknown>): EntitySummary {
  return {
    id: asString(raw.id) ?? asString(raw.entity_id) ?? 'unknown-entity',
    name: asString(raw.name) ?? 'Untitled entity',
    entityType: asString(raw.entity_type) ?? asString(raw.type) ?? 'unknown',
    snippet: asString(raw.snippet),
    metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    updatedAt: asString(raw.updated_at),
    createdAt: asString(raw.created_at),
    isPublic: typeof raw.is_public === 'boolean' ? raw.is_public : undefined,
    inactive: typeof raw.inactive === 'boolean' ? raw.inactive : undefined,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
