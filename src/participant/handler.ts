// gramatr VS Code Extension — Chat Request Handler (THE CORE)
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { GramatrClient } from '../router/client';
import type { IntelligencePacketV2 } from '../router/types';
import { getExecutionSummary, getQualityGates, getTokensSaved } from '../router/types';
import type { SessionManager } from '../session/manager';
import type { MetricsTracker } from '../metrics/tracker';
import type { GramatrStatusBar } from '../metrics/status-bar';
import { ClassificationCache, buildClassificationCacheKey } from '../router/cache';
import type { TraceStore } from '../trace/store';
import { buildUserPromptAdditionalContext } from '../router/formatting';
import { isEnabled, shouldShowClassification } from '../config/settings';
import { handleClassify, handleStatus, handleClear, handleHandoff, handleRate, handleMcpTools } from './commands';

const TRIVIAL_PROMPT_THRESHOLD = 10;
const TRIVIAL_PATTERNS = /^(hi|hello|hey|thanks|thank you|ok|yes|no|sure|bye|help)[\s!?.]*$/i;
const REFLECTION_EFFORTS = new Set(['standard', 'extended', 'advanced', 'deep', 'comprehensive']);

/**
 * Creates the ChatRequestHandler that powers the @gramatr participant.
 *
 * Flow: classify → enrich → forward → stream → update metrics
 * Fail-safe: classification failure NEVER blocks the user.
 */
export function createHandler(
  client: GramatrClient,
  session: SessionManager,
  metrics: MetricsTracker,
  statusBar: GramatrStatusBar,
  trace?: TraceStore
): vscode.ChatRequestHandler {
  const classificationCache = new ClassificationCache();

  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // 1. Handle slash commands
    if (request.command === 'classify') {
      return handleClassify(request, stream, client, session, trace);
    }
    if (request.command === 'status') {
      return handleStatus(stream, session, metrics, trace);
    }
    if (request.command === 'mcp-tools') {
      return handleMcpTools(stream, trace);
    }
    if (request.command === 'clear') {
      return handleClear(stream, session, metrics, trace);
    }
    if (request.command === 'handoff') {
      return handleHandoff(request, stream, session, trace);
    }
    if (request.command === 'rate') {
      return handleRate(request, stream, client, session, metrics, trace);
    }

    // 2. Check if enrichment is enabled
    if (!isEnabled()) {
      statusBar.setDisabled();
      trace?.add('routing', 'Enrichment bypassed', 'gramatr is disabled', 'warning');
      return forwardWithoutEnrichment(request, context, stream, token);
    }

    const prompt = request.prompt.trim();

    // 3. Trivial prompt passthrough — skip classification for greetings and very short prompts
    if (prompt.length < TRIVIAL_PROMPT_THRESHOLD || TRIVIAL_PATTERNS.test(prompt)) {
      trace?.add('routing', 'Trivial prompt bypassed', prompt);
      return forwardWithoutEnrichment(request, context, stream, token);
    }

    // 4. Classify the request via the decision router
    statusBar.setClassifying();
    trace?.add('routing', 'Classification started', prompt);
    let classification: IntelligencePacketV2 | null = null;
    const projectId = session.getProjectId();
    const sessionId = session.getSessionId();
    const branch = session.getBranch();
    const cacheKey = buildClassificationCacheKey(prompt, projectId, branch);

    classification = classificationCache.get(cacheKey);
    if (classification) {
      trace?.add('cache', 'Classification cache hit', `${projectId}/${branch}`, 'success');
    }

    try {
      if (!classification) {
        trace?.add('cache', 'Classification cache miss', `${projectId}/${branch}`);
        classification = await client.routeRequest(prompt, {
          projectId,
          sessionId,
          branch,
        });
        if (classification) {
          classificationCache.set(cacheKey, classification);
          trace?.add(
            'routing',
            'Classification completed',
            `${classification.classification?.effort_level ?? 'unknown'}/${classification.classification?.intent_type ?? 'unknown'}`,
            'success',
          );
        }
      }
    } catch {
      // Classification failure is non-fatal
      statusBar.setError('classification failed');
      trace?.add('routing', 'Classification failed', prompt, 'warning');
    }

    // 5. If classification failed, forward without enrichment
    if (!classification) {
      statusBar.setIdle();
      trace?.add('routing', 'Fallback to model without enrichment', prompt, 'warning');
      return forwardWithoutEnrichment(request, context, stream, token);
    }

    // 6. Update metrics and status bar
    metrics.recordClassification(classification);
    statusBar.update(classification);

    const feedbackContext = {
      originalPrompt: prompt,
      sessionId,
      projectId,
      branch,
      promptHash: hashPrompt(prompt),
      classification: {
        effort_level: classification.classification?.effort_level,
        intent_type: classification.classification?.intent_type,
      },
    };
    session.recordFeedbackContext(feedbackContext);
    trace?.add(
      'routing',
      'Prompt enriched for model',
      `${classification.classification?.effort_level ?? 'unknown'}/${classification.classification?.intent_type ?? 'unknown'}`,
      'success',
    );

    // 7. Show classification summary if configured
    if (shouldShowClassification()) {
      const summary = getExecutionSummary(classification);
      stream.progress(
        `${classification.classification?.effort_level ?? 'unknown'} · ${classification.classification?.intent_type ?? 'unknown'}` +
        (summary ? ` · ${summary.execution_time_ms}ms` : '')
      );
    }

    // 8. Build enriched messages with intelligence context
    const messages = buildEnrichedMessages(request, context, classification);

    // 9. Forward to LLM with enriched context
    try {
      const chatRequest = await request.model.sendRequest(
        messages,
        {},
        token
      );

      // 10. Stream the response
      for await (const fragment of chatRequest.text) {
        stream.markdown(fragment);
      }
      trace?.add('model', 'Model response streamed', prompt);
      void submitLearnArtifacts(client, prompt, classification, trace);
    } catch (err) {
      if (err instanceof vscode.CancellationError) {
        // User cancelled — this is normal
        trace?.add('model', 'Model request cancelled', prompt, 'warning');
        return {};
      }
      // LLM error — show it
      trace?.add('model', 'Model request failed', err instanceof Error ? err.message : 'unknown error', 'error');
      stream.markdown(`\n\n*Error from model: ${err instanceof Error ? err.message : 'unknown error'}*`);
    }

    // 11. Return result with metadata for feedback loop
    return {
      metadata: {
        feedback: feedbackContext,
        classification: {
          effort_level: classification.classification?.effort_level,
          intent_type: classification.classification?.intent_type,
          tokens_saved: getTokensSaved(classification),
        },
        sessionId,
        projectId,
        branch,
        originalPrompt: prompt,
        promptHash: feedbackContext.promptHash,
      },
    };
  };
}

async function submitLearnArtifacts(
  client: GramatrClient,
  prompt: string,
  classification: IntelligencePacketV2,
  trace?: TraceStore,
): Promise<void> {
  const effort = classification.classification?.effort_level ?? 'instant';
  const intent = classification.classification?.intent_type ?? 'unknown';

  const feedbackSubmitted = await client.classificationFeedback({
    timestamp: new Date().toISOString(),
    was_correct: true,
    original_prompt: prompt,
    client_type: 'vscode',
    agent_name: 'VS Code',
  });

  trace?.add(
    'feedback',
    feedbackSubmitted ? 'Auto classification feedback submitted' : 'Auto classification feedback failed',
    `${effort}/${intent}`,
    feedbackSubmitted ? 'success' : 'warning',
  );

  if (!REFLECTION_EFFORTS.has(effort)) {
    return;
  }

  const criteriaCount = getQualityGates(classification).length;
  const reflectionSubmitted = await client.saveReflection({
    taskDescription: summarizeTask(prompt),
    effortLevel: effort,
    criteriaCount,
    criteriaPassed: 0,
    criteriaFailed: 0,
    q1: 'I would keep the VS Code turn lightweight and rely on shared client-core behavior.',
    q2: 'A smarter algorithm would centralize routing, restore, and learn flows across clients.',
    q3: 'A fundamentally smarter AI would infer full parity gaps from the route packet and extension surface automatically.',
    impliedSentiment: 7,
  });

  trace?.add(
    'feedback',
    reflectionSubmitted ? 'Auto reflection submitted' : 'Auto reflection failed',
    `${effort}/${intent}`,
    reflectionSubmitted ? 'success' : 'warning',
  );
}

function summarizeTask(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  return words.join(' ') || 'VS Code agent task';
}

function hashPrompt(prompt: string): string {
  return createHash('sha1').update(prompt).digest('hex');
}

/**
 * Forward the request to the LLM without any gramatr enrichment.
 * Used when enrichment is disabled, classification fails, or prompt is trivial.
 */
async function forwardWithoutEnrichment(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const messages = buildBaseMessages(request, context);

  try {
    const chatRequest = await request.model.sendRequest(
      messages,
      {},
      token
    );

    for await (const fragment of chatRequest.text) {
      stream.markdown(fragment);
    }
  } catch (err) {
    if (!(err instanceof vscode.CancellationError)) {
      stream.markdown(`\n\n*Error from model: ${err instanceof Error ? err.message : 'unknown error'}*`);
    }
  }

  return {};
}

/**
 * Build the base conversation messages from request + history context.
 */
function buildBaseMessages(
  request: vscode.ChatRequest,
  context: vscode.ChatContext
): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];

  // Replay conversation history
  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const text = turn.response
        .filter((part): part is vscode.ChatResponseMarkdownPart => part instanceof vscode.ChatResponseMarkdownPart)
        .map(part => part.value.value)
        .join('');
      if (text) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(text));
      }
    }
  }

  // Current prompt
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  return messages;
}

/**
 * Build enriched messages with the intelligence packet injected as a system-level context message.
 */
function buildEnrichedMessages(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  classification: IntelligencePacketV2
): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];

  // Inject intelligence context as the first assistant instruction
  const intelligencePrompt = buildIntelligencePrompt(classification);
  messages.push(vscode.LanguageModelChatMessage.User(intelligencePrompt));

  // Replay history
  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const text = turn.response
        .filter((part): part is vscode.ChatResponseMarkdownPart => part instanceof vscode.ChatResponseMarkdownPart)
        .map(part => part.value.value)
        .join('');
      if (text) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(text));
      }
    }
  }

  // Current prompt
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  return messages;
}

/**
 * Build the intelligence prompt that gets injected before the user's messages.
 * This is the core enrichment — the decision router's output formatted for the LLM.
 */
function buildIntelligencePrompt(classification: IntelligencePacketV2): string {
  return buildUserPromptAdditionalContext(classification);
}
