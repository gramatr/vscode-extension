/**
 * cache.ts — LRU cache for v2 intelligence packets, keyed by (project, branch, prompt).
 *
 * The deep-clone logic walks the v2 packet shape so retrieved entries are
 * safely mutable by callers (the formatter appends lines, handler stamps
 * cache_hit, etc.) without corrupting the cached copy.
 */

import type {
  ClassificationResult,
  ComposedAgentDefinition,
  IntelligencePacketV2,
  ReverseEngineering,
  SuggestedAgentDefinition,
} from './types';

const DEFAULT_CACHE_SIZE = 50;

export function buildClassificationCacheKey(
  prompt: string,
  projectId?: string,
  branch?: string
): string {
  return [projectId ?? '', branch ?? '', prompt.trim()].join('::');
}

export class ClassificationCache {
  private readonly entries = new Map<string, IntelligencePacketV2>();

  constructor(private readonly maxSize: number = DEFAULT_CACHE_SIZE) {}

  get(key: string): ClassificationResult | null {
    const cached = this.entries.get(key);
    if (!cached) {
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, cached);

    return cloneIntelligencePacket(cached, true);
  }

  set(key: string, value: IntelligencePacketV2): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, cloneIntelligencePacket(value));

    if (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Deep-clone helpers
// ---------------------------------------------------------------------------

function cloneReverseEngineering(re: ReverseEngineering | undefined): ReverseEngineering | undefined {
  if (!re) return undefined;
  return {
    explicit_wants: re.explicit_wants ? [...re.explicit_wants] : undefined,
    implicit_wants: re.implicit_wants ? [...re.implicit_wants] : undefined,
    explicit_dont_wants: re.explicit_dont_wants ? [...re.explicit_dont_wants] : undefined,
    implicit_dont_wants: re.implicit_dont_wants ? [...re.implicit_dont_wants] : undefined,
    gotchas: re.gotchas ? [...re.gotchas] : undefined,
    constraints_extracted: re.constraints_extracted ? [...re.constraints_extracted] : undefined,
  };
}

function cloneComposedAgent(agent: ComposedAgentDefinition): ComposedAgentDefinition {
  return {
    ...agent,
    expertise_areas: agent.expertise_areas ? [...agent.expertise_areas] : undefined,
  };
}

function cloneSuggestedAgent(agent: SuggestedAgentDefinition): SuggestedAgentDefinition {
  return { ...agent };
}

function cloneIntelligencePacket(
  packet: IntelligencePacketV2,
  cacheHit?: boolean
): IntelligencePacketV2 {
  const clone: IntelligencePacketV2 = { ...packet };

  if (packet.manifest) {
    clone.manifest = { ...packet.manifest };
  }

  if (packet.classification) {
    clone.classification = {
      ...packet.classification,
      behavioral_directives: packet.classification.behavioral_directives
        ? [...packet.classification.behavioral_directives]
        : undefined,
      quality_gate_criteria: packet.classification.quality_gate_criteria
        ? [...packet.classification.quality_gate_criteria]
        : undefined,
      matched_skills: packet.classification.matched_skills
        ? [...packet.classification.matched_skills]
        : undefined,
      constraints_extracted: packet.classification.constraints_extracted
        ? [...packet.classification.constraints_extracted]
        : undefined,
      suggested_capabilities: packet.classification.suggested_capabilities
        ? [...packet.classification.suggested_capabilities]
        : undefined,
      reverse_engineering: cloneReverseEngineering(packet.classification.reverse_engineering),
    };
  }

  if (packet.routing) {
    const signals = packet.routing.classifier_signals;
    clone.routing = {
      classifier_signals: signals
        ? {
            ...signals,
            heads: signals.heads ? { ...signals.heads } : undefined,
            entity_type_suggestion: signals.entity_type_suggestion
              ? { ...signals.entity_type_suggestion }
              : undefined,
            safety_flags: signals.safety_flags ? [...signals.safety_flags] : undefined,
          }
        : undefined,
    };
  }

  if (packet.memory) {
    clone.memory = {
      ...packet.memory,
      context: packet.memory.context
        ? {
            ...packet.memory.context,
            results: packet.memory.context.results?.map((r) => ({ ...r })),
          }
        : undefined,
      search_results: packet.memory.search_results
        ? {
            ...packet.memory.search_results,
            results: packet.memory.search_results.results?.map((r) => ({ ...r })),
          }
        : undefined,
    };
  }

  if (packet.orchestration) {
    clone.orchestration = {
      skills: packet.orchestration.skills
        ? {
            routing: packet.orchestration.skills.routing
              ? {
                  ...packet.orchestration.skills.routing,
                  matched_skills: packet.orchestration.skills.routing.matched_skills?.map((s) => ({ ...s })),
                }
              : undefined,
            active: packet.orchestration.skills.active
              ? {
                  ...packet.orchestration.skills.active,
                  directives: packet.orchestration.skills.active.directives
                    ? [...packet.orchestration.skills.active.directives]
                    : undefined,
                }
              : undefined,
          }
        : undefined,
      agents: packet.orchestration.agents
        ? {
            recommendation: packet.orchestration.agents.recommendation
              ? { ...packet.orchestration.agents.recommendation }
              : undefined,
            suggested: packet.orchestration.agents.suggested?.map(cloneSuggestedAgent),
            composed: packet.orchestration.agents.composed?.map(cloneComposedAgent),
          }
        : undefined,
    };
  }

  if (packet.process) {
    clone.process = {
      capability_audit: packet.process.capability_audit
        ? {
            ...packet.process.capability_audit,
            entries: packet.process.capability_audit.entries?.map((e) => ({ ...e })),
          }
        : undefined,
      phase_template: packet.process.phase_template
        ? {
            ...packet.process.phase_template,
            phases: packet.process.phase_template.phases
              ? [...packet.process.phase_template.phases]
              : undefined,
          }
        : undefined,
      format_spec: packet.process.format_spec
        ? {
            ...packet.process.format_spec,
            phases: packet.process.format_spec.phases ? [...packet.process.format_spec.phases] : undefined,
            response_contract: packet.process.format_spec.response_contract
              ? [...packet.process.format_spec.response_contract]
              : undefined,
          }
        : undefined,
      quality_gate_config: packet.process.quality_gate_config
        ? {
            ...packet.process.quality_gate_config,
            rules: packet.process.quality_gate_config.rules?.map((r) => ({ ...r })),
            word_range: packet.process.quality_gate_config.word_range
              ? { ...packet.process.quality_gate_config.word_range }
              : undefined,
          }
        : undefined,
    };
  }

  if (packet.directives) {
    clone.directives = {
      hard_gates: packet.directives.hard_gates ? [...packet.directives.hard_gates] : undefined,
      behavioral_directives: packet.directives.behavioral_directives
        ? [...packet.directives.behavioral_directives]
        : undefined,
      required_actions: packet.directives.required_actions
        ? [...packet.directives.required_actions]
        : undefined,
      behavioral_rules: packet.directives.behavioral_rules
        ? {
            algorithm_phases: packet.directives.behavioral_rules.algorithm_phases
              ? [...packet.directives.behavioral_rules.algorithm_phases]
              : undefined,
            hard_gates: packet.directives.behavioral_rules.hard_gates
              ? [...packet.directives.behavioral_rules.hard_gates]
              : undefined,
            verification_rules: packet.directives.behavioral_rules.verification_rules
              ? [...packet.directives.behavioral_rules.verification_rules]
              : undefined,
            code_rules: packet.directives.behavioral_rules.code_rules
              ? [...packet.directives.behavioral_rules.code_rules]
              : undefined,
            safety_rules: packet.directives.behavioral_rules.safety_rules
              ? [...packet.directives.behavioral_rules.safety_rules]
              : undefined,
            response_contract: packet.directives.behavioral_rules.response_contract
              ? [...packet.directives.behavioral_rules.response_contract]
              : undefined,
            quality_bar: packet.directives.behavioral_rules.quality_bar
              ? [...packet.directives.behavioral_rules.quality_bar]
              : undefined,
            learn_requirements: packet.directives.behavioral_rules.learn_requirements
              ? [...packet.directives.behavioral_rules.learn_requirements]
              : undefined,
          }
        : undefined,
    };
  }

  if (packet.enrichment) {
    clone.enrichment = {
      status: packet.enrichment.status,
      data: packet.enrichment.data
        ? {
            reasoning: packet.enrichment.data.reasoning
              ? {
                  reverse_engineering: cloneReverseEngineering(
                    packet.enrichment.data.reasoning.reverse_engineering
                  ),
                  quality_gate_criteria: packet.enrichment.data.reasoning.quality_gate_criteria
                    ? [...packet.enrichment.data.reasoning.quality_gate_criteria]
                    : undefined,
                }
              : undefined,
          }
        : undefined,
    };
  }

  if (packet.execution) {
    clone.execution = {
      summary: packet.execution.summary
        ? {
            ...packet.execution.summary,
            degraded_components: packet.execution.summary.degraded_components
              ? [...packet.execution.summary.degraded_components]
              : undefined,
            stage_timing: packet.execution.summary.stage_timing
              ? { ...packet.execution.summary.stage_timing }
              : undefined,
            cache_hit: cacheHit ?? packet.execution.summary.cache_hit,
          }
        : undefined,
      token_savings: packet.execution.token_savings ? { ...packet.execution.token_savings } : undefined,
      diagnostics: packet.execution.diagnostics
        ? {
            memory_context: packet.execution.diagnostics.memory_context
              ? { ...packet.execution.diagnostics.memory_context }
              : undefined,
            project_state: packet.execution.diagnostics.project_state
              ? { ...packet.execution.diagnostics.project_state }
              : undefined,
          }
        : undefined,
    };
  }

  // Legacy backward-compat shims (root-level execution_summary / token_savings)
  if (packet.execution_summary) {
    clone.execution_summary = {
      ...packet.execution_summary,
      degraded_components: packet.execution_summary.degraded_components
        ? [...packet.execution_summary.degraded_components]
        : undefined,
      stage_timing: packet.execution_summary.stage_timing
        ? { ...packet.execution_summary.stage_timing }
        : undefined,
      cache_hit: cacheHit ?? packet.execution_summary.cache_hit,
    };
  }
  if (packet.token_savings) {
    clone.token_savings = { ...packet.token_savings };
  }

  return clone;
}
