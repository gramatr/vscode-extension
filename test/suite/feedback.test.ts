import { describe, expect, it } from 'vitest';
import { buildClassificationFeedbackPayload, extractFeedbackContext } from '../../src/router/feedback';

describe('feedback helpers', () => {
  it('extracts nested handler feedback metadata', () => {
    const context = extractFeedbackContext({
      feedback: {
        originalPrompt: 'Build a cache',
        sessionId: 'sess-123',
        projectId: 'org/repo',
        branch: 'main',
        classification: {
          effort_level: 'standard',
          intent_type: 'create',
        },
      },
    });

    expect(context).toEqual({
      originalPrompt: 'Build a cache',
      sessionId: 'sess-123',
      projectId: 'org/repo',
      branch: 'main',
      promptHash: undefined,
      classification: {
        effort_level: 'standard',
        intent_type: 'create',
      },
    });
  });

  it('maps thumbs-style ratings into classification feedback payloads', () => {
    const payload = buildClassificationFeedbackPayload(
      {
        originalPrompt: 'Build a cache',
        sessionId: 'sess-123',
        projectId: 'org/repo',
        branch: 'main',
        classification: {
          effort_level: 'standard',
          intent_type: 'create',
        },
      },
      3,
      'vscode-native-feedback'
    );

    expect(payload).not.toBeNull();
    expect(payload?.was_correct).toBe(false);
    expect(payload?.original_prompt).toBe('Build a cache');
    expect(payload?.quality_notes).toContain('rating=3/10');
    expect(payload?.quality_notes).toContain('intent=create');
  });
});