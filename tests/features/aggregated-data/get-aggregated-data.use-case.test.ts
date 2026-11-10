import { describe, expect, it } from 'vitest';
import { GetAggregatedData } from '../../../src/features/aggregated-data/application/get-aggregated-data.use-case.js';
import type { DecisionsGateway } from '../../../src/features/aggregated-data/application/ports/decisions-gateway.js';
import type { RulesGateway } from '../../../src/features/aggregated-data/application/ports/rules-gateway.js';
import type { ScoringGateway } from '../../../src/features/aggregated-data/application/ports/scoring-gateway.js';
import type { ScoringReadiness } from '../../../src/features/aggregated-data/domain/aggregated-data.js';
import { SourceFailure } from '../../../src/features/aggregated-data/domain/source-failure.js';
import { aDecision, aRule, metrics } from '../../support/builders.js';

const ready: ScoringReadiness = {
  status: 'ready',
  index: { state: 'ready', vectorCount: 10, version: 'v1', loadedAt: null, loadDurationMs: null, failureReason: null },
};

const rules: RulesGateway = {
  fetchSummary: async () => ({ total: 8, enabled: 6, items: Array.from({ length: 8 }, (_, i) => aRule({ id: `r${i}` })) }),
};
const decisions: DecisionsGateway = {
  fetchOverview: async () => ({
    metrics,
    recent: Array.from({ length: 7 }, (_, i) => aDecision({ transactionId: `tx-${i}` })),
  }),
};
const scoring: ScoringGateway = { fetchReadiness: async () => ready };

const failing = (code: string) => async (): Promise<never> => {
  throw new SourceFailure(code);
};

function build(overrides: { rules?: RulesGateway; decisions?: DecisionsGateway; scoring?: ScoringGateway } = {}) {
  let tick = 0;
  return new GetAggregatedData(overrides.rules ?? rules, overrides.decisions ?? decisions, overrides.scoring ?? scoring, {
    now: () => (tick += 10),
    clock: () => new Date('2026-11-09T14:00:00.000Z'),
  });
}

describe('GetAggregatedData', () => {
  it('com as três fontes ok, monta o agregado e limita a 5 itens', async () => {
    const { data, available } = await build().execute();

    expect(available).toBe(true);
    expect(data.generatedAt).toBe('2026-11-09T14:00:00.000Z');
    expect(data.sources.rules.status).toBe('ok');
    expect(data.sources.decisions.status).toBe('ok');
    expect(data.sources.scoring.status).toBe('ok');
    expect(data.rules).toMatchObject({ total: 8, enabled: 6 });
    expect(data.rules?.items).toHaveLength(5);
    expect(data.decisions?.metrics).toEqual(metrics);
    expect(data.decisions?.recent).toHaveLength(5);
    expect(data.scoring).toEqual(ready);
  });

  it('mede a latência de cada fonte', async () => {
    const { data } = await build().execute();

    expect(data.sources.rules.latencyMs).toBeGreaterThan(0);
    expect(data.sources.rules).not.toHaveProperty('error');
  });

  it.each([
    ['regras', { rules: { fetchSummary: failing('upstream_timeout') } }, 'rules'],
    ['decisões', { decisions: { fetchOverview: failing('upstream_unavailable') } }, 'decisions'],
    ['pontuação', { scoring: { fetchReadiness: failing('upstream_status_500') } }, 'scoring'],
  ] as const)('com 1 fonte falhando (%s), segue com 200 e bloco nulo', async (_name, override, failed) => {
    const { data, available } = await build(override).execute();

    expect(available).toBe(true);
    expect(data.sources[failed].status).toBe('error');
    expect(data.sources[failed].error).toMatch(/^upstream_/);
    expect(data[failed]).toBeNull();
    const others = (['rules', 'decisions', 'scoring'] as const).filter((name) => name !== failed);
    for (const name of others) {
      expect(data.sources[name].status).toBe('ok');
      expect(data[name]).not.toBeNull();
    }
  });

  it('com 2 fontes falhando, ainda está disponível', async () => {
    const { data, available } = await build({
      rules: { fetchSummary: failing('upstream_unavailable') },
      scoring: { fetchReadiness: failing('upstream_timeout') },
    }).execute();

    expect(available).toBe(true);
    expect(data.sources.rules.error).toBe('upstream_unavailable');
    expect(data.sources.scoring.error).toBe('upstream_timeout');
    expect(data.decisions).not.toBeNull();
  });

  it('com as 3 fontes falhando, não está disponível', async () => {
    const { data, available } = await build({
      rules: { fetchSummary: failing('upstream_unavailable') },
      decisions: { fetchOverview: failing('upstream_unavailable') },
      scoring: { fetchReadiness: failing('upstream_unavailable') },
    }).execute();

    expect(available).toBe(false);
    expect(data.rules).toBeNull();
    expect(data.decisions).toBeNull();
    expect(data.scoring).toBeNull();
  });

  it('erro inesperado vira unexpected_error sem vazar a mensagem', async () => {
    const { data } = await build({
      rules: {
        fetchSummary: async () => {
          throw new Error('senha=123 na connection string');
        },
      },
    }).execute();

    expect(data.sources.rules).toMatchObject({ status: 'error', error: 'unexpected_error' });
    expect(JSON.stringify(data)).not.toContain('senha');
  });

  it('Function que responde mas não está pronta é erro da fonte, com os dados do /ready', async () => {
    const starting: ScoringReadiness = { status: 'starting', index: { ...ready.index, state: 'loading', vectorCount: 0 } };

    const { data, available } = await build({ scoring: { fetchReadiness: async () => starting } }).execute();

    expect(available).toBe(true);
    expect(data.sources.scoring).toMatchObject({ status: 'error', error: 'scoring_not_ready' });
    expect(data.scoring).toEqual(starting);
  });

  it('chama as fontes em paralelo', async () => {
    const started: string[] = [];
    const slow = <T>(name: string, value: T) => async () => {
      started.push(name);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return value;
    };
    const useCase = new GetAggregatedData(
      { fetchSummary: slow('rules', { total: 0, enabled: 0, items: [] }) },
      { fetchOverview: slow('decisions', { metrics, recent: [] }) },
      { fetchReadiness: slow('scoring', ready) },
    );

    const begin = Date.now();
    await useCase.execute();

    expect(started).toHaveLength(3);
    expect(Date.now() - begin).toBeLessThan(80);
  });
});
