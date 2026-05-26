/**
 * formatting.ts — self-contained v2 intelligence packet formatter.
 *
 * Reads the canonical `gmtr.intelligence.contract.v2` packet and produces the
 * text block injected into the model's context BEFORE the user prompt. All
 * reads go through accessor helpers in `./types` so "prefer v2, fall back to
 * legacy" logic is centralized.
 *
 * Load-bearing injections — these are the pieces that must reach the model:
 *   1. directives.hard_gates             — non-negotiable constraints
 *   2. directives.behavioral_directives  — per-turn behavioral instructions
 *   3. process.phase_template            — effort-gated phase sequence
 *   4. orchestration.agents.composed     — sub-agent system prompts (VERBATIM)
 *   5. enrichment ... quality_gate_criteria       — Quality Gate criteria
 *   6. classification.reverse_engineering — explicit/implicit wants, gotchas
 *   7. memory.search_results             — retrieval context
 *
 * This file intentionally has no runtime dependency on the canonical
 * server-side formatter so the esbuild bundle does NOT pull in node:sqlite
 * through the mcp hooks chain.
 */

import {
  type ClassifierHeadValue,
  type ComposedAgentDefinition,
  type IntelligencePacketV2,
  type MemoryContextEntry,
  type PhaseTemplate,
  type RouteResponse,
  getBehavioralDirectives,
  getClassifierHeads,
  getComposedAgents,
  getExecutionSummary,
  getHardGates,
  getMemorySearchResults,
  getPhaseTemplate,
  getQualityGates,
  getReverseEngineering,
} from './types';

function trimLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function formatList(title: string, items: string[] | undefined, maxItems = 5): string[] {
  if (!items || items.length === 0) return [];
  const lines = [title];
  for (const item of items.slice(0, maxItems)) {
    const text = trimLine(item);
    if (text) lines.push(`- ${text}`);
  }
  return lines.length > 1 ? lines : [];
}

function formatHardGates(packet: IntelligencePacketV2): string[] {
  // Hard gates are the MOST important thing the model must see — surface them
  // at the top of the injection with an emphatic header.
  const gates = getHardGates(packet);
  if (!gates.length) return [];
  const lines = ['Hard gates (NON-NEGOTIABLE):'];
  for (const gate of gates.slice(0, 10)) {
    const text = trimLine(gate);
    if (text) lines.push(`- ${text}`);
  }
  return lines.length > 1 ? lines : [];
}

function formatPhaseTemplate(packet: IntelligencePacketV2): string[] {
  const phase: PhaseTemplate | undefined = getPhaseTemplate(packet);
  if (!phase) return [];
  const parts: string[] = [];
  if (phase.phases?.length) parts.push(`sequence=${phase.phases.join(' → ')}`);
  if (phase.effort_level) parts.push(`effort=${phase.effort_level}`);
  if (phase.header) parts.push(trimLine(phase.header));
  const lines: string[] = [];
  if (parts.length) lines.push(`Phase template: ${parts.join(' | ')}`);
  if (phase.phase_description) lines.push(trimLine(phase.phase_description));
  if (phase.time_check) lines.push(`Time check: ${trimLine(phase.time_check)}`);
  return lines;
}

function formatComposedAgents(packet: IntelligencePacketV2): string[] {
  // Composed agents carry full system prompts that must be passed VERBATIM when
  // launching sub-agents. We surface them with an explicit instruction so the
  // model knows not to rewrite or paraphrase.
  const agents: ComposedAgentDefinition[] = getComposedAgents(packet);
  if (!agents.length) return [];
  const lines: string[] = [
    'Composed sub-agents (use system_prompt VERBATIM when launching):',
  ];
  for (const agent of agents) {
    const header = [agent.display_name ?? agent.name, agent.task_domain]
      .filter(Boolean)
      .join(' — ');
    if (header) lines.push(`## ${header}`);
    if (agent.expertise_areas?.length) {
      lines.push(`Expertise: ${agent.expertise_areas.join(', ')}`);
    }
    if (agent.model_preference) {
      lines.push(`Model preference: ${agent.model_preference}`);
    }
    if (agent.context_summary) {
      lines.push(`Context: ${trimLine(agent.context_summary)}`);
    }
    if (agent.system_prompt) {
      lines.push('System prompt:');
      // Intentional: do NOT trimLine — the prompt's structure (blank lines,
      // bullet lists) must be preserved verbatim for downstream sub-agents.
      lines.push('```');
      lines.push(agent.system_prompt.trimEnd());
      lines.push('```');
    }
  }
  return lines;
}

function formatMemoryContext(packet: IntelligencePacketV2): string[] {
  const results: MemoryContextEntry[] = getMemorySearchResults(packet);
  if (results.length === 0) return [];
  const lines = ['Memory context:'];
  for (const result of results.slice(0, 5)) {
    const labelParts = [result.entity_name, result.entity_type].filter(Boolean);
    const label = labelParts.join(' / ');
    const content = trimLine(result.summary || result.snippet || result.content || '').slice(0, 220);
    if (label && content) lines.push(`- ${label}: ${content}`);
    else if (label) lines.push(`- ${label}`);
    else if (content) lines.push(`- ${content}`);
  }
  return lines.length > 1 ? lines : [];
}

function normalizeClassifierHeadScores(value: ClassifierHeadValue | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatClassifierHeads(packet: IntelligencePacketV2): string[] {
  const heads = getClassifierHeads(packet);
  if (!heads) return [];
  const entries = Object.entries(heads).slice(0, 5);
  if (!entries.length) return [];
  const lines: string[] = [];
  for (const [head, rawScores] of entries) {
    const top = normalizeClassifierHeadScores(rawScores).slice(0, 2).map((score) => {
      const numericScore = typeof score.score === 'number'
        ? score.score
        : typeof score.confidence === 'number'
          ? score.confidence
          : null;
      const pct = typeof numericScore === 'number' ? `${Math.round(numericScore * 100)}%` : '';
      return [score.label, pct].filter(Boolean).join(' ');
    }).filter(Boolean).join(', ');
    if (lines.length === 0) lines.push('Classifier heads:');
    lines.push(`- ${head}: ${top || 'present'}`);
  }
  return lines;
}

function formatRoutingSignals(packet: IntelligencePacketV2): string[] {
  const signals = packet.routing?.classifier_signals;
  if (!signals) return [];
  const parts = [
    signals.complexity ? `complexity=${signals.complexity}` : '',
    signals.crud_operation ? `crud=${signals.crud_operation}` : '',
    signals.conversation_phase ? `phase=${signals.conversation_phase}` : '',
    signals.memory_scope ? `scope=${signals.memory_scope}` : '',
    signals.memory_priority ? `memory=${signals.memory_priority}` : '',
    typeof signals.retrieval_needed === 'boolean' ? `retrieval=${signals.retrieval_needed}` : '',
    typeof signals.is_read_only === 'boolean' ? `read_only=${signals.is_read_only}` : '',
    typeof signals.requires_approval === 'boolean' ? `approval=${signals.requires_approval}` : '',
  ].filter(Boolean);
  const lines = parts.length ? [`Routing signals: ${parts.join(' | ')}`] : [];
  if (signals.entity_type_suggestion?.top) lines.push(`Entity suggestion: ${signals.entity_type_suggestion.top}`);
  if (signals.safety_flags?.length) lines.push(`Safety flags: ${signals.safety_flags.join(', ')}`);
  return lines;
}

function formatSkillRouting(packet: IntelligencePacketV2): string[] {
  const skillRouting = packet.orchestration?.skills?.routing;
  if (!skillRouting) return [];
  const lines: string[] = [];
  const matched = (skillRouting.matched_skills || [])
    .map((skill) => skill.name || skill.id)
    .filter(Boolean) as string[];
  if (matched.length) lines.push(`Skill routing: ${matched.join(', ')}`);
  const counts = [
    typeof skillRouting.use_count === 'number' ? `use=${skillRouting.use_count}` : '',
    typeof skillRouting.decline_count === 'number' ? `decline=${skillRouting.decline_count}` : '',
    typeof skillRouting.na_count === 'number' ? `na=${skillRouting.na_count}` : '',
    typeof skillRouting.pattern_boost_applied === 'boolean' ? `pattern_boost=${skillRouting.pattern_boost_applied}` : '',
  ].filter(Boolean);
  if (counts.length) lines.push(`Skill routing stats: ${counts.join(' | ')}`);
  return lines;
}

function formatCapabilityAudit(packet: IntelligencePacketV2): string[] {
  const audit = packet.process?.capability_audit;
  if (!audit?.formatted_summary) return [];
  return [audit.formatted_summary.trim()];
}

function formatAgentRecommendation(packet: IntelligencePacketV2): string[] {
  const rec = packet.orchestration?.agents?.recommendation;
  if (!rec?.type && !rec?.source) return [];
  const parts = [
    rec?.type ? `type=${rec.type}` : '',
    rec?.source ? `source=${rec.source}` : '',
    typeof rec?.confidence === 'number' ? `confidence=${Math.round(rec.confidence * 100)}%` : '',
  ].filter(Boolean);
  return parts.length ? [`Agent recommendation: ${parts.join(' | ')}`] : [];
}

function formatSuggestedAgents(packet: IntelligencePacketV2): string[] {
  const suggested = packet.orchestration?.agents?.suggested;
  if (!suggested?.length) return [];
  const lines = ['Suggested agents:'];
  for (const agent of suggested.slice(0, 5)) {
    const label = [agent.display_name ?? agent.name, agent.model]
      .filter(Boolean)
      .join(' / ');
    const reason = trimLine(agent.reason ?? '');
    if (label && reason) lines.push(`- ${label}: ${reason}`);
    else if (label) lines.push(`- ${label}`);
  }
  return lines.length > 1 ? lines : [];
}

function formatQualityGateConfig(packet: IntelligencePacketV2): string[] {
  const config = packet.process?.quality_gate_config;
  if (!config) return [];
  const parts: string[] = [];
  if (typeof config.min_criteria === 'number') parts.push(`min_criteria=${config.min_criteria}`);
  if (typeof config.anti_required === 'boolean') parts.push(`anti_required=${config.anti_required}`);
  if (config.word_range?.min || config.word_range?.max) {
    parts.push(`word_range=${config.word_range.min ?? '?'}-${config.word_range.max ?? '?'}`);
  }
  return parts.length ? [`Quality Gate config: ${parts.join(' | ')}`] : [];
}

function formatManifest(packet: IntelligencePacketV2): string[] {
  const manifest = packet.manifest;
  if (!manifest) return [];
  // TODO(#2465): packet_2_status and enrichment_id are deprecated on the
  // REST classify endpoint (sunset 2026-06-12). When the v2 packet is
  // sourced from mcp_route_request these fields remain meaningful for
  // now, but plan to drop them from this formatter once /api/v1/classify
  // stops emitting them.
  const parts = [
    manifest.packet_2_status ? `packet_2=${manifest.packet_2_status}` : '',
    manifest.enrichment_id ? `enrichment_id=${manifest.enrichment_id}` : '',
    manifest.interaction_id ? `interaction_id=${manifest.interaction_id}` : '',
  ].filter(Boolean);
  return parts.length ? [`Manifest: ${parts.join(' | ')}`] : [];
}

function formatDiagnostics(packet: IntelligencePacketV2): string[] {
  const lines: string[] = [];
  const diagnostics = packet.execution?.diagnostics;
  if (diagnostics?.memory_context?.status === 'error') {
    lines.push('Memory diagnostics:');
    lines.push(`- ${trimLine(diagnostics.memory_context.error || 'memory pre-load degraded')}`);
  }
  if (diagnostics?.project_state?.status === 'error') {
    lines.push('Project state diagnostics:');
    lines.push(`- ${trimLine(diagnostics.project_state.error || 'project state degraded')}`);
  }
  const executionSummary = getExecutionSummary(packet);
  const degradedClassifierStages = executionSummary?.degraded_components?.filter((component) =>
    component.startsWith('classification.')
  ) || [];
  if (degradedClassifierStages.length > 0) {
    lines.push('Classifier diagnostics:');
    for (const component of degradedClassifierStages) {
      lines.push(`- ${trimLine(`${component.replace('classification.', '').replace(/_/g, ' ')} degraded`)}`);
    }
  }
  return lines;
}

/**
 * Build the text block injected into model context before the user's prompt.
 * Reads exclusively from the v2 packet structure.
 */
export function buildUserPromptAdditionalContext(packet: RouteResponse): string {
  const lines: string[] = [];

  const statusline = packet.statusline_markdown;
  if (typeof statusline === 'string' && statusline.trim()) {
    lines.push(statusline.trim());
    lines.push('');
  }

  lines.push('[GMTR Intelligence]');

  // 1. Classification header — effort / intent / scope
  const classification = packet.classification;
  if (classification) {
    const parts = [
      classification.effort_level ? `effort=${classification.effort_level}` : '',
      classification.intent_type ? `intent=${classification.intent_type}` : '',
      classification.memory_tier ? `tier=${classification.memory_tier}` : '',
      classification.memory_scope ? `scope=${classification.memory_scope}` : '',
      typeof classification.confidence === 'number'
        ? `confidence=${Math.round(classification.confidence * 100)}%`
        : '',
    ].filter(Boolean);
    if (parts.length > 0) lines.push(parts.join(' | '));
  }

  // 2. Manifest metadata
  lines.push(...formatManifest(packet));

  // 3. HARD GATES — non-negotiable constraints, surfaced first.
  lines.push(...formatHardGates(packet));

  // 4. Behavioral directives
  lines.push(...formatList(
    'Behavioral directives:',
    getBehavioralDirectives(packet),
    8
  ));

  // 5. Phase template — effort-gated execution sequence
  lines.push(...formatPhaseTemplate(packet));

  // 6. Reverse engineering — explicit/implicit wants, gotchas
  const re = getReverseEngineering(packet);
  lines.push(...formatList('Explicit wants:', re?.explicit_wants, 5));
  lines.push(...formatList('Implicit wants:', re?.implicit_wants, 4));
  lines.push(...formatList('Explicit don\'t wants:', re?.explicit_dont_wants, 4));
  lines.push(...formatList('Implicit don\'t wants:', re?.implicit_dont_wants, 4));
  lines.push(...formatList('Gotchas:', re?.gotchas, 4));
  lines.push(...formatList(
    'Constraints:',
    re?.constraints_extracted ?? classification?.constraints_extracted,
    4
  ));

  // 7. Quality Gates — QG scaffold
  lines.push(...formatList('Quality Gates:', getQualityGates(packet), 6));
  lines.push(...formatQualityGateConfig(packet));

  // 8. Capability audit
  lines.push(...formatCapabilityAudit(packet));

  // 9. Classifier heads + routing signals
  lines.push(...formatClassifierHeads(packet));
  lines.push(...formatRoutingSignals(packet));

  // 10. Skill and agent orchestration
  lines.push(...formatSkillRouting(packet));
  lines.push(...formatAgentRecommendation(packet));
  lines.push(...formatSuggestedAgents(packet));

  // 11. Composed agents — VERBATIM system prompts for sub-agent launch
  lines.push(...formatComposedAgents(packet));

  // 12. Memory retrieval context
  lines.push(...formatMemoryContext(packet));

  // 13. Diagnostics — only when something failed
  lines.push(...formatDiagnostics(packet));

  return lines.join('\n').trim();
}
