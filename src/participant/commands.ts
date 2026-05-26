// gramatr VS Code Extension — Slash Command Handlers
import * as vscode from 'vscode';
import type { GramatrClient } from '../router/client';
import type { SessionManager } from '../session/manager';
import type { MetricsTracker } from '../metrics/tracker';
import type { TraceStore } from '../trace/store';
import { buildUserPromptAdditionalContext } from '../router/formatting';
import { getExecutionSummary, getReverseEngineering, getTokensSaved } from '../router/types';

/**
 * Handle the /classify slash command — dry-run classification without forwarding to LLM.
 */
export async function handleClassify(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  client: GramatrClient,
  session: SessionManager,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  const prompt = request.prompt.trim();
  if (!prompt) {
    stream.markdown('Provide a prompt after `/classify` to see its classification.\n\nExample: `@gramatr /classify Build an OAuth2 PKCE flow`');
    return {};
  }

  stream.progress('Classifying...');
  trace?.add('command', 'Dry-run classification started', prompt);

  const result = await client.routeRequest(prompt, {
    projectId: session.getProjectId(),
    sessionId: session.getSessionId(),
    branch: session.getBranch(),
  });

  if (!result) {
    trace?.add('command', 'Dry-run classification failed', prompt, 'warning');
    stream.markdown('**Classification failed** — server unreachable or returned an error.');
    return {};
  }

  const matchedSkills = result.orchestration?.skills?.routing?.matched_skills
    ?.map((s) => s.name ?? s.id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    ?? result.classification?.matched_skills
    ?? [];

  const lines: string[] = [
    '### Classification Result\n',
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Effort Level** | \`${result.classification?.effort_level ?? 'unknown'}\` |`,
    `| **Intent Type** | \`${result.classification?.intent_type ?? 'unknown'}\` |`,
    `| **Matched Skills** | ${matchedSkills.length ? matchedSkills.map((s) => `\`${s}\``).join(', ') : 'none'} |`,
  ];

  const execSummary = getExecutionSummary(result);
  if (execSummary) {
    lines.push(
      '',
      '### Execution Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Latency | ${execSummary.execution_time_ms}ms |`,
      `| Tokens Saved | ~${getTokensSaved(result)} |`,
      `| Model | ${execSummary.classifier_model ?? 'unknown'} |`,
      `| Degraded Components | ${(execSummary.degraded_components ?? []).length} |`
    );
  }

  const re = getReverseEngineering(result);
  if (re) {
    lines.push('', '### Reverse Engineering', '');
    if (re.explicit_wants?.length) {
      lines.push('**Explicit wants:**');
      re.explicit_wants.forEach(w => lines.push(`- ${w}`));
    }
    if (re.implicit_wants?.length) {
      lines.push('**Implicit wants:**');
      re.implicit_wants.forEach(w => lines.push(`- ${w}`));
    }
    if (re.gotchas?.length) {
      lines.push('**Gotchas:**');
      re.gotchas.forEach(g => lines.push(`- ${g}`));
    }
  }

  const additionalContext = buildUserPromptAdditionalContext(result);
  if (additionalContext.trim()) {
    lines.push('', '### GMTR Intelligence', '', '```text', additionalContext, '```');
  }

  const feedback = {
    originalPrompt: prompt,
    sessionId: session.getSessionId(),
    projectId: session.getProjectId(),
    branch: session.getBranch(),
    classification: {
      effort_level: result.classification?.effort_level,
      intent_type: result.classification?.intent_type,
    },
  };
  session.recordFeedbackContext(feedback);
  trace?.add(
    'command',
    'Dry-run classification completed',
    `${result.classification?.effort_level ?? 'unknown'}/${result.classification?.intent_type ?? 'unknown'}`,
    'success',
  );

  stream.markdown(lines.join('\n'));
  return { metadata: { command: 'classify', classification: result, feedback } };
}

/**
 * Handle the /status slash command — show session info and metrics.
 */
export async function handleStatus(
  stream: vscode.ChatResponseStream,
  session: SessionManager,
  metrics: MetricsTracker,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  trace?.add('command', 'Session status requested', session.getProjectId());
  const averageExplicitRating = metrics.getAverageExplicitRating();
  const lines: string[] = [
    '### gramatr Session Status\n',
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Session ID** | \`${session.getSessionId().slice(0, 8)}...\` |`,
    `| **Project** | \`${session.getProjectId()}\` |`,
    `| **Branch** | \`${session.getBranch()}\` |`,
    `| **Restore Source** | ${session.getRestoreSource()} |`,
    `| **Uptime** | ${session.getUptime()} |`,
    `| **Handoff Loaded** | ${session.getHandoff() ? 'yes' : 'no'} |`,
    '',
    '### Metrics\n',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| **Classifications** | ${metrics.getTotalClassifications()} |`,
    `| **Tokens Saved** | ~${metrics.getTotalTokensSaved().toLocaleString()} |`,
    `| **Avg Latency** | ${metrics.getAverageLatency()}ms |`,
    `| **Cache Hit Rate** | ${metrics.getCacheHitRate()}% |`,
    `| **Feedback Submitted** | ${metrics.getFeedbackCount()} |`,
    `| **Helpful / Unhelpful** | ${metrics.getHelpfulFeedbackCount()} / ${metrics.getUnhelpfulFeedbackCount()} |`,
    `| **Avg Explicit Rating** | ${averageExplicitRating === null ? 'n/a' : `${averageExplicitRating}/10`} |`,
  ];

  const handoff = session.getHandoff();
  if (handoff) {
    lines.push(
      '',
      '### Active Handoff',
      '',
      `**Where we are:** ${handoff.where_we_are}`,
      '',
      `**What\'s next:** ${handoff.whats_next}`
    );
  }

  stream.markdown(lines.join('\n'));
  return { metadata: { command: 'status' } };
}

/**
 * Handle the /mcp-tools slash command — show the main gramatr MCP tools and when to use them.
 */
export async function handleMcpTools(
  stream: vscode.ChatResponseStream,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  trace?.add('command', 'MCP tools guide requested', 'mcp-tools');
  stream.markdown([
    '### gramatr MCP Tools',
    '',
    '**Preferred order:**',
    '1. `gramatr_route_request`',
    '2. `gramatr_execute_intent`',
    '3. `gramatr_load_handoff`',
    '4. `search_semantic`',
    '5. `search_entities`',
    '6. `get_entities`',
    '7. graph tools',
    '8. CRUD tools',
    '',
    '**Use these tools this way:**',
    '- `gramatr_route_request` — first stop for ambiguous, substantial, or multi-step requests',
    '- `gramatr_execute_intent` — common natural-language retrieval workflows',
    '- `gramatr_load_handoff` — continuity, resume, and “what were we doing?” questions',
    '- `search_semantic` — conceptual or fuzzy memory retrieval',
    '- `search_entities` — exact lookup by name, type, or metadata',
    '- `get_entities` — fetch details for known entity IDs',
    '- graph tools — exact relationship inspection',
    '- CRUD tools — only when the user clearly wants a mutation',
    '',
    '**Affiliated commands:**',
    '- `/mcp-tools`',
    '- `/status`',
    '- `/handoff`',
    '- `/clear`',
    '- `/rate`',
    '- `/classify`',
    '',
    '**Practical defaults:**',
    '- “What were we working on?” → `gramatr_load_handoff`, then `search_semantic` if needed',
    '- “Find context about X” → `gramatr_execute_intent` or `search_semantic`',
    '- “Find the exact entity named X” → `search_entities`',
    '- “Show details for this known entity ID” → `get_entities`',
  ].join('\n'));
  return { metadata: { command: 'mcp-tools' } };
}

/**
 * Handle the /clear slash command — reset session state.
 */
export async function handleClear(
  stream: vscode.ChatResponseStream,
  session: SessionManager,
  metrics: MetricsTracker,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  await session.reset();
  metrics.reset();
  trace?.add('command', 'Session cleared', session.getSessionId(), 'success');
  stream.markdown('Session reset. New session started with ID `' + session.getSessionId().slice(0, 8) + '...`');
  return { metadata: { command: 'clear' } };
}

export async function handleHandoff(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  session: SessionManager,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  const input = request.prompt.trim();
  const [action, ...rest] = input.split(/\s+/).filter(Boolean);
  const detail = rest.join(' ').trim();

  if (action !== 'save' && action !== 'load') {
    stream.markdown('Use `/handoff load` to show the current handoff or `/handoff save` to persist a new one.');
    return { metadata: { command: 'handoff' } };
  }

  if (action === 'load') {
    const current = session.getHandoff();
    const handoff = current ?? await session.reloadHandoff();
    if (!handoff) {
      trace?.add('command', 'Handoff load returned no data', session.getProjectId(), 'warning');
      stream.markdown('No handoff is currently loaded, and the server did not return one.');
      return { metadata: { command: 'handoff', action: 'load' } };
    }

    trace?.add('command', 'Handoff displayed', handoff.where_we_are, 'success');
    stream.markdown(formatHandoffMarkdown(handoff, current ? 'Loaded from current session state.' : 'Reloaded from gramatr.'));
    return { metadata: { command: 'handoff', action: 'load', handoff } };
  }

  stream.progress('Saving handoff...');
  const saved = await session.saveHandoff(detail);
  if (!saved) {
    trace?.add('command', 'Handoff save failed', detail || session.getProjectId(), 'warning');
    stream.markdown('Handoff save failed. The server may be unavailable.');
    return { metadata: { command: 'handoff', action: 'save' } };
  }

  trace?.add('command', 'Handoff saved via slash command', saved.what_shipped, 'success');
  stream.markdown(formatHandoffMarkdown(saved, 'Saved to gramatr.'));
  return { metadata: { command: 'handoff', action: 'save', handoff: saved } };
}

export async function handleRate(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  client: GramatrClient,
  session: SessionManager,
  metrics: MetricsTracker,
  trace?: TraceStore
): Promise<vscode.ChatResult> {
  const input = request.prompt.trim();
  const match = input.match(/^(\d{1,2})(?:\s+(.*))?$/);

  if (!match) {
    stream.markdown('Provide a numeric rating from 1 to 10. Example: `/rate 8`');
    return { metadata: { command: 'rate' } };
  }

  const rating = Number(match[1]);
  const comment = match[2]?.trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    stream.markdown('Rating must be an integer from 1 to 10.');
    return { metadata: { command: 'rate' } };
  }

  const context = session.getLastFeedbackContext();
  if (!context) {
    stream.markdown('No recent classified gramatr response is available to rate yet.');
    return { metadata: { command: 'rate', rating } };
  }

  const submitted = await client.submitRating(rating, context, comment);
  if (!submitted) {
    trace?.add('feedback', 'Explicit rating submission failed', `rating=${rating}`, 'warning');
    stream.markdown('Rating submission failed. The feedback endpoint may be unavailable.');
    return { metadata: { command: 'rate', rating } };
  }

  metrics.recordFeedback(rating, 'explicit');
  trace?.add('feedback', 'Explicit rating submitted', `rating=${rating}`, 'success');
  stream.markdown(`Recorded rating ${rating}/10 for the most recent classified request.`);
  return { metadata: { command: 'rate', rating } };
}

function formatHandoffMarkdown(handoff: { where_we_are: string; what_shipped: string; whats_next: string; key_context: string; dont_forget: string }, summary: string): string {
  return [
    '### Handoff',
    '',
    summary,
    '',
    `**Where we are:** ${handoff.where_we_are}`,
    '',
    `**What shipped:** ${handoff.what_shipped}`,
    '',
    `**What\'s next:** ${handoff.whats_next}`,
    '',
    `**Key context:** ${handoff.key_context}`,
    '',
    `**Don\'t forget:** ${handoff.dont_forget}`,
  ].join('\n');
}
