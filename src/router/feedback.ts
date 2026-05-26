import type { ClassificationFeedback, FeedbackContext } from './types';

export function extractFeedbackContext(metadata: unknown): FeedbackContext | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const nested = record.feedback;
  if (nested && typeof nested === 'object') {
    const context = normalizeFeedbackContext(nested as Record<string, unknown>);
    if (context) {
      return context;
    }
  }

  return normalizeFeedbackContext(record);
}

export function buildClassificationFeedbackPayload(
  context: FeedbackContext | null,
  rating: number,
  source: string,
  comment?: string
): ClassificationFeedback | null {
  if (!context?.originalPrompt) {
    return null;
  }

  const boundedRating = Math.max(1, Math.min(10, Math.round(rating)));
  const notes: string[] = [`source=${source}`, `rating=${boundedRating}/10`];

  if (context.sessionId) {
    notes.push(`session=${context.sessionId}`);
  }
  if (context.projectId) {
    notes.push(`project=${context.projectId}`);
  }
  if (context.branch) {
    notes.push(`branch=${context.branch}`);
  }
  if (context.classification?.effort_level) {
    notes.push(`effort=${context.classification.effort_level}`);
  }
  if (context.classification?.intent_type) {
    notes.push(`intent=${context.classification.intent_type}`);
  }
  if (comment) {
    notes.push(comment.trim());
  }

  return {
    timestamp: new Date().toISOString(),
    was_correct: boundedRating >= 7,
    original_prompt: context.originalPrompt,
    feedback_reason_codes: boundedRating >= 7 ? ['user_positive_rating'] : ['user_negative_rating'],
    quality_notes: notes.join(' | '),
    client_type: 'vscode',
    agent_name: 'VS Code',
  };
}

function normalizeFeedbackContext(record: Record<string, unknown>): FeedbackContext | null {
  const originalPrompt = asString(record.originalPrompt) ?? asString(record.original_prompt);
  if (!originalPrompt) {
    return null;
  }

  const classificationRecord =
    record.classification && typeof record.classification === 'object'
      ? (record.classification as Record<string, unknown>)
      : undefined;

  return {
    originalPrompt,
    sessionId: asString(record.sessionId) ?? asString(record.session_id),
    projectId: asString(record.projectId) ?? asString(record.project_id),
    branch: asString(record.branch),
    promptHash: asString(record.promptHash) ?? asString(record.prompt_hash),
    classification: classificationRecord
      ? {
          effort_level: asString(classificationRecord.effort_level) ?? 'unknown',
          intent_type: asString(classificationRecord.intent_type) ?? 'unknown',
        }
      : undefined,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
