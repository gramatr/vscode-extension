// gramatr VS Code Extension — Handler Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const ChatRequestTurn = class {
    constructor(public prompt: string) {}
  };
  const ChatResponseTurn = class {
    constructor(public response: Array<{ value: { value: string } }>) {}
  };
  const ChatResponseMarkdownPart = class {
    constructor(public value: { value: string }) {}
  };
  const CancellationError = class extends Error {
    constructor() {
      super('Cancelled');
      this.name = 'CancellationError';
    }
  };
  const LanguageModelChatMessage = {
    User: (content: string) => ({ role: 'user', content }),
    Assistant: (content: string) => ({ role: 'assistant', content }),
  };
  const ThemeIcon = class {
    constructor(public id: string) {}
  };

  return {
    ChatRequestTurn,
    ChatResponseTurn,
    ChatResponseMarkdownPart,
    CancellationError,
    LanguageModelChatMessage,
    ThemeIcon,
    workspace: {
      getConfiguration: () => ({
        get: (key: string, defaultValue: unknown) => {
          if (key === 'enabled') return true;
          if (key === 'showClassification') return true;
          if (key === 'timeout') return 15000;
          return defaultValue;
        },
      }),
    },
  };
});

import { createHandler } from '../../src/participant/handler';
import type { GramatrClient } from '../../src/router/client';
import type { SessionManager } from '../../src/session/manager';
import type { MetricsTracker } from '../../src/metrics/tracker';
import type { GramatrStatusBar } from '../../src/metrics/status-bar';
import type { ClassificationResult } from '../../src/router/types';

function mockClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    schema: 'gmtr.intelligence.contract.v2',
    classification: {
      effort_level: 'standard',
      intent_type: 'create',
      memory_tier: 'warm',
    },
    directives: {
      hard_gates: ['Never delete prod data'],
      behavioral_directives: ['Follow TDD'],
    },
    process: {
      phase_template: {
        phases: ['OBSERVE', 'PLAN', 'BUILD', 'VERIFY'],
        effort_level: 'standard',
      },
    },
    orchestration: {
      skills: { routing: { matched_skills: [{ name: 'implementation' }] } },
      agents: {
        composed: [
          {
            name: 'engineer',
            system_prompt: 'You are Marcus Webb, a battle-scarred engineer.',
          },
        ],
      },
    },
    enrichment: {
      data: {
        reasoning: {
          reverse_engineering: {
            explicit_wants: ['Build the feature'],
            implicit_wants: [],
            explicit_dont_wants: [],
            implicit_dont_wants: [],
            gotchas: [],
          },
          quality_gate_criteria: ['Create OAuth2 flow works end to end'],
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
    ...overrides,
  };
}

function createMockStream() {
  return {
    markdown: vi.fn(),
    progress: vi.fn(),
    reference: vi.fn(),
    button: vi.fn(),
    anchor: vi.fn(),
  };
}

function createMockRequest(prompt: string, command?: string) {
  return {
    prompt,
    command,
    model: {
      sendRequest: vi.fn().mockResolvedValue({
        text: (async function* () {
          yield 'Hello ';
          yield 'world';
        })(),
      }),
    },
    toolReferences: [],
  };
}

function createMockToken() {
  return {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
  };
}

describe('createHandler', () => {
  let client: {
    routeRequest: ReturnType<typeof vi.fn>;
    submitRating: ReturnType<typeof vi.fn>;
    classificationFeedback: ReturnType<typeof vi.fn>;
    saveReflection: ReturnType<typeof vi.fn>;
  };
  let session: {
    getProjectId: ReturnType<typeof vi.fn>;
    getSessionId: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    getHandoff: ReturnType<typeof vi.fn>;
    reloadHandoff: ReturnType<typeof vi.fn>;
    saveHandoff: ReturnType<typeof vi.fn>;
    getBranch: ReturnType<typeof vi.fn>;
    getRestoreSource: ReturnType<typeof vi.fn>;
    getUptime: ReturnType<typeof vi.fn>;
    recordFeedbackContext: ReturnType<typeof vi.fn>;
    getLastFeedbackContext: ReturnType<typeof vi.fn>;
  };
  let metrics: {
    recordClassification: ReturnType<typeof vi.fn>;
    getTotalClassifications: ReturnType<typeof vi.fn>;
    getTotalTokensSaved: ReturnType<typeof vi.fn>;
    getAverageLatency: ReturnType<typeof vi.fn>;
    getCacheHitRate: ReturnType<typeof vi.fn>;
    getFeedbackCount: ReturnType<typeof vi.fn>;
    getHelpfulFeedbackCount: ReturnType<typeof vi.fn>;
    getUnhelpfulFeedbackCount: ReturnType<typeof vi.fn>;
    getAverageExplicitRating: ReturnType<typeof vi.fn>;
    recordFeedback: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  let statusBar: {
    update: ReturnType<typeof vi.fn>;
    setIdle: ReturnType<typeof vi.fn>;
    setDisabled: ReturnType<typeof vi.fn>;
    setClassifying: ReturnType<typeof vi.fn>;
    setError: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    client = {
      routeRequest: vi.fn(),
      submitRating: vi.fn().mockResolvedValue(true),
      classificationFeedback: vi.fn().mockResolvedValue(true),
      saveReflection: vi.fn().mockResolvedValue(true),
    };
    session = {
      getProjectId: vi.fn().mockReturnValue('org/repo'),
      getSessionId: vi.fn().mockReturnValue('sess-123'),
      reset: vi.fn(),
      getHandoff: vi.fn().mockReturnValue(null),
      reloadHandoff: vi.fn().mockResolvedValue(null),
      saveHandoff: vi.fn().mockResolvedValue({
        where_we_are: 'On feature branch',
        what_shipped: '1. Saved handoff',
        whats_next: '1. Add tests',
        key_context: 'Context',
        dont_forget: 'Do not skip tests',
      }),
      getBranch: vi.fn().mockReturnValue('main'),
      getRestoreSource: vi.fn().mockReturnValue('project_handoff'),
      getUptime: vi.fn().mockReturnValue('5m'),
      recordFeedbackContext: vi.fn(),
      getLastFeedbackContext: vi.fn().mockReturnValue({
        originalPrompt: 'Build an OAuth2 PKCE flow',
        sessionId: 'sess-123',
        projectId: 'org/repo',
        branch: 'main',
        classification: {
          effort_level: 'standard',
          intent_type: 'create',
        },
      }),
    };
    metrics = {
      recordClassification: vi.fn(),
      getTotalClassifications: vi.fn().mockReturnValue(0),
      getTotalTokensSaved: vi.fn().mockReturnValue(0),
      getAverageLatency: vi.fn().mockReturnValue(0),
      getCacheHitRate: vi.fn().mockReturnValue(0),
      getFeedbackCount: vi.fn().mockReturnValue(0),
      getHelpfulFeedbackCount: vi.fn().mockReturnValue(0),
      getUnhelpfulFeedbackCount: vi.fn().mockReturnValue(0),
      getAverageExplicitRating: vi.fn().mockReturnValue(null),
      recordFeedback: vi.fn(),
      reset: vi.fn(),
    };
    statusBar = {
      update: vi.fn(),
      setIdle: vi.fn(),
      setDisabled: vi.fn(),
      setClassifying: vi.fn(),
      setError: vi.fn(),
    };
  });

  it('classifies and enriches a normal prompt', async () => {
    const classification = mockClassification();
    client.routeRequest.mockResolvedValue(classification);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Build an OAuth2 PKCE flow');
    const stream = createMockStream();
    const context = { history: [] };
    const token = createMockToken();

    const result = await handler(request as any, context as any, stream as any, token as any);

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('Expected a chat result');
    }

    expect(client.routeRequest).toHaveBeenCalledWith('Build an OAuth2 PKCE flow', {
      projectId: 'org/repo',
      sessionId: 'sess-123',
      branch: 'main',
    });
    expect(statusBar.setClassifying).toHaveBeenCalled();
    expect(statusBar.update).toHaveBeenCalledWith(classification);
    expect(metrics.recordClassification).toHaveBeenCalledWith(classification);
    expect(session.recordFeedbackContext).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPrompt: 'Build an OAuth2 PKCE flow',
        projectId: 'org/repo',
        branch: 'main',
      })
    );
    expect(request.model.sendRequest).toHaveBeenCalled();
    const sentMessages = request.model.sendRequest.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    expect(sentMessages[0]?.content).toContain('[GMTR Intelligence]');
    expect(sentMessages[0]?.content).toContain('Hard gates (NON-NEGOTIABLE):');
    expect(sentMessages[0]?.content).toContain('- Never delete prod data');
    expect(sentMessages[0]?.content).toContain('Behavioral directives:');
    expect(sentMessages[0]?.content).toContain('Quality Gates:');
    expect(sentMessages[0]?.content).toContain('Composed sub-agents (use system_prompt VERBATIM when launching):');
    expect(sentMessages[0]?.content).toContain('You are Marcus Webb, a battle-scarred engineer.');
    expect(stream.markdown).toHaveBeenCalledWith('Hello ');
    expect(stream.markdown).toHaveBeenCalledWith('world');
    expect(client.classificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        original_prompt: 'Build an OAuth2 PKCE flow',
        was_correct: true,
      }),
    );
    expect(client.saveReflection).toHaveBeenCalled();
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.classification).toMatchObject({
      effort_level: 'standard',
      intent_type: 'create',
    });
    expect(result.metadata!.feedback).toMatchObject({
      originalPrompt: 'Build an OAuth2 PKCE flow',
    });
  });

  it('passes through trivial prompts without classification', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('hi');
    const stream = createMockStream();

    await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(client.routeRequest).not.toHaveBeenCalled();
    expect(request.model.sendRequest).toHaveBeenCalled();
  });

  it('forwards without enrichment when classification fails', async () => {
    client.routeRequest.mockResolvedValue(null);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Build a complex distributed system');
    const stream = createMockStream();

    await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(client.routeRequest).toHaveBeenCalled();
    expect(metrics.recordClassification).not.toHaveBeenCalled();
    expect(request.model.sendRequest).toHaveBeenCalled();
    expect(statusBar.setIdle).toHaveBeenCalled();
  });

  it('forwards without enrichment when classification throws', async () => {
    client.routeRequest.mockRejectedValue(new Error('network error'));

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Build a complex distributed system');
    const stream = createMockStream();

    await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(statusBar.setError).toHaveBeenCalledWith('classification failed');
    expect(request.model.sendRequest).toHaveBeenCalled();
  });

  it('delegates /classify command', async () => {
    client.routeRequest.mockResolvedValue(mockClassification());

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Build a feature', 'classify');
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('Expected a chat result');
    }

    expect(client.routeRequest).toHaveBeenCalled();
    expect(request.model.sendRequest).not.toHaveBeenCalled();
    expect(stream.markdown).toHaveBeenCalled();
    expect(result.metadata?.command).toBe('classify');
  });

  it('delegates /status command', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('', 'status');
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('Expected a chat result');
    }

    expect(stream.markdown).toHaveBeenCalled();
    expect(result.metadata?.command).toBe('status');
    expect(client.routeRequest).not.toHaveBeenCalled();
    expect(request.model.sendRequest).not.toHaveBeenCalled();
  });

  it('delegates /mcp-tools command', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('', 'mcp-tools');
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(result).toBeDefined();
    if (!result) {
      throw new Error('Expected a chat result');
    }

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('### gramatr MCP Tools'));
    expect(result.metadata?.command).toBe('mcp-tools');
    expect(client.routeRequest).not.toHaveBeenCalled();
    expect(request.model.sendRequest).not.toHaveBeenCalled();
  });

  it('delegates /handoff load command', async () => {
    session.getHandoff.mockReturnValue({
      where_we_are: 'Active branch main',
      what_shipped: '1. Added commands',
      whats_next: '1. Add tests',
      key_context: 'Context available',
      dont_forget: 'Keep it typed',
    });

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('load', 'handoff');
    const stream = createMockStream();
    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('### Handoff'));
    expect(result?.metadata?.command).toBe('handoff');
    expect(session.reloadHandoff).not.toHaveBeenCalled();
  });

  it('delegates /handoff save command', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('save Added Phase 2 support', 'handoff');
    const stream = createMockStream();
    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(session.saveHandoff).toHaveBeenCalledWith('Added Phase 2 support');
    expect(result?.metadata?.action).toBe('save');
  });

  it('validates /rate input', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('eleven', 'rate');
    const stream = createMockStream();
    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(client.submitRating).not.toHaveBeenCalled();
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Provide a numeric rating'));
    expect(result?.metadata?.command).toBe('rate');
  });

  it('submits /rate for the last classified request', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('8 strong routing match', 'rate');
    const stream = createMockStream();
    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(client.submitRating).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ originalPrompt: 'Build an OAuth2 PKCE flow' }),
      'strong routing match'
    );
    expect(metrics.recordFeedback).toHaveBeenCalledWith(8, 'explicit');
    expect(result?.metadata?.rating).toBe(8);
  });

  it('reuses the cached classification for repeated prompts', async () => {
    client.routeRequest.mockResolvedValue(mockClassification());

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    await handler(createMockRequest('Build an OAuth2 PKCE flow') as any, { history: [] } as any, createMockStream() as any, createMockToken() as any);
    await handler(createMockRequest('Build an OAuth2 PKCE flow') as any, { history: [] } as any, createMockStream() as any, createMockToken() as any);

    expect(client.routeRequest).toHaveBeenCalledTimes(1);
    expect(metrics.recordClassification).toHaveBeenCalledTimes(2);
    const secondClassification = metrics.recordClassification.mock.calls[1][0] as ClassificationResult;
    expect(secondClassification.execution?.summary?.cache_hit).toBe(true);
  });

  it('handles LLM sendRequest error gracefully during enriched flow', async () => {
    const classification = mockClassification();
    client.routeRequest.mockResolvedValue(classification);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Build a complex multi-service app');
    request.model.sendRequest.mockRejectedValue(new Error('Rate limit exceeded'));
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Error from model'));
    expect(result).toBeDefined();
    expect(result!.metadata?.classification).toMatchObject({
      effort_level: 'standard',
      intent_type: 'create',
    });
  });

  it('handles CancellationError gracefully during enriched flow', async () => {
    const classification = mockClassification();
    client.routeRequest.mockResolvedValue(classification);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const { CancellationError } = await import('vscode');
    const request = createMockRequest('Build a feature with cancel');
    request.model.sendRequest.mockRejectedValue(new CancellationError());
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(result).toEqual({});
    expect(stream.markdown).not.toHaveBeenCalledWith(expect.stringContaining('Error from model'));
  });

  it('handles LLM error in forward-without-enrichment path', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('hi!');
    request.model.sendRequest.mockRejectedValue(new Error('Server overloaded'));
    const stream = createMockStream();

    await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Error from model'));
  });

  it('replays conversation history correctly', async () => {
    const classification = mockClassification();
    client.routeRequest.mockResolvedValue(classification);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const { ChatRequestTurn, ChatResponseTurn, ChatResponseMarkdownPart } = await import('vscode');
    const history = [
      new ChatRequestTurn('previous question'),
      new ChatResponseTurn([new ChatResponseMarkdownPart({ value: 'previous answer' })]),
    ];
    const request = createMockRequest('Build on previous context');
    const stream = createMockStream();

    await handler(request as any, { history } as any, stream as any, createMockToken() as any);

    const sentMessages = request.model.sendRequest.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    // First message is intelligence prompt, then history, then current prompt
    expect(sentMessages.length).toBeGreaterThanOrEqual(4);
    expect(sentMessages[1].role).toBe('user');
    expect(sentMessages[1].content).toBe('previous question');
    expect(sentMessages[2].role).toBe('assistant');
    expect(sentMessages[2].content).toBe('previous answer');
  });

  it('skips reflection for instant/fast effort levels', async () => {
    const classification = mockClassification({
      classification: {
        effort_level: 'fast',
        intent_type: 'search',
        matched_skills: [],
        memory_tier: 'warm',
        quality_gate_criteria: [],
        reverse_engineering: {
          explicit_wants: [],
          implicit_wants: [],
          explicit_dont_wants: [],
          implicit_dont_wants: [],
          gotchas: [],
        },
      },
    });
    client.routeRequest.mockResolvedValue(classification);

    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('Search for related entities in the graph');
    const stream = createMockStream();

    await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    // Wait a tick for the async fire-and-forget
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(client.saveReflection).not.toHaveBeenCalled();
    expect(client.classificationFeedback).toHaveBeenCalled();
  });

  it('delegates /clear command', async () => {
    const handler = createHandler(
      client as unknown as GramatrClient,
      session as unknown as SessionManager,
      metrics as unknown as MetricsTracker,
      statusBar as unknown as GramatrStatusBar
    );

    const request = createMockRequest('', 'clear');
    const stream = createMockStream();

    const result = await handler(request as any, { history: [] } as any, stream as any, createMockToken() as any);

    expect(result).toBeDefined();
    expect(session.reset).toHaveBeenCalled();
    expect(metrics.reset).toHaveBeenCalled();
  });
});
