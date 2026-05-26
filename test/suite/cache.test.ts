// gramatr VS Code Extension — Cache Tests (v2 intelligence packet)
import { describe, it, expect } from 'vitest';
import { buildClassificationCacheKey, ClassificationCache } from '../../src/router/cache';
import type { IntelligencePacketV2 } from '../../src/router/types';

describe('buildClassificationCacheKey', () => {
  it('builds key from all parts', () => {
    const key = buildClassificationCacheKey('my prompt', 'org/repo', 'main');
    expect(key).toBe('org/repo::main::my prompt');
  });

  it('uses empty strings for missing parts', () => {
    const key = buildClassificationCacheKey('prompt');
    expect(key).toBe('::::prompt');
  });

  it('trims the prompt', () => {
    const key = buildClassificationCacheKey('  padded  ', 'p', 'b');
    expect(key).toBe('p::b::padded');
  });
});

function makeResult(overrides: Partial<IntelligencePacketV2> = {}): IntelligencePacketV2 {
  return {
    schema: 'gmtr.intelligence.contract.v2',
    manifest: {
      project_id: 'proj-1',
      session_id: 'sess-1',
      interaction_id: 'int-1',
      packet_2_status: 'required',
    },
    classification: {
      effort_level: 'standard',
      intent_type: 'create',
      memory_tier: 'hot',
      matched_skills: ['impl'],
      quality_gate_criteria: ['tests pass'],
      reverse_engineering: {
        explicit_wants: ['feature'],
        implicit_wants: ['clean code'],
        explicit_dont_wants: ['no hacks'],
        implicit_dont_wants: ['avoid complexity'],
        gotchas: ['edge case'],
        constraints_extracted: ['use TS'],
      },
    },
    routing: {
      classifier_signals: {
        heads: { domain_class: { label: 'engineering', score: 0.9 } },
        safety_flags: ['external'],
      },
    },
    memory: {
      scope: 'project',
      context: { total_count: 1, results: [{ entity_name: 'E1', summary: 'S1' }] },
      search_results: { results: [{ entity_name: 'SR1', snippet: 'snip' }] },
    },
    orchestration: {
      skills: {
        routing: {
          matched_skills: [{ name: 'implementation' }],
          use_count: 1,
        },
      },
      agents: {
        suggested: [{ name: 'agent1', reason: 'good fit' }],
        composed: [
          {
            name: 'comp1',
            system_prompt: 'You are an engineer.',
            expertise_areas: ['code'],
          },
        ],
      },
    },
    process: {
      capability_audit: { entries: [{ name: 'skill1', disposition: 'use' }] },
      phase_template: { phases: ['OBSERVE', 'PLAN', 'BUILD', 'VERIFY'] },
      quality_gate_config: {
        min_criteria: 4,
        word_range: { min: 8, max: 12 },
        rules: [{ id: 'rule-1', name: 'Tests' }],
      },
    },
    directives: {
      hard_gates: ['never delete prod'],
      behavioral_directives: ['follow Quality Gates'],
      behavioral_rules: {
        hard_gates: ['no hard deletes'],
        code_rules: ['TypeScript only'],
      },
    },
    enrichment: {
      status: 'merged',
      data: {
        reasoning: {
          reverse_engineering: { explicit_wants: ['re want'] },
          quality_gate_criteria: ['gate 1'],
        },
      },
    },
    execution: {
      summary: {
        execution_time_ms: 100,
        degraded_components: ['comp1'],
        stage_timing: { classify: 50 },
      },
      token_savings: {
        total_saved: 2700,
        savings_ratio: 0.8,
      },
      diagnostics: {
        memory_context: { status: 'ok' },
        project_state: { status: 'ok' },
      },
    },
    raw_intelligence: '{"test": true}',
    ...overrides,
  };
}

describe('ClassificationCache', () => {
  it('returns null for cache miss', () => {
    const cache = new ClassificationCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value with deep clone', () => {
    const cache = new ClassificationCache();
    const original = makeResult();
    cache.set('key1', original);

    const retrieved = cache.get('key1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.classification?.effort_level).toBe('standard');
    // Should be a different object (cloned)
    expect(retrieved!.classification).not.toBe(original.classification);
    expect(retrieved!.classification!.matched_skills).not.toBe(original.classification!.matched_skills);
  });

  it('marks cache_hit on retrieved execution.summary', () => {
    const cache = new ClassificationCache();
    cache.set('key', makeResult());
    const retrieved = cache.get('key');
    expect(retrieved!.execution!.summary!.cache_hit).toBe(true);
  });

  it('also marks cache_hit on legacy execution_summary shim', () => {
    const cache = new ClassificationCache();
    cache.set('key', makeResult({
      execution_summary: {
        execution_time_ms: 50,
        degraded_components: [],
      },
    }));
    const retrieved = cache.get('key');
    expect(retrieved!.execution_summary!.cache_hit).toBe(true);
  });

  it('evicts oldest entry when exceeding maxSize', () => {
    const cache = new ClassificationCache(2);
    cache.set('a', makeResult({ raw_intelligence: 'a' }));
    cache.set('b', makeResult({ raw_intelligence: 'b' }));
    cache.set('c', makeResult({ raw_intelligence: 'c' }));

    expect(cache.get('a')).toBeNull(); // evicted
    expect(cache.get('b')).not.toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });

  it('promotes accessed entry to most-recently-used', () => {
    const cache = new ClassificationCache(2);
    cache.set('a', makeResult({ raw_intelligence: 'a' }));
    cache.set('b', makeResult({ raw_intelligence: 'b' }));
    // Access 'a' to promote it
    cache.get('a');
    // Now add 'c' — 'b' should be evicted since 'a' was accessed more recently
    cache.set('c', makeResult({ raw_intelligence: 'c' }));

    expect(cache.get('b')).toBeNull(); // evicted
    expect(cache.get('a')).not.toBeNull(); // promoted
  });

  it('overwrites existing key and repositions it', () => {
    const cache = new ClassificationCache(2);
    cache.set('a', makeResult({ raw_intelligence: 'v1' }));
    cache.set('b', makeResult({ raw_intelligence: 'v2' }));
    // Overwrite 'a' — should delete and re-add
    cache.set('a', makeResult({ raw_intelligence: 'v3' }));

    const retrieved = cache.get('a');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.raw_intelligence).toBe('v3');
  });

  it('clones all nested arrays in classification', () => {
    const cache = new ClassificationCache();
    const result = makeResult();
    cache.set('k', result);
    const retrieved = cache.get('k')!;

    expect(retrieved.classification!.matched_skills).toEqual(['impl']);
    expect(retrieved.classification!.quality_gate_criteria).toEqual(['tests pass']);
    expect(retrieved.classification!.reverse_engineering!.explicit_wants).toEqual(['feature']);
    expect(retrieved.classification!.reverse_engineering!.implicit_wants).toEqual(['clean code']);
    expect(retrieved.classification!.reverse_engineering!.explicit_dont_wants).toEqual(['no hacks']);
    expect(retrieved.classification!.reverse_engineering!.implicit_dont_wants).toEqual(['avoid complexity']);
    expect(retrieved.classification!.reverse_engineering!.gotchas).toEqual(['edge case']);
    expect(retrieved.classification!.reverse_engineering!.constraints_extracted).toEqual(['use TS']);

    // Mutating the retrieved value should not affect the cache
    retrieved.classification!.matched_skills!.push('mutated');
    const fresh = cache.get('k')!;
    expect(fresh.classification!.matched_skills).toEqual(['impl']);
  });

  it('clones process.capability_audit entries', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.process!.capability_audit!.entries).toEqual([{ name: 'skill1', disposition: 'use' }]);
  });

  it('clones process.phase_template.phases array', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.process!.phase_template!.phases).toEqual(['OBSERVE', 'PLAN', 'BUILD', 'VERIFY']);
    retrieved.process!.phase_template!.phases!.push('MUTATED');
    const fresh = cache.get('k')!;
    expect(fresh.process!.phase_template!.phases).toEqual(['OBSERVE', 'PLAN', 'BUILD', 'VERIFY']);
  });

  it('clones process.quality_gate_config and its rules/word_range', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.process!.quality_gate_config!.min_criteria).toBe(4);
    expect(retrieved.process!.quality_gate_config!.word_range).toEqual({ min: 8, max: 12 });
    expect(retrieved.process!.quality_gate_config!.rules).toEqual([{ id: 'rule-1', name: 'Tests' }]);
  });

  it('clones memory.context and memory.search_results results', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.memory!.context!.results).toEqual([{ entity_name: 'E1', summary: 'S1' }]);
    expect(retrieved.memory!.search_results!.results).toEqual([{ entity_name: 'SR1', snippet: 'snip' }]);
  });

  it('clones routing.classifier_signals including heads and safety_flags', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.routing!.classifier_signals!.heads).toEqual({
      domain_class: { label: 'engineering', score: 0.9 },
    });
    expect(retrieved.routing!.classifier_signals!.safety_flags).toEqual(['external']);
  });

  it('clones orchestration.skills.routing.matched_skills', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.orchestration!.skills!.routing!.matched_skills).toEqual([{ name: 'implementation' }]);
    expect(retrieved.orchestration!.skills!.routing!.use_count).toBe(1);
  });

  it('clones execution.summary including degraded_components and stage_timing', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.execution!.summary!.degraded_components).toEqual(['comp1']);
    expect(retrieved.execution!.summary!.stage_timing).toEqual({ classify: 50 });
  });

  it('clones execution.token_savings', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.execution!.token_savings).toEqual({ total_saved: 2700, savings_ratio: 0.8 });
  });

  it('clones execution.diagnostics', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.execution!.diagnostics!.memory_context).toEqual({ status: 'ok' });
    expect(retrieved.execution!.diagnostics!.project_state).toEqual({ status: 'ok' });
  });

  it('clones orchestration.agents.suggested and composed', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.orchestration!.agents!.suggested).toEqual([{ name: 'agent1', reason: 'good fit' }]);
    expect(retrieved.orchestration!.agents!.composed).toEqual([
      { name: 'comp1', system_prompt: 'You are an engineer.', expertise_areas: ['code'] },
    ]);
  });

  it('clones directives including hard_gates and behavioral_rules', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.directives!.hard_gates).toEqual(['never delete prod']);
    expect(retrieved.directives!.behavioral_directives).toEqual(['follow Quality Gates']);
    expect(retrieved.directives!.behavioral_rules!.hard_gates).toEqual(['no hard deletes']);
    expect(retrieved.directives!.behavioral_rules!.code_rules).toEqual(['TypeScript only']);

    // Mutating retrieved values should not affect the cache
    retrieved.directives!.hard_gates!.push('mutated');
    const fresh = cache.get('k')!;
    expect(fresh.directives!.hard_gates).toEqual(['never delete prod']);
  });

  it('clones enrichment.data.reasoning structure', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.enrichment!.data!.reasoning!.reverse_engineering!.explicit_wants).toEqual(['re want']);
    expect(retrieved.enrichment!.data!.reasoning!.quality_gate_criteria).toEqual(['gate 1']);
  });

  it('clones manifest', () => {
    const cache = new ClassificationCache();
    cache.set('k', makeResult());
    const retrieved = cache.get('k')!;
    expect(retrieved.manifest).toEqual({
      project_id: 'proj-1',
      session_id: 'sess-1',
      interaction_id: 'int-1',
      packet_2_status: 'required',
    });
  });

  it('handles result with undefined optional fields', () => {
    const cache = new ClassificationCache();
    const sparse: IntelligencePacketV2 = {
      classification: undefined,
      directives: undefined,
      process: undefined,
      memory: undefined,
      orchestration: undefined,
      enrichment: undefined,
      execution: undefined,
    };
    cache.set('sparse', sparse);
    const retrieved = cache.get('sparse')!;
    expect(retrieved.classification).toBeUndefined();
    expect(retrieved.directives).toBeUndefined();
    expect(retrieved.execution).toBeUndefined();
  });

  it('handles classification without reverse_engineering', () => {
    const cache = new ClassificationCache();
    const result = makeResult();
    result.classification!.reverse_engineering = undefined;
    cache.set('no-re', result);
    const retrieved = cache.get('no-re')!;
    expect(retrieved.classification!.reverse_engineering).toBeUndefined();
  });

  it('handles execution.summary without stage_timing', () => {
    const cache = new ClassificationCache();
    const result = makeResult();
    result.execution!.summary!.stage_timing = undefined;
    cache.set('no-timing', result);
    const retrieved = cache.get('no-timing')!;
    expect(retrieved.execution!.summary!.stage_timing).toBeUndefined();
  });
});
