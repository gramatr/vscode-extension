// gramatr VS Code Extension — GramatrClient Tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GramatrClient } from '../../src/router/client';

// Mock global fetch
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

function jsonRpcError(code: number, message: string) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      error: { code, message },
    }),
  };
}

describe('GramatrClient', () => {
  let client: GramatrClient;

  beforeEach(() => {
    client = new GramatrClient('http://localhost:9001', 'test-token', 5000);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('routeRequest', () => {
    it('returns v2 intelligence packet on success', async () => {
      const mockResult = {
        schema: 'gmtr.intelligence.contract.v2',
        manifest: {
          project_id: 'proj-1',
          session_id: 'sess-1',
          interaction_id: 'int-1',
        },
        classification: {
          effort_level: 'standard',
          intent_type: 'create',
          memory_tier: 'warm',
        },
        directives: {
          hard_gates: ['Never delete prod data'],
          behavioral_directives: ['Follow Quality Gates'],
        },
        enrichment: {
          data: {
            reasoning: {
              reverse_engineering: { explicit_wants: ['Build a feature'] },
              quality_gate_criteria: ['Feature works end to end'],
            },
          },
        },
        execution: {
          summary: {
            execution_time_ms: 340,
            classifier_time_ms: 1200,
            classifier_model: 'qwen3:14b',
            degraded_components: [],
          },
          token_savings: {
            total_saved: 2700,
            tokens_saved: 2700,
            savings_ratio: 0.8,
          },
        },
      };

      mockFetch.mockResolvedValueOnce(jsonRpcSuccess(mockResult));

      const result = await client.routeRequest('Build an OAuth2 flow');

      expect(result).not.toBeNull();
      expect(result!.schema).toBe('gmtr.intelligence.contract.v2');
      expect(result!.classification?.effort_level).toBe('standard');
      expect(result!.classification?.intent_type).toBe('create');
      expect(result!.directives?.hard_gates).toEqual(['Never delete prod data']);
      expect(result!.execution?.token_savings?.total_saved).toBe(2700);
      expect(result!.enrichment?.data?.reasoning?.quality_gate_criteria).toEqual(['Feature works end to end']);
      expect(result!.raw_intelligence).toBeDefined();
    });

    it('sends correct JSON-RPC body', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ effort_level: 'fast', intent_type: 'search' }));

      await client.routeRequest('test prompt', { projectId: 'org/repo', sessionId: 'sess-123' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:9001/mcp');

      const body = JSON.parse(options.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('gramatr_route_request');
      expect(body.params.arguments.prompt).toBe('test prompt');
      expect(body.params.arguments.project_id).toBe('org/repo');
      expect(body.params.arguments.session_id).toBe('sess-123');
    });

    it('includes Authorization header when token is set', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ effort_level: 'fast' }));

      await client.routeRequest('test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('supports async token providers for secure storage', async () => {
      const secureClient = new GramatrClient('http://localhost:9001', async () => 'secure-token', 5000);
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ effort_level: 'fast' }));

      await secureClient.routeRequest('test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer secure-token');
    });

    it('returns null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });

    it('returns null on JSON-RPC error', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcError(-32600, 'Invalid request'));

      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });

    it('returns null on malformed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [] },
        }),
      });

      const result = await client.routeRequest('test');
      expect(result).toBeNull();
    });

    it('returns null on timeout (abort)', async () => {
      // Create a client with very short timeout
      const fastClient = new GramatrClient('http://localhost:9001', 'test', 1);
      mockFetch.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      const result = await fastClient.routeRequest('test');
      expect(result).toBeNull();
    });
  });

  describe('sessionStart', () => {
    it('returns session info on success', async () => {
      const mockResult = { entity_id: 'ent-123', interaction_id: 'int-456', session_id: 'sess-789' };
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess(mockResult));

      const result = await client.sessionStart('org/repo', 'my-session');

      expect(result).not.toBeNull();
      expect(result!.entity_id).toBe('ent-123');
      expect(result!.session_id).toBe('sess-789');
    });

    it('sends gramatr_session_start tool call', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({}));

      await client.sessionStart('org/repo');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.name).toBe('gramatr_session_start');
      expect(body.params.arguments.client_type).toBe('vscode');
      expect(body.params.arguments.project_id).toBe('org/repo');
    });
  });

  describe('sessionEnd', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'ended' }));

      const result = await client.sessionEnd('ent-123', 'Built the feature');
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));

      const result = await client.sessionEnd('ent-123');
      expect(result).toBe(false);
    });
  });

  describe('loadHandoff', () => {
    it('returns handoff on success', async () => {
      const handoff = {
        where_we_are: 'main branch',
        what_shipped: '1. Feature A',
        whats_next: '1. Feature B',
        key_context: 'Uses pgvector',
        dont_forget: 'Run migrations',
      };
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess(handoff));

      const result = await client.loadHandoff('org/repo');

      expect(result).not.toBeNull();
      expect(result!.where_we_are).toBe('main branch');
      expect(result!.dont_forget).toBe('Run migrations');
    });
  });

  describe('saveHandoff', () => {
    it('sends gramatr_save_handoff with structured payload', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'saved' }));

      const result = await client.saveHandoff(
        {
          where_we_are: 'On feature branch',
          what_shipped: '1. Added cache',
          whats_next: '1. Add tests',
          key_context: 'Use gmtr tools',
          dont_forget: 'Run vitest',
        },
        {
          projectId: 'org/repo',
          sessionId: 'sess-123',
          branch: 'feature/cache',
          platform: 'vscode',
        }
      );

      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.name).toBe('gramatr_save_handoff');
      expect(body.params.arguments.project_id).toBe('org/repo');
      expect(body.params.arguments.session_id).toBe('sess-123');
      expect(body.params.arguments.branch).toBe('feature/cache');
      expect(body.params.arguments.platform).toBe('vscode');
      expect(body.params.arguments.where_we_are).toBe('On feature branch');
    });
  });

  describe('submitRating', () => {
    it('maps explicit ratings onto classification feedback', async () => {
      mockFetch.mockResolvedValueOnce(jsonRpcSuccess({ status: 'ok' }));

      const result = await client.submitRating(8, {
        originalPrompt: 'Build cache support',
        sessionId: 'sess-123',
        projectId: 'org/repo',
        branch: 'main',
        classification: {
          effort_level: 'standard',
          intent_type: 'create',
        },
      });

      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.params.name).toBe('gramatr_classification_feedback');
      expect(body.params.arguments.original_prompt).toBe('Build cache support');
      expect(body.params.arguments.was_correct).toBe(true);
      expect(body.params.arguments.quality_notes).toContain('rating=8/10');
      expect(body.params.arguments.quality_notes).toContain('session=sess-123');
    });

    it('returns false when the context is missing', async () => {
      const result = await client.submitRating(5, null);

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
