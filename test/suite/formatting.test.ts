// gramatr VS Code Extension — Formatting Tests (v2 intelligence packet)
import { describe, it, expect } from 'vitest';
import { buildUserPromptAdditionalContext } from '../../src/router/formatting';
import type { ClassifierHeadValue, IntelligencePacketV2 } from '../../src/router/types';

describe('buildUserPromptAdditionalContext', () => {
  it('returns GMTR Intelligence header with no data', () => {
    const result = buildUserPromptAdditionalContext({});
    expect(result).toBe('[GMTR Intelligence]');
  });

  it('includes statusline markdown when present', () => {
    const route: IntelligencePacketV2 = { statusline_markdown: '## Status Line' };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('## Status Line');
    expect(result).toContain('[GMTR Intelligence]');
  });

  it('includes classification effort, intent, and memory tier', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        effort_level: 'standard',
        intent_type: 'create',
        memory_tier: 'hot',
        confidence: 0.92,
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('effort=standard');
    expect(result).toContain('intent=create');
    expect(result).toContain('tier=hot');
    expect(result).toContain('confidence=92%');
  });

  it('surfaces hard gates with NON-NEGOTIABLE header', () => {
    const route: IntelligencePacketV2 = {
      directives: {
        hard_gates: ['Never delete production data', 'Always parameterize SQL'],
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Hard gates (NON-NEGOTIABLE):');
    expect(result).toContain('- Never delete production data');
    expect(result).toContain('- Always parameterize SQL');
  });

  it('skips hard gates header when list is empty', () => {
    const route: IntelligencePacketV2 = { directives: { hard_gates: [] } };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Hard gates');
  });

  it('injects behavioral directives from directives.behavioral_directives', () => {
    const route: IntelligencePacketV2 = {
      directives: {
        behavioral_directives: ['Follow Quality Gates', 'Use TypeScript'],
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Behavioral directives:');
    expect(result).toContain('- Follow Quality Gates');
  });

  it('falls back to classification.behavioral_directives for legacy packets', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        behavioral_directives: ['Legacy directive'],
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Behavioral directives:');
    expect(result).toContain('- Legacy directive');
  });

  it('injects phase template with sequence and effort', () => {
    const route: IntelligencePacketV2 = {
      process: {
        phase_template: {
          phases: ['OBSERVE', 'PLAN', 'BUILD', 'VERIFY'],
          effort_level: 'standard',
          phase_description: 'Standard 4-phase build',
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Phase template:');
    expect(result).toContain('sequence=OBSERVE → PLAN → BUILD → VERIFY');
    expect(result).toContain('effort=standard');
    expect(result).toContain('Standard 4-phase build');
  });

  it('skips phase template when absent', () => {
    const route: IntelligencePacketV2 = { process: {} };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Phase template:');
  });

  it('injects composed agents with VERBATIM instruction and system_prompt', () => {
    const route: IntelligencePacketV2 = {
      orchestration: {
        agents: {
          composed: [
            {
              name: 'engineer',
              display_name: 'Engineer',
              system_prompt: 'You are an engineer.\nTests first.',
              expertise_areas: ['typescript', 'testing'],
              task_domain: 'code',
              model_preference: 'claude-sonnet',
              context_summary: 'Working in the vscode extension worktree',
            },
          ],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Composed sub-agents (use system_prompt VERBATIM when launching):');
    expect(result).toContain('## Engineer — code');
    expect(result).toContain('Expertise: typescript, testing');
    expect(result).toContain('Model preference: claude-sonnet');
    expect(result).toContain('Context: Working in the vscode extension worktree');
    // System prompt must be preserved verbatim including newlines
    expect(result).toContain('You are an engineer.\nTests first.');
  });

  it('skips composed agents section when none present', () => {
    const route: IntelligencePacketV2 = { orchestration: { agents: { composed: [] } } };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Composed sub-agents');
  });

  it('includes reverse engineering from enrichment path', () => {
    const route: IntelligencePacketV2 = {
      enrichment: {
        data: {
          reasoning: {
            reverse_engineering: {
              explicit_wants: ['Build OAuth', 'Add tests'],
              implicit_wants: ['Handle errors'],
              gotchas: ['Token expiry'],
              constraints_extracted: ['Must use TypeScript'],
            },
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Explicit wants:');
    expect(result).toContain('- Build OAuth');
    expect(result).toContain('Implicit wants:');
    expect(result).toContain('- Handle errors');
    expect(result).toContain('Gotchas:');
    expect(result).toContain('- Token expiry');
    expect(result).toContain('Constraints:');
    expect(result).toContain('- Must use TypeScript');
  });

  it('falls back to classification.reverse_engineering when enrichment absent', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        reverse_engineering: {
          explicit_wants: ['Fallback want'],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('- Fallback want');
  });

  it('includes explicit and implicit dont wants', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        reverse_engineering: {
          explicit_dont_wants: ['No external deps'],
          implicit_dont_wants: ['Avoid premature abstraction'],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain("Explicit don't wants:");
    expect(result).toContain('- No external deps');
    expect(result).toContain("Implicit don't wants:");
    expect(result).toContain('- Avoid premature abstraction');
  });

  it('includes Quality Gate scaffold from enrichment path', () => {
    const route: IntelligencePacketV2 = {
      enrichment: {
        data: {
          reasoning: {
            quality_gate_criteria: ['Tests pass', 'Coverage > 80%'],
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Quality Gates:');
    expect(result).toContain('- Tests pass');
    expect(result).toContain('- Coverage > 80%');
  });

  it('falls back to classification.quality_gate_criteria for Quality Gates', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        quality_gate_criteria: ['Legacy gate'],
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('- Legacy gate');
  });

  it('includes Quality Gate config metadata', () => {
    const route: IntelligencePacketV2 = {
      process: {
        quality_gate_config: {
          min_criteria: 4,
          anti_required: true,
          word_range: { min: 8, max: 12 },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Quality Gate config:');
    expect(result).toContain('min_criteria=4');
    expect(result).toContain('anti_required=true');
    expect(result).toContain('word_range=8-12');
  });

  it('includes capability audit formatted summary', () => {
    const route: IntelligencePacketV2 = {
      process: {
        capability_audit: {
          formatted_summary: '  3 capabilities matched  ',
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('3 capabilities matched');
  });

  it('includes classifier heads from routing.classifier_signals.heads', () => {
    const route: IntelligencePacketV2 = {
      routing: {
        classifier_signals: {
          heads: {
            domain_class: [
              { label: 'engineering', score: 0.95 },
              { label: 'research', score: 0.05 },
            ],
            sentiment: { label: 'neutral', confidence: 0.8 },
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Classifier heads:');
    expect(result).toContain('domain_class:');
    expect(result).toContain('engineering 95%');
    expect(result).toContain('sentiment:');
    expect(result).toContain('neutral 80%');
  });

  it('shows "present" for classifier head with no numeric score', () => {
    const route: IntelligencePacketV2 = {
      routing: {
        classifier_signals: {
          heads: {
            test_head: { label: 'value' },
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('test_head: value');
  });

  it('handles empty classifier heads', () => {
    const route: IntelligencePacketV2 = {
      routing: { classifier_signals: { heads: {} } },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Classifier heads:');
  });

  it('handles undefined classifier_heads value', () => {
    const route: IntelligencePacketV2 = {
      routing: {
        classifier_signals: {
          heads: {
            test: undefined as unknown as ClassifierHeadValue,
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('test: present');
  });

  it('includes routing signals', () => {
    const route: IntelligencePacketV2 = {
      routing: {
        classifier_signals: {
          complexity: 'medium',
          crud_operation: 'create',
          conversation_phase: 'main',
          memory_scope: 'project',
          memory_priority: 'high',
          retrieval_needed: true,
          is_read_only: false,
          requires_approval: true,
          entity_type_suggestion: { top: 'task' },
          safety_flags: ['destructive', 'external'],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Routing signals:');
    expect(result).toContain('complexity=medium');
    expect(result).toContain('crud=create');
    expect(result).toContain('phase=main');
    expect(result).toContain('scope=project');
    expect(result).toContain('memory=high');
    expect(result).toContain('retrieval=true');
    expect(result).toContain('read_only=false');
    expect(result).toContain('approval=true');
    expect(result).toContain('Entity suggestion: task');
    expect(result).toContain('Safety flags: destructive, external');
  });

  it('skips routing signals section when empty', () => {
    const route: IntelligencePacketV2 = { routing: { classifier_signals: {} } };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Routing signals:');
  });

  it('includes skill routing with matched skills and stats', () => {
    const route: IntelligencePacketV2 = {
      orchestration: {
        skills: {
          routing: {
            matched_skills: [{ name: 'implementation' }, { id: 'code-review' }],
            use_count: 3,
            decline_count: 1,
            na_count: 0,
            pattern_boost_applied: true,
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Skill routing: implementation, code-review');
    expect(result).toContain('Skill routing stats:');
    expect(result).toContain('use=3');
    expect(result).toContain('decline=1');
    expect(result).toContain('na=0');
    expect(result).toContain('pattern_boost=true');
  });

  it('includes memory search results from memory.search_results.results', () => {
    const route: IntelligencePacketV2 = {
      memory: {
        search_results: {
          results: [
            { entity_name: 'OAuth Decision', entity_type: 'decision', summary: 'Use PKCE flow for auth' },
            { entity_name: 'Cache Layer', content: 'Redis with 30min TTL' },
            { summary: 'standalone summary only' },
          ],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Memory context:');
    expect(result).toContain('OAuth Decision / decision: Use PKCE flow for auth');
    expect(result).toContain('Cache Layer: Redis with 30min TTL');
    expect(result).toContain('- standalone summary only');
  });

  it('falls back to memory.context.results when search_results absent', () => {
    const route: IntelligencePacketV2 = {
      memory: {
        context: {
          results: [{ entity_name: 'CtxEntity', entity_type: 'task', summary: 'From context' }],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('CtxEntity / task: From context');
  });

  it('handles memory context with label-only items', () => {
    const route: IntelligencePacketV2 = {
      memory: {
        search_results: {
          results: [{ entity_name: 'JustName', entity_type: 'task' }],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('- JustName / task');
  });

  it('includes agent recommendation from orchestration.agents.recommendation', () => {
    const route: IntelligencePacketV2 = {
      orchestration: {
        agents: {
          recommendation: {
            type: 'code-review',
            source: 'pattern-learner',
            confidence: 0.85,
          },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Agent recommendation:');
    expect(result).toContain('type=code-review');
    expect(result).toContain('source=pattern-learner');
    expect(result).toContain('confidence=85%');
  });

  it('includes suggested agents', () => {
    const route: IntelligencePacketV2 = {
      orchestration: {
        agents: {
          suggested: [
            { name: 'engineer', model: 'claude-sonnet', reason: 'TDD workflow' },
            { display_name: 'Reviewer', reason: 'Design review needed' },
          ],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Suggested agents:');
    expect(result).toContain('- engineer / claude-sonnet: TDD workflow');
    expect(result).toContain('- Reviewer: Design review needed');
  });

  it('includes manifest with packet_2 status and enrichment_id', () => {
    const route: IntelligencePacketV2 = {
      manifest: {
        packet_2_status: 'required',
        enrichment_id: 'enr-123',
        interaction_id: 'int-42',
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Manifest:');
    expect(result).toContain('packet_2=required');
    expect(result).toContain('enrichment_id=enr-123');
    expect(result).toContain('interaction_id=int-42');
  });

  it('includes memory diagnostics on error', () => {
    const route: IntelligencePacketV2 = {
      execution: {
        diagnostics: {
          memory_context: { status: 'error', error: 'Connection timeout' },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Memory diagnostics:');
    expect(result).toContain('Connection timeout');
  });

  it('includes memory diagnostics with default message', () => {
    const route: IntelligencePacketV2 = {
      execution: {
        diagnostics: {
          memory_context: { status: 'error' },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('memory pre-load degraded');
  });

  it('includes project state diagnostics on error', () => {
    const route: IntelligencePacketV2 = {
      execution: {
        diagnostics: {
          project_state: { status: 'error', error: 'DB down' },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Project state diagnostics:');
    expect(result).toContain('DB down');
  });

  it('includes project state diagnostics default message', () => {
    const route: IntelligencePacketV2 = {
      execution: {
        diagnostics: {
          project_state: { status: 'error' },
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('project state degraded');
  });

  it('includes classifier diagnostics for degraded classification stages', () => {
    const route: IntelligencePacketV2 = {
      execution: {
        summary: {
          degraded_components: ['classification.bert_heads', 'classification.llm_stage', 'memory.preload'],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('Classifier diagnostics:');
    expect(result).toContain('bert heads degraded');
    expect(result).toContain('llm stage degraded');
    // non-classification components should not appear
    expect(result).not.toContain('memory.preload');
  });

  it('reads classifier diagnostics from legacy root execution_summary', () => {
    const route: IntelligencePacketV2 = {
      execution_summary: {
        degraded_components: ['classification.timeout'],
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('timeout degraded');
  });

  it('skips empty formatList calls', () => {
    const route: IntelligencePacketV2 = {
      classification: {
        reverse_engineering: {
          explicit_wants: [],
          implicit_wants: undefined,
          gotchas: [],
        },
        quality_gate_criteria: [],
      },
      directives: { behavioral_directives: [] },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).not.toContain('Explicit wants:');
    expect(result).not.toContain('Constraints:');
    expect(result).not.toContain('Behavioral directives:');
    expect(result).not.toContain('Quality Gates:');
  });

  it('limits formatList items to maxItems', () => {
    const wants = Array.from({ length: 10 }, (_, i) => `Want ${i}`);
    const route: IntelligencePacketV2 = {
      classification: {
        reverse_engineering: {
          explicit_wants: wants,
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    // maxItems for explicit_wants is 5
    expect(result).toContain('- Want 4');
    expect(result).not.toContain('- Want 5');
  });

  it('surfaces full v2 packet end-to-end', () => {
    const route: IntelligencePacketV2 = {
      manifest: { packet_2_status: 'not_applicable' },
      classification: {
        effort_level: 'extended',
        intent_type: 'analyze',
        confidence: 0.88,
      },
      directives: {
        hard_gates: ['Never log secrets'],
        behavioral_directives: ['Use Quality Gates'],
      },
      process: {
        phase_template: {
          phases: ['OBSERVE', 'THINK', 'PLAN', 'BUILD', 'EXECUTE', 'VERIFY', 'LEARN'],
        },
      },
      orchestration: {
        agents: {
          composed: [
            { name: 'engineer', system_prompt: 'You are Marcus.' },
          ],
        },
      },
      enrichment: {
        data: {
          reasoning: {
            reverse_engineering: { explicit_wants: ['Ship feature'] },
            quality_gate_criteria: ['Tests green'],
          },
        },
      },
      memory: {
        search_results: {
          results: [{ entity_name: 'Decision-1', summary: 'Use PKCE' }],
        },
      },
    };
    const result = buildUserPromptAdditionalContext(route);
    expect(result).toContain('effort=extended');
    expect(result).toContain('Manifest:');
    expect(result).toContain('packet_2=not_applicable');
    expect(result).toContain('Hard gates (NON-NEGOTIABLE):');
    expect(result).toContain('- Never log secrets');
    expect(result).toContain('Behavioral directives:');
    expect(result).toContain('- Use Quality Gates');
    expect(result).toContain('Phase template:');
    expect(result).toContain('OBSERVE → THINK → PLAN → BUILD');
    expect(result).toContain('Composed sub-agents (use system_prompt VERBATIM when launching):');
    expect(result).toContain('You are Marcus.');
    expect(result).toContain('- Ship feature');
    expect(result).toContain('- Tests green');
    expect(result).toContain('Decision-1: Use PKCE');
  });
});
