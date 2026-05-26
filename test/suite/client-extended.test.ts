// gramatr VS Code Extension — Extended GramatrClient Tests (REST + entity + reflection)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GramatrClient } from '../../src/router/client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonRpcSuccess(data: unknown) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: JSON.stringify(data) }],
      },
    }),
  };
}

function restJsonSuccess(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  };
}

describe('GramatrClient (extended)', () => {
  let client: GramatrClient;

  beforeEach(() => {
    client = new GramatrClient('http://localhost:9001', 'test-token', 5000);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('routeRequest with branch option', () => {
    it('sends branch in arguments', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ effort_level: 'fast' }));
      await client.routeRequest('test', { branch: 'develop' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.arguments.branch).toBe('develop');
    });

    it('returns null when JSON parse fails on response text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: 'not valid json{{{' }],
          },
        }),
      });
      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });
  });

  describe('sessionStart without args', () => {
    it('sends only client_type when no args provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ entity_id: 'e1' }));
      await client.sessionStart();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.arguments.client_type).toBe('vscode');
      expect(body.params.arguments.project_id).toBeUndefined();
      expect(body.params.arguments.session_id).toBeUndefined();
    });

    it('returns null on parse error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: 'invalid json' }],
          },
        }),
      });
      const result = await client.sessionStart('proj');
      expect(result).toBeNull();
    });
  });

  describe('loadHandoff', () => {
    it('sends no args when projectId is omitted', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ where_we_are: 'x' }));
      await client.loadHandoff();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.arguments).toEqual({});
    });

    it('returns null when server returns nothing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [] },
        }),
      });
      const result = await client.loadHandoff('proj');
      expect(result).toBeNull();
    });

    it('returns null on parse error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: 'bad json' }] },
        }),
      });
      const result = await client.loadHandoff('proj');
      expect(result).toBeNull();
    });
  });

  describe('saveHandoff', () => {
    it('sends conversationId when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'saved' }));
      await client.saveHandoff(
        { where_we_are: 'a', what_shipped: 'b', whats_next: 'c', key_context: 'd', dont_forget: 'e' },
        { conversationId: 'conv-1' }
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.arguments.conversation_id).toBe('conv-1');
    });

    it('defaults platform to vscode', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'saved' }));
      await client.saveHandoff(
        { where_we_are: 'a', what_shipped: 'b', whats_next: 'c', key_context: 'd', dont_forget: 'e' }
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.arguments.platform).toBe('vscode');
    });

    it('returns false on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      const result = await client.saveHandoff(
        { where_we_are: 'a', what_shipped: 'b', whats_next: 'c', key_context: 'd', dont_forget: 'e' }
      );
      expect(result).toBe(false);
    });
  });

  describe('classificationFeedback', () => {
    it('sends feedback via tool call and returns true', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'ok' }));
      const result = await client.classificationFeedback({
        timestamp: '2025-01-01',
        was_correct: true,
        original_prompt: 'test',
      });
      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.name).toBe('gramatr_classification_feedback');
    });
  });

  describe('saveReflection', () => {
    it('maps camelCase args to snake_case and sends tool call', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'saved' }));
      const result = await client.saveReflection({
        taskDescription: 'Build tests',
        effortLevel: 'standard',
        criteriaCount: 5,
        criteriaPassed: 4,
        criteriaFailed: 1,
        q1: 'good',
        q2: 'better',
        q3: 'best',
        impliedSentiment: 0.8,
      });
      expect(result).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.name).toBe('gramatr_save_reflection');
      expect(body.params.arguments.task_description).toBe('Build tests');
      expect(body.params.arguments.effort_level).toBe('standard');
      expect(body.params.arguments.criteria_count).toBe(5);
      expect(body.params.arguments.criteria_passed).toBe(4);
      expect(body.params.arguments.criteria_failed).toBe(1);
      expect(body.params.arguments.reflection_q1).toBe('good');
      expect(body.params.arguments.implied_sentiment).toBe(0.8);
      expect(body.params.arguments.client_type).toBe('vscode');
      expect(body.params.arguments.agent_name).toBe('VS Code');
      expect(body.params.arguments.within_budget).toBe(true);
    });

    it('returns false on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      const result = await client.saveReflection({
        taskDescription: 'x', effortLevel: 'fast',
        criteriaCount: 1, criteriaPassed: 1, criteriaFailed: 0,
        q1: 'a', q2: 'b', q3: 'c',
      });
      expect(result).toBe(false);
    });
  });

  describe('fetchStatuslineStats', () => {
    it('returns stats from REST endpoint', async () => {
      const stats = { server_version: '1.0', entity_count: 42 };
      mockFetch.mockResolvedValueOnce(restJsonSuccess(stats));
      const result = await client.fetchStatuslineStats();
      expect(result).toEqual(stats);
      const url = mockFetch.mock.calls[0][0].toString();
      expect(url).toContain('/api/v1/stats/statusline');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await client.fetchStatuslineStats();
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'));
      const result = await client.fetchStatuslineStats();
      expect(result).toBeNull();
    });
  });

  describe('fetchDashboardStats', () => {
    it('returns stats from REST endpoint', async () => {
      const stats = { total_tokens_saved: 1000 };
      mockFetch.mockResolvedValueOnce(restJsonSuccess(stats));
      const result = await client.fetchDashboardStats();
      expect(result).toEqual(stats);
    });
  });

  describe('listEntities', () => {
    it('returns normalized entities with pagination', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        entities: [
          { id: 'e1', name: 'Task1', entity_type: 'task', is_public: true, inactive: false },
          { entity_id: 'e2', type: 'session', snippet: 'snip' },
        ],
        pagination: { page: 1, page_size: 20, total_count: 2, total_pages: 1 },
      }));

      const result = await client.listEntities({ page: 1, pageSize: 20, entityType: 'task', sortBy: 'name', sortOrder: 'asc' });
      expect(result).not.toBeNull();
      expect(result!.entities).toHaveLength(2);
      expect(result!.entities[0].id).toBe('e1');
      expect(result!.entities[0].entityType).toBe('task');
      expect(result!.entities[0].isPublic).toBe(true);
      expect(result!.entities[1].id).toBe('e2');
      expect(result!.entities[1].entityType).toBe('session');
      expect(result!.entities[1].name).toBe('Untitled entity');
      expect(result!.pagination.page).toBe(1);
    });

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await client.listEntities();
      expect(result).toBeNull();
    });

    it('handles missing entities array', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({ pagination: {} }));
      const result = await client.listEntities();
      expect(result!.entities).toEqual([]);
    });

    it('sends query parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({ entities: [], pagination: {} }));
      await client.listEntities({ page: 2, pageSize: 10, entityType: 'task', sortBy: 'created_at', sortOrder: 'desc' });
      const url = new URL(mockFetch.mock.calls[0][0].toString());
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('page_size')).toBe('10');
      expect(url.searchParams.get('entity_type')).toBe('task');
    });
  });

  describe('searchEntities', () => {
    it('returns normalized results', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [
          { id: 'e1', name: 'Match', entity_type: 'decision', metadata: { foo: 'bar' }, updated_at: '2025-01-01', created_at: '2025-01-01' },
        ],
        count: 1,
        limit: 10,
        offset: 0,
      }));

      const result = await client.searchEntities({ namePattern: 'Match', entityType: 'decision', limit: 10, offset: 0 });
      expect(result).not.toBeNull();
      expect(result!.results).toHaveLength(1);
      expect(result!.results[0].id).toBe('e1');
      expect(result!.results[0].metadata).toEqual({ foo: 'bar' });
      expect(result!.count).toBe(1);
    });

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await client.searchEntities();
      expect(result).toBeNull();
    });

    it('handles missing results array', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({}));
      const result = await client.searchEntities();
      expect(result!.results).toEqual([]);
    });
  });

  describe('normalizeEntity edge cases', () => {
    it('handles entity with no id fields', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ name: 'noId' }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].id).toBe('unknown-entity');
    });

    it('handles entity with no name', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ id: 'x' }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].name).toBe('Untitled entity');
    });

    it('handles entity with no type', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ id: 'x', name: 'Test' }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].entityType).toBe('unknown');
    });

    it('handles entity with non-record metadata', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ id: 'x', name: 'T', entity_type: 'task', metadata: 'string-metadata' }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].metadata).toBeUndefined();
    });

    it('handles entity with array metadata (not record)', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ id: 'x', name: 'T', entity_type: 'task', metadata: [1, 2] }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].metadata).toBeUndefined();
    });

    it('handles entity with null metadata', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({
        results: [{ id: 'x', name: 'T', entity_type: 'task', metadata: null }],
        count: 1,
      }));
      const result = await client.searchEntities();
      expect(result!.results[0].metadata).toBeUndefined();
    });
  });

  describe('async token provider returning empty', () => {
    it('omits Authorization header when token resolves to empty', async () => {
      const emptyClient = new GramatrClient('http://localhost:9001', async () => '', 5000);
      mockFetch.mockResolvedValueOnce(restJsonSuccess({ server_version: '1.0' }));
      await emptyClient.fetchStatuslineStats();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('fetchRestJson query param filtering', () => {
    it('skips undefined, null, and empty string query params', async () => {
      mockFetch.mockResolvedValueOnce(restJsonSuccess({ entities: [], pagination: {} }));
      await client.listEntities({ page: undefined, entityType: undefined });
      const url = new URL(mockFetch.mock.calls[0][0].toString());
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.has('entity_type')).toBe(false);
    });
  });

  describe('callTool with content[0].text missing', () => {
    it('returns null when text field is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text' }],
          },
        }),
      });
      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });
  });
});
