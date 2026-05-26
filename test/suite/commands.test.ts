// gramatr VS Code Extension — Commands Tests
import { describe, it, expect, vi, } from 'vitest';

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: [{ name: 'test-project' }] },
  extensions: { getExtension: () => null },
}));

import {
  handleClassify,
  handleStatus,
  handleMcpTools,
  handleClear,
  handleHandoff,
  handleRate,
} from '../../src/participant/commands';

function mockStream() {
  return {
    markdown: vi.fn(),
    progress: vi.fn(),
  };
}

function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    getProjectId: vi.fn(() => 'org/repo'),
    getSessionId: vi.fn(() => 'sess-12345678-abcd'),
    getBranch: vi.fn(() => 'main'),
    getRestoreSource: vi.fn(() => 'none'),
    getUptime: vi.fn(() => '5m'),
    getHandoff: vi.fn(() => null),
    getLastFeedbackContext: vi.fn(() => null),
    recordFeedbackContext: vi.fn(),
    reloadHandoff: vi.fn(async () => null),
    saveHandoff: vi.fn(async () => null),
    reset: vi.fn(async () => undefined),
    ...overrides,
  };
}

function mockMetrics() {
  return {
    getTotalClassifications: vi.fn(() => 10),
    getTotalTokensSaved: vi.fn(() => 27000),
    getAverageLatency: vi.fn(() => 150),
    getCacheHitRate: vi.fn(() => 25),
    getFeedbackCount: vi.fn(() => 3),
    getHelpfulFeedbackCount: vi.fn(() => 2),
    getUnhelpfulFeedbackCount: vi.fn(() => 1),
    getAverageExplicitRating: vi.fn(() => 8.5),
    recordFeedback: vi.fn(),
    reset: vi.fn(),
  };
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    routeRequest: vi.fn(async () => null),
    submitRating: vi.fn(async () => true),
    ...overrides,
  };
}

function mockTrace() {
  return { add: vi.fn() };
}

describe('handleClassify', () => {
  it('shows help when prompt is empty', async () => {
    const stream = mockStream();
    const result = await handleClassify(
      { prompt: '' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      mockTrace() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('/classify'));
    expect(result).toEqual({});
  });

  it('shows failure when classification returns null', async () => {
    const stream = mockStream();
    const trace = mockTrace();
    const _result = await handleClassify(
      { prompt: 'test prompt' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      trace as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Classification failed'));
    expect(trace.add).toHaveBeenCalledWith('command', 'Dry-run classification failed', 'test prompt', 'warning');
  });

  it('shows classification result with execution summary and RE', async () => {
    const classification = {
      classification: {
        effort_level: 'standard',
        intent_type: 'create',
        matched_skills: ['implementation', 'testing'],
        reverse_engineering: {
          explicit_wants: ['Build OAuth'],
          implicit_wants: ['Error handling'],
          gotchas: ['Token expiry'],
        },
      },
      execution_summary: {
        execution_time_ms: 340,
        classifier_model: 'bert',
        degraded_components: [],
      },
      token_savings: { total_saved: 2700 },
    };
    const client = mockClient({ routeRequest: vi.fn(async () => classification) });
    const stream = mockStream();
    const session = mockSession();
    const trace = mockTrace();

    const result = await handleClassify(
      { prompt: 'Build OAuth2' } as any,
      stream as any,
      client as any,
      session as any,
      trace as any,
    );

    expect(stream.progress).toHaveBeenCalledWith('Classifying...');
    const mdCall = stream.markdown.mock.calls[0][0];
    expect(mdCall).toContain('standard');
    expect(mdCall).toContain('create');
    expect(mdCall).toContain('implementation');
    expect(mdCall).toContain('340ms');
    expect(mdCall).toContain('Build OAuth');
    expect(mdCall).toContain('Error handling');
    expect(mdCall).toContain('Token expiry');
    expect(session.recordFeedbackContext).toHaveBeenCalled();
    expect(result.metadata?.command).toBe('classify');
  });

  it('handles classification without execution summary or RE', async () => {
    const classification = {
      classification: { effort_level: 'fast', intent_type: 'search' },
    };
    const client = mockClient({ routeRequest: vi.fn(async () => classification) });
    const stream = mockStream();

    await handleClassify(
      { prompt: 'search' } as any,
      stream as any,
      client as any,
      mockSession() as any,
    );

    const mdCall = stream.markdown.mock.calls[0][0];
    expect(mdCall).toContain('fast');
    expect(mdCall).not.toContain('Execution Summary');
  });
});

describe('handleStatus', () => {
  it('shows session info and metrics', async () => {
    const stream = mockStream();
    const trace = mockTrace();
    const result = await handleStatus(
      stream as any,
      mockSession() as any,
      mockMetrics() as any,
      trace as any,
    );
    const md = stream.markdown.mock.calls[0][0];
    expect(md).toContain('sess-123');
    expect(md).toContain('org/repo');
    expect(md).toContain('main');
    expect(md).toContain('27,000');
    expect(md).toContain('8.5/10');
    expect(result.metadata?.command).toBe('status');
  });

  it('includes handoff section when loaded', async () => {
    const handoff = { where_we_are: 'main', what_shipped: 'cache', whats_next: 'tests', key_context: 'ctx', dont_forget: 'run tests' };
    const session = mockSession({ getHandoff: vi.fn(() => handoff) });
    const stream = mockStream();

    await handleStatus(stream as any, session as any, mockMetrics() as any);

    const md = stream.markdown.mock.calls[0][0];
    expect(md).toContain('Active Handoff');
    expect(md).toContain('main');
    expect(md).toContain('tests');
  });

  it('shows n/a for null average rating', async () => {
    const metrics = mockMetrics();
    metrics.getAverageExplicitRating.mockReturnValue(null);
    const stream = mockStream();

    await handleStatus(stream as any, mockSession() as any, metrics as any);

    const md = stream.markdown.mock.calls[0][0];
    expect(md).toContain('n/a');
  });
});

describe('handleMcpTools', () => {
  it('shows MCP tools guide', async () => {
    const stream = mockStream();
    const trace = mockTrace();
    const result = await handleMcpTools(stream as any, trace as any);
    const md = stream.markdown.mock.calls[0][0];
    expect(md).toContain('gramatr_route_request');
    expect(md).toContain('gramatr_execute_intent');
    expect(result.metadata?.command).toBe('mcp-tools');
  });
});

describe('handleClear', () => {
  it('resets session and metrics', async () => {
    const stream = mockStream();
    const session = mockSession();
    const metrics = mockMetrics();
    const trace = mockTrace();

    const result = await handleClear(stream as any, session as any, metrics as any, trace as any);

    expect(session.reset).toHaveBeenCalled();
    expect(metrics.reset).toHaveBeenCalled();
    expect(result.metadata?.command).toBe('clear');
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Session reset'));
  });
});

describe('handleHandoff', () => {
  it('shows usage when action is not save or load', async () => {
    const stream = mockStream();
    const result = await handleHandoff(
      { prompt: '' } as any,
      stream as any,
      mockSession() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('/handoff load'));
    expect(result.metadata?.command).toBe('handoff');
  });

  it('loads handoff from current session', async () => {
    const handoff = { where_we_are: 'x', what_shipped: 'y', whats_next: 'z', key_context: 'k', dont_forget: 'd' };
    const session = mockSession({ getHandoff: vi.fn(() => handoff) });
    const stream = mockStream();
    const trace = mockTrace();

    const result = await handleHandoff(
      { prompt: 'load' } as any,
      stream as any,
      session as any,
      trace as any,
    );

    expect(result.metadata?.action).toBe('load');
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Where we are'));
  });

  it('reloads handoff from server when not in session', async () => {
    const handoff = { where_we_are: 'a', what_shipped: 'b', whats_next: 'c', key_context: 'd', dont_forget: 'e' };
    const session = mockSession({
      getHandoff: vi.fn(() => null),
      reloadHandoff: vi.fn(async () => handoff),
    });
    const stream = mockStream();
    const trace = mockTrace();

    const result = await handleHandoff(
      { prompt: 'load' } as any,
      stream as any,
      session as any,
      trace as any,
    );

    expect(result.metadata?.action).toBe('load');
    const md = stream.markdown.mock.calls[0][0];
    expect(md).toContain('Reloaded from gramatr');
  });

  it('shows message when no handoff is available', async () => {
    const session = mockSession();
    const stream = mockStream();
    const trace = mockTrace();

    const _result = await handleHandoff(
      { prompt: 'load' } as any,
      stream as any,
      session as any,
      trace as any,
    );

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('No handoff'));
    expect(trace.add).toHaveBeenCalledWith('command', 'Handoff load returned no data', 'org/repo', 'warning');
  });

  it('saves handoff successfully', async () => {
    const savedHandoff = { where_we_are: 'a', what_shipped: 'b', whats_next: 'c', key_context: 'd', dont_forget: 'e' };
    const session = mockSession({ saveHandoff: vi.fn(async () => savedHandoff) });
    const stream = mockStream();
    const trace = mockTrace();

    const result = await handleHandoff(
      { prompt: 'save some detail' } as any,
      stream as any,
      session as any,
      trace as any,
    );

    expect(stream.progress).toHaveBeenCalledWith('Saving handoff...');
    expect(session.saveHandoff).toHaveBeenCalledWith('some detail');
    expect(result.metadata?.action).toBe('save');
    expect(trace.add).toHaveBeenCalledWith('command', 'Handoff saved via slash command', 'b', 'success');
  });

  it('shows failure when save returns null', async () => {
    const session = mockSession({ saveHandoff: vi.fn(async () => null) });
    const stream = mockStream();
    const trace = mockTrace();

    const _result = await handleHandoff(
      { prompt: 'save' } as any,
      stream as any,
      session as any,
      trace as any,
    );

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('failed'));
    expect(trace.add).toHaveBeenCalledWith('command', 'Handoff save failed', 'org/repo', 'warning');
  });
});

describe('handleRate', () => {
  it('shows help when input is not numeric', async () => {
    const stream = mockStream();
    const _result = await handleRate(
      { prompt: 'bad' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      mockMetrics() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('1 to 10'));
  });

  it('rejects out-of-range rating', async () => {
    const stream = mockStream();
    await handleRate(
      { prompt: '11' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      mockMetrics() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('1 to 10'));
  });

  it('rejects zero rating', async () => {
    const stream = mockStream();
    await handleRate(
      { prompt: '0' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      mockMetrics() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('1 to 10'));
  });

  it('shows message when no feedback context available', async () => {
    const stream = mockStream();
    await handleRate(
      { prompt: '8' } as any,
      stream as any,
      mockClient() as any,
      mockSession() as any,
      mockMetrics() as any,
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('No recent'));
  });

  it('submits rating successfully', async () => {
    const ctx = {
      originalPrompt: 'test',
      sessionId: 'sess',
      classification: { effort_level: 'fast' },
    };
    const session = mockSession({ getLastFeedbackContext: vi.fn(() => ctx) });
    const client = mockClient({ submitRating: vi.fn(async () => true) });
    const metrics = mockMetrics();
    const stream = mockStream();
    const trace = mockTrace();

    const result = await handleRate(
      { prompt: '9' } as any,
      stream as any,
      client as any,
      session as any,
      metrics as any,
      trace as any,
    );

    expect(client.submitRating).toHaveBeenCalledWith(9, ctx, undefined);
    expect(metrics.recordFeedback).toHaveBeenCalledWith(9, 'explicit');
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('9/10'));
    expect(result.metadata?.command).toBe('rate');
  });

  it('submits rating with comment', async () => {
    const ctx = { originalPrompt: 'test' };
    const session = mockSession({ getLastFeedbackContext: vi.fn(() => ctx) });
    const client = mockClient({ submitRating: vi.fn(async () => true) });
    const stream = mockStream();

    await handleRate(
      { prompt: '7 great response!' } as any,
      stream as any,
      client as any,
      session as any,
      mockMetrics() as any,
    );

    expect(client.submitRating).toHaveBeenCalledWith(7, ctx, 'great response!');
  });

  it('shows failure when submission fails', async () => {
    const ctx = { originalPrompt: 'test' };
    const session = mockSession({ getLastFeedbackContext: vi.fn(() => ctx) });
    const client = mockClient({ submitRating: vi.fn(async () => false) });
    const stream = mockStream();
    const trace = mockTrace();

    const result = await handleRate(
      { prompt: '5' } as any,
      stream as any,
      client as any,
      session as any,
      mockMetrics() as any,
      trace as any,
    );

    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('failed'));
    expect(trace.add).toHaveBeenCalledWith('feedback', 'Explicit rating submission failed', 'rating=5', 'warning');
    expect(result.metadata?.command).toBe('rate');
  });
});
