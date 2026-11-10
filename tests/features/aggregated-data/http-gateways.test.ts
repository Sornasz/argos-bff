import { afterEach, describe, expect, it } from 'vitest';
import { HttpDecisionsGateway } from '../../../src/features/aggregated-data/infrastructure/http-decisions-gateway.js';
import { HttpRulesGateway } from '../../../src/features/aggregated-data/infrastructure/http-rules-gateway.js';
import { HttpScoringGateway } from '../../../src/features/aggregated-data/infrastructure/http-scoring-gateway.js';
import { SourceFailure } from '../../../src/features/aggregated-data/domain/source-failure.js';
import { aDecision, aRule, metrics, readyBody } from '../../support/builders.js';
import { deadUrl, sendJson, startFakeUpstream, type FakeUpstream } from '../../support/fake-upstream.js';

const TIMEOUT = 150;
const open: FakeUpstream[] = [];

async function upstream(handler: Parameters<typeof startFakeUpstream>[0]) {
  const fake = await startFakeUpstream(handler);
  open.push(fake);
  return fake;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((fake) => fake.close()));
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SourceFailure) return error.code;
    throw error;
  }
  throw new Error('esperava SourceFailure');
}

const rulesServer = () =>
  upstream((request, response) => {
    if (request.url.startsWith('/rules?enabled=true')) {
      sendJson(response, 200, { items: [aRule()], page: 1, pageSize: 20, total: 3 });
    } else {
      sendJson(response, 200, { items: [aRule(), aRule({ id: 'r2' })], page: 1, pageSize: 20, total: 5 });
    }
  });

describe('HttpRulesGateway', () => {
  it('junta o total e a contagem de regras ativas', async () => {
    const fake = await rulesServer();

    const summary = await new HttpRulesGateway(fake.url, TIMEOUT).fetchSummary();

    expect(summary).toMatchObject({ total: 5, enabled: 3 });
    expect(summary.items).toHaveLength(2);
    expect(fake.requests.map((r) => r.url).sort()).toEqual(['/rules?enabled=true&page=1', '/rules?page=1']);
  });

  it('traduz 404, 500, corpo inválido, lentidão e serviço fora do ar', async () => {
    const notFound = await upstream((_r, res) => sendJson(res, 404, { error: 'not_found' }));
    const broken = await upstream((_r, res) => sendJson(res, 500, { error: 'x' }));
    const garbage = await upstream((_r, res) => sendJson(res, 200, { dados: [] }));
    const slow = await upstream(() => undefined);

    expect(await codeOf(new HttpRulesGateway(notFound.url, TIMEOUT).fetchSummary())).toBe('upstream_status_404');
    expect(await codeOf(new HttpRulesGateway(broken.url, TIMEOUT).fetchSummary())).toBe('upstream_status_500');
    expect(await codeOf(new HttpRulesGateway(garbage.url, TIMEOUT).fetchSummary())).toBe('upstream_invalid_response');
    expect(await codeOf(new HttpRulesGateway(slow.url, TIMEOUT).fetchSummary())).toBe('upstream_timeout');
    expect(await codeOf(new HttpRulesGateway(await deadUrl(), TIMEOUT).fetchSummary())).toBe('upstream_unavailable');
  });
});

describe('HttpDecisionsGateway', () => {
  it('busca métricas e decisões recentes', async () => {
    const fake = await upstream((request, response) => {
      if (request.url === '/decisions/metrics') sendJson(response, 200, metrics);
      else sendJson(response, 200, { items: [aDecision()], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    const overview = await new HttpDecisionsGateway(fake.url, TIMEOUT).fetchOverview();

    expect(overview.metrics).toEqual(metrics);
    expect(overview.recent).toEqual([aDecision()]);
  });

  it('falha quando uma das duas chamadas falha', async () => {
    const fake = await upstream((request, response) => {
      if (request.url === '/decisions/metrics') sendJson(response, 500, { error: 'x' });
      else sendJson(response, 200, { items: [], total: 0 });
    });

    expect(await codeOf(new HttpDecisionsGateway(fake.url, TIMEOUT).fetchOverview())).toBe('upstream_status_500');
  });

  it('traduz lentidão e serviço fora do ar', async () => {
    const slow = await upstream(() => undefined);

    expect(await codeOf(new HttpDecisionsGateway(slow.url, TIMEOUT).fetchOverview())).toBe('upstream_timeout');
    expect(await codeOf(new HttpDecisionsGateway(await deadUrl(), TIMEOUT).fetchOverview())).toBe('upstream_unavailable');
  });
});

describe('HttpScoringGateway', () => {
  it('lê o /ready da Function e converte para camelCase, sem chamar a rota de pontuação', async () => {
    const fake = await upstream((_r, res) => sendJson(res, 200, readyBody));

    const readiness = await new HttpScoringGateway(fake.url, TIMEOUT).fetchReadiness();

    expect(readiness).toEqual({
      status: 'ready',
      index: {
        state: 'ready',
        vectorCount: 1000,
        version: 'v1',
        loadedAt: '2026-11-09T12:00:00.000Z',
        loadDurationMs: 1200,
        failureReason: null,
      },
    });
    expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /ready']);
    expect(fake.requests[0]!.headers).not.toHaveProperty('x-functions-key');
  });

  it('entende o 503 do /ready como "ainda não está pronta"', async () => {
    const fake = await upstream((_r, res) =>
      sendJson(res, 503, { status: 'starting', index: { ...readyBody.index, state: 'loading', vector_count: 0 } }),
    );

    const readiness = await new HttpScoringGateway(fake.url, TIMEOUT).fetchReadiness();

    expect(readiness.status).toBe('starting');
    expect(readiness.index.state).toBe('loading');
  });

  it('traduz 404, 500, corpo inválido, lentidão e Function fora do ar', async () => {
    const notFound = await upstream((_r, res) => sendJson(res, 404, {}));
    const broken = await upstream((_r, res) => sendJson(res, 500, {}));
    const garbage = await upstream((_r, res) => sendJson(res, 200, { ok: true }));
    const slow = await upstream(() => undefined);

    expect(await codeOf(new HttpScoringGateway(notFound.url, TIMEOUT).fetchReadiness())).toBe('upstream_status_404');
    expect(await codeOf(new HttpScoringGateway(broken.url, TIMEOUT).fetchReadiness())).toBe('upstream_status_500');
    expect(await codeOf(new HttpScoringGateway(garbage.url, TIMEOUT).fetchReadiness())).toBe('upstream_invalid_response');
    expect(await codeOf(new HttpScoringGateway(slow.url, TIMEOUT).fetchReadiness())).toBe('upstream_timeout');
    expect(await codeOf(new HttpScoringGateway(await deadUrl(), TIMEOUT).fetchReadiness())).toBe('upstream_unavailable');
  });
});
