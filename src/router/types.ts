/**
 * Re-declares the canonical wire types locally so the esbuild bundle does NOT
 * pull in packages/client/core/types → packages/mcp/src/hooks/lib/session.ts
 * → hook-state.ts → node:sqlite.  Keep in sync with mcp/src/hooks/lib/types.ts.
 *
 * This module describes the `gmtr.intelligence.contract.v2` packet, the
 * canonical wire format between the gramatr server and the VS Code extension.
 */

export interface RemoteSessionRecord {
  id: string;
  client_session_id: string | null;
  interaction_id: string | null;
  client_type: string | null;
  agent_name: string | null;
  git_branch: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  reason: string | null;
  summary: string | null;
}

export interface SessionStartResponse {
  project_id?: string;
  project_slug?: string;
  project_is_new?: boolean;
  interaction_id?: string;
  interactionId?: string;
  entity_id?: string;
  entityId?: string;
  interaction_resumed?: boolean;
  interactionResumed?: boolean;
  handoff_context?: string | null;
  handoffContext?: string | null;
  recent_sessions?: RemoteSessionRecord[];
}

export interface HandoffMeta {
  saved_at?: string;
  branch?: string;
  session_id?: string;
  conversation_id?: string;
  platform?: string;
  legacy_missing_platform?: boolean;
}

export interface HandoffResponse {
  status?: string;
  source?: string;
  project_id?: string;
  session_id?: string;
  branch?: string;
  platform?: string;
  created_at?: string;
  section_count?: number;
  _meta?: HandoffMeta;
  where_we_are?: string;
  what_shipped?: string;
  whats_next?: string;
  key_context?: string;
  dont_forget?: string;
}

// ---------------------------------------------------------------------------
// v2 intelligence packet — top-level sections
// ---------------------------------------------------------------------------

export interface V2Manifest {
  contract_shape?: string;
  completeness?: string;
  response_contract?: string;
  project_id?: string;
  session_id?: string;
  interaction_id?: string;
  turn_id?: string | null;
}

export interface ReverseEngineering {
  explicit_wants?: string[];
  implicit_wants?: string[];
  explicit_dont_wants?: string[];
  implicit_dont_wants?: string[];
  gotchas?: string[];
  constraints_extracted?: string[];
}

export interface V2Classification {
  effort_level?: string;
  intent_type?: string;
  confidence?: number;
  memory_tier?: string;
  behavioral_directives?: string[];
  quality_gate_criteria?: string[];
  reverse_engineering?: ReverseEngineering;
  // Backward-compat: older packets sometimes surfaced these at classification level.
  memory_scope?: string;
  matched_skills?: string[];
  constraints_extracted?: string[];
  suggested_capabilities?: string[];
  is_fallback?: boolean;
}

export interface ClassifierHeadScore {
  label?: string;
  score?: number;
  confidence?: number;
}

export type ClassifierHeadValue = ClassifierHeadScore | ClassifierHeadScore[];

export interface ClassifierHeads {
  domain_class?: ClassifierHeadValue;
  sentiment?: ClassifierHeadValue;
  urgency?: ClassifierHeadValue;
  intent_action?: ClassifierHeadValue;
  effort_granular?: ClassifierHeadValue;
  [head: string]: ClassifierHeadValue | undefined;
}

export interface V2Routing {
  classifier_signals?: {
    heads?: ClassifierHeads;
    complexity?: string;
    crud_operation?: string;
    conversation_phase?: string;
    memory_scope?: string;
    memory_priority?: string;
    retrieval_needed?: boolean;
    is_read_only?: boolean;
    requires_approval?: boolean;
    entity_type_suggestion?: { top?: string };
    safety_flags?: string[];
  };
}

export interface MemoryContextEntry {
  memory_id?: string;
  observation_id?: string;
  entity_id?: string;
  entity_name?: string;
  entity_type?: string;
  summary?: string;
  snippet?: string;
  content?: string;
  similarity?: number;
  similarity_score?: number;
}

export interface V2Memory {
  scope?: string;
  memory_scope?: string;
  enrichment_id?: string;
  resource_uris?: { entities?: string; search_results?: string; context?: string };
  context?: {
    total_count?: number;
    results?: MemoryContextEntry[];
  };
  search_results?: {
    results?: MemoryContextEntry[];
    count?: number;
    top_k?: number;
    scope?: string;
    search_scope?: string;
    cache_hit?: boolean;
    search_ms?: number;
    query?: string;
    entity_type_filter?: string | null;
  };
}

export interface SkillRoutingDefinition {
  matched_skills?: Array<{ name?: string; id?: string; prompt_uri?: string }>;
  source?: 'semantic' | 'keyword' | 'none';
  use_count?: number;
  decline_count?: number;
  na_count?: number;
  pattern_boost_applied?: boolean;
  routing_time_ms?: number;
}

export interface AgentRefDefinition {
  agent_id?: string;
  namespace?: 'builtin' | 'kb';
  display_name?: string;
  model_preference?: string;
  reason?: string | null;
  prompt_uri?: string;
}

export interface OrchestrationResource {
  entity_id?: string;
  entity_type?: string;
  display_name?: string;
  prompt_uri?: string;
  reason?: string;
}

export interface SuggestedAgentDefinition {
  name?: string;
  display_name?: string;
  model?: string;
  reason?: string;
}

export interface ComposedAgentDefinition {
  name?: string;
  display_name?: string;
  system_prompt?: string;
  expertise_areas?: string[];
  task_domain?: string;
  model_preference?: string;
  context_summary?: string;
}

export interface AgentRecommendationDefinition {
  type?: string;
  source?: string;
  confidence?: number;
}

export interface V2Orchestration {
  skills?: {
    routing?: SkillRoutingDefinition;
    active?: {
      name?: string;
      title?: string;
      phase?: string;
      directives?: string[];
    };
  };
  agents?: {
    mode?: 'refs' | 'inline';
    recommendation?: AgentRecommendationDefinition;
    agent_refs?: AgentRefDefinition[];
    agent_defs?: ComposedAgentDefinition[] | null;
    composed_ref?: { composition_id: string | null; resource_uri: string | null } | null;
    /** @deprecated use agent_refs */
    suggested?: SuggestedAgentDefinition[];
    /** @deprecated use agent_defs */
    composed?: ComposedAgentDefinition[];
  };
  resources?: {
    items?: OrchestrationResource[];
    queried_types?: string[];
  };
}

export interface CapabilityAuditEntry {
  id?: number;
  name?: string;
  section?: string;
  disposition?: string;
  reason?: string;
  phase?: string;
}

export interface CapabilityAuditResult {
  entries?: CapabilityAuditEntry[];
  use_count?: number;
  decline_count?: number;
  na_count?: number;
  formatted_summary?: string;
}

export interface PhaseTemplate {
  header?: string;
  time_check?: string;
  voice_message?: string;
  phase_description?: string;
  // v2 packets may also carry the raw phase sequence.
  phases?: string[];
  effort_level?: string;
}

export interface QualityGateRule {
  id?: string;
  name?: string;
  description?: string;
  min_effort?: string | null;
  automated?: boolean;
}

export interface QualityGateConfig {
  rules?: QualityGateRule[];
  min_criteria?: number;
  anti_required?: boolean;
  word_range?: { min?: number; max?: number };
}

export interface V2Process {
  capability_audit?: CapabilityAuditResult;
  phase_template?: PhaseTemplate;
  format_spec?: {
    mode?: string;
    phases?: string[];
    response_contract?: string[];
  };
  quality_gate_config?: QualityGateConfig;
}

export interface BehavioralRules {
  algorithm_phases?: string[];
  verification_rules?: string[];
  code_rules?: string[];
  safety_rules?: string[];
  response_contract?: string[];
  quality_bar?: string[];
  learn_requirements?: string[];
}

export interface V2Directives {
  hard_gates?: string[];
  behavioral_rules?: BehavioralRules;
  behavioral_directives?: string[];
  required_actions?: string[];
}

export interface QualityGateCriterion {
  id?: string;
  criterion?: string;
  /** E = Explicit, I = Implicit, R = Reasoned */
  confidence?: 'E' | 'I' | 'R';
  verify?: string;
}

export interface V2Enrichment {
  // Inference server shape (flat)
  reverse_engineering?: ReverseEngineering;
  quality_gate_criteria?: {
    scope?: 'simple' | 'medium' | 'large' | 'massive';
    criteria?: QualityGateCriterion[];
    anti_criteria?: QualityGateCriterion[];
  };
  constraints_extracted?: string[];
  implied_sentiment?: number;
  sentiment_signals?: string[];
  // TypeScript pipeline shape (nested)
  status?: string;
  data?: {
    reasoning?: {
      reverse_engineering?: ReverseEngineering;
      quality_gate_criteria?: string[];
    };
  };
}

export interface V2Generation {
  content?: string;
  model?: string;
  finish_reason?: string;
}

export interface V2Context {
  project_state?: {
    active_prd_id?: string;
    current_phase?: string;
    active_client?: string;
    last_updated?: string;
  };
  diary_compact?: Array<{
    id?: string;
    summary?: string | null;
    content?: string;
    created_at?: string | null;
  }>;
  session_history?: Array<{ role?: string; content?: string }>;
  curated_context?: string | null;
  context_references?: unknown[];
  statusline_markdown?: string | null;
}

export interface TokenSavings {
  claude_md_reduction?: number;
  observe_work_offloaded?: number;
  reasoning_tokens_used?: number;
  total_saved?: number;
  tokens_saved?: number;
  savings_ratio?: number;
  all_time?: number;
}

export interface ExecutionSummary {
  classifier_model?: string;
  classifier_time_ms?: number;
  execution_time_ms?: number;
  server_version?: string;
  stage_timing?: Record<string, number>;
  degraded_components?: string[];
  cache_hit?: boolean;
}

export interface V2Execution {
  summary?: ExecutionSummary;
  token_savings?: TokenSavings;
  diagnostics?: {
    memory_context?: {
      status?: string;
      requested_types?: string[];
      delivered_count?: number;
      error?: string;
    };
    project_state?: {
      status?: string;
      project_id?: string;
      error?: string;
    };
  };
}

/**
 * The canonical `gmtr.intelligence.contract.v2` packet.
 *
 * All fields are optional — the client must degrade gracefully when any
 * section is missing or partial. Field aliases at the root (classification,
 * behavioral_directives, etc.) are retained as thin backward-compat shims
 * consumed by existing session/metrics code paths.
 */
export interface IntelligencePacketV2 {
  schema?: string;
  manifest?: V2Manifest;
  classification?: V2Classification;
  routing?: V2Routing;
  memory?: V2Memory;
  context?: V2Context;
  orchestration?: V2Orchestration;
  process?: V2Process;
  directives?: V2Directives;
  enrichment?: V2Enrichment;
  generation?: V2Generation;
  execution?: V2Execution;

  // ---- Backward-compat shims ----
  /** Legacy: the server sometimes ships execution_summary at the root. */
  execution_summary?: ExecutionSummary;
  /** Legacy: the server sometimes ships token_savings at the root. */
  token_savings?: TokenSavings;
  /** Raw JSON text of the server response, stashed for downstream debugging. */
  raw_intelligence?: string;
  /** Optional statusline markdown (rendered by client views). */
  statusline_markdown?: string;
}

// ---------------------------------------------------------------------------
// Backward-compat aliases — every existing consumer imports these names.
// New code should prefer IntelligencePacketV2.
// ---------------------------------------------------------------------------

export type RouteResponse = IntelligencePacketV2;
export type ClassificationResult = IntelligencePacketV2;
export type Handoff = HandoffResponse;
export type RouteClassification = V2Classification;

export interface FeedbackContext {
  originalPrompt: string;
  sessionId?: string;
  projectId?: string;
  branch?: string;
  promptHash?: string;
  classification?: {
    effort_level?: string;
    intent_type?: string;
  };
}

export interface RouteRequestOptions {
  projectId?: string;
  projectUuid?: string;
  sessionId?: string;
  branch?: string;
}

export interface ClassificationFeedback {
  timestamp: string;
  was_correct: boolean;
  original_prompt: string;
  correct_effort_level?: string;
  correct_intent_type?: string;
  feedback_reason_codes?: string[];
  quality_notes?: string;
  client_type?: string;
  agent_name?: string;
}

export interface VscodeSessionStartResponse extends SessionStartResponse {
  session_id?: string;
  interaction_resumed?: boolean;
  interactionResumed?: boolean;
  handoff_context?: string;
  handoffContext?: string;
}

export interface EntitySummary {
  id: string;
  name: string;
  entityType: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
  isPublic?: boolean;
  inactive?: boolean;
}

export interface EntitiesListResponse {
  entities: EntitySummary[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
}

export interface EntitySearchResponse {
  results: EntitySummary[];
  count: number;
  limit: number;
  offset: number;
}

export interface StatuslineStats {
  server_version: string;
  entity_count: number;
  observation_count: number;
  search_count: number;
  classifications_total: number;
  classifications_7d: number;
  tokens_saved_total: number;
  tokens_saved_7d: number;
  operations_1h: number;
  operations_24h: number;
  classifier: {
    level: number;
    model: string;
    accuracy: number;
    feedback_rate: number;
    total_classifications: number;
  };
  learning: {
    latest: unknown | null;
    avg_1d: number | null;
    avg_1w: number | null;
    avg_1mo: number | null;
    count: number;
  };
  skills_count: number;
}

export interface DashboardStats {
  total_tokens_saved: number;
  tokens_saved_per_request: number;
  total_sessions: number;
  total_entities: number;
  total_observations: number;
  total_learnings: number;
  total_relations: number;
  classifier_accuracy: number;
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface McpJsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Accessor helpers — canonical read paths for the v2 packet.
//
// These accessors centralize the "prefer v2, fall back to legacy" logic so
// downstream code never has to open-code it. When the server eventually
// drops legacy shims, removing fallback branches here is a one-line fix.
// ---------------------------------------------------------------------------

export function getExecutionSummary(packet: IntelligencePacketV2 | null | undefined): ExecutionSummary | undefined {
  return packet?.execution?.summary ?? packet?.execution_summary;
}

export function getTokenSavings(packet: IntelligencePacketV2 | null | undefined): TokenSavings | undefined {
  return packet?.execution?.token_savings ?? packet?.token_savings;
}

export function getTokensSaved(packet: IntelligencePacketV2 | null | undefined): number {
  const savings = getTokenSavings(packet);
  return savings?.total_saved ?? savings?.tokens_saved ?? 0;
}

export function getClassifierHeads(packet: IntelligencePacketV2 | null | undefined): ClassifierHeads | undefined {
  return packet?.routing?.classifier_signals?.heads;
}

export function getHardGates(packet: IntelligencePacketV2 | null | undefined): string[] {
  return packet?.directives?.hard_gates ?? [];
}

export function getBehavioralDirectives(packet: IntelligencePacketV2 | null | undefined): string[] {
  return packet?.directives?.behavioral_directives
    ?? packet?.classification?.behavioral_directives
    ?? [];
}

export function getPhaseTemplate(packet: IntelligencePacketV2 | null | undefined): PhaseTemplate | undefined {
  return packet?.process?.phase_template;
}

export function getQualityGates(packet: IntelligencePacketV2 | null | undefined): string[] {
  // Inference server: enrichment.quality_gate_criteria.criteria as structured objects
  const criteria = packet?.enrichment?.quality_gate_criteria?.criteria;
  if (criteria?.length) return criteria.map(c => c.criterion ?? '').filter(Boolean);
  // TypeScript pipeline: enrichment.data.reasoning.quality_gate_criteria as string[]
  return packet?.enrichment?.data?.reasoning?.quality_gate_criteria
    ?? packet?.classification?.quality_gate_criteria
    ?? [];
}

export function getIscScaffold(packet: IntelligencePacketV2 | null | undefined): QualityGateCriterion[] | string[] {
  return packet?.enrichment?.quality_gate_criteria?.criteria
    ?? packet?.enrichment?.data?.reasoning?.quality_gate_criteria
    ?? packet?.classification?.quality_gate_criteria
    ?? [];
}

export function getReverseEngineering(packet: IntelligencePacketV2 | null | undefined): ReverseEngineering | undefined {
  // Inference server: enrichment.reverse_engineering (flat)
  if (packet?.enrichment?.reverse_engineering) return packet.enrichment.reverse_engineering;
  // TypeScript pipeline: enrichment.data.reasoning.reverse_engineering (nested)
  return packet?.enrichment?.data?.reasoning?.reverse_engineering
    ?? packet?.classification?.reverse_engineering;
}

export function getComposedAgents(packet: IntelligencePacketV2 | null | undefined): ComposedAgentDefinition[] {
  // Prefer agent_defs (inline mode, extended+ effort)
  return packet?.orchestration?.agents?.agent_defs
    ?? packet?.orchestration?.agents?.composed
    ?? [];
}

export function getSuggestedAgents(packet: IntelligencePacketV2 | null | undefined): SuggestedAgentDefinition[] {
  // agent_refs is the new shape; suggested is legacy
  return packet?.orchestration?.agents?.agent_refs
    ?? packet?.orchestration?.agents?.suggested
    ?? [];
}

export function getOrchestrationResources(packet: IntelligencePacketV2 | null | undefined): OrchestrationResource[] {
  return packet?.orchestration?.resources?.items ?? [];
}

export function getMemorySearchResults(packet: IntelligencePacketV2 | null | undefined): MemoryContextEntry[] {
  return packet?.memory?.search_results?.results
    ?? packet?.memory?.context?.results
    ?? [];
}
