import { afterEach, describe, expect, it } from 'vitest';
import { createBffApp } from '../../src/bootstrap/app.js';
import { aConfig, aDecision, aRule, FUNCTION_KEY, metrics, readyBody, scoreBody } from '../support/builders.js';
import { call, listen } from '../support/app-server.js';
import { deadUrl, sendJson, startFakeUpstream, type FakeUpstream } from '../support/fake-upstream.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function fake(handler: Parameters<typeof startFakeUpstream>[0]): Promise<FakeUpstream> {
  const upstream = await startFakeUpstream(handler);
  cleanup.push(upstream.close);
  return upstream;
}

const rulesUp = () =>
  fake((request, res) =>
    sendJson(res, 200, {
      items: Array.from({ length: 7 }, (_, i) => aRule({ id: `r${i}` })),
      page: 1,
      pageSize: 20,
      total: request.url.includes('enabled=true') ? 4 : 7,
    }),
  );

const decisionsUp = () =>
  fake((request, res) =>
    request.url === '/decisions/metrics'
      ? sendJson(res, 200, metrics)
      : sendJson(res, 200, {
          items: Array.from({ length: 6 }, () => aDecision()),
          page: 1,
          pageSize: 20,
          total: 6,
          totalPages: 1,
        }),
  );

const functionUp = () =>
  fake((request, res) =>
    request.url === '/ready' ? sendJson(res, 200, readyBody) : sendJson(res, 200, { approved: true, fraud_score: 0.1 }),
  );

async function startBff(urls: { rules: string; decisions: string; function: string }, overrides = {}) {
  const app = await listen(
    createBffApp(
      aConfig({
        rulesServiceUrl: urls.rules,
        decisionsServiceUrl: urls.decisions,
        functionUrl: urls.function,
        ...overrides,
      }),
    ),
  );
  cleanup.push(app.close);
  return app;
}

describe('GET /aggregated-data', () => {
  it('com as três fontes no ar devolve tudo num response só', async () => {
    const [rules, decisions, fn] = [await rulesUp(), await decisionsUp(), await functionUp()];
    const bff = await startBff({ rules: rules.url, decisions: decisions.url, function: fn.url });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(response.status).toBe(200);
    expect(Object.keys(response.json)).toEqual(['generatedAt', 'sources', 'rules', 'decisions', 'scoring']);
    expect(new Date(response.json.generatedAt).toISOString()).toBe(response.json.generatedAt);
    for (const name of ['rules', 'decisions', 'scoring']) {
      expect(response.json.sources[name]).toMatchObject({ status: 'ok' });
      expect(response.json.sources[name].latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(response.json.rules).toMatchObject({ total: 7, enabled: 4 });
    expect(response.json.rules.items).toHaveLength(5);
    expect(response.json.decisions.metrics).toEqual(metrics);
    expect(response.json.decisions.recent).toHaveLength(5);
    expect(response.json.scoring).toMatchObject({ status: 'ready', index: { vectorCount: 1000 } });
  });

  it('não chama a rota de pontuação da Function, só o /ready', async () => {
    const [rules, decisions, fn] = [await rulesUp(), await decisionsUp(), await functionUp()];
    const bff = await startBff({ rules: rules.url, decisions: decisions.url, function: fn.url });

    await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(fn.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /ready']);
  });

  it('com uma fonte fora do ar responde 200 e marca o erro nela', async () => {
    const [decisions, fn] = [await decisionsUp(), await functionUp()];
    const bff = await startBff({ rules: await deadUrl(), decisions: decisions.url, function: fn.url });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(response.status).toBe(200);
    expect(response.json.sources.rules).toMatchObject({ status: 'error', error: 'upstream_unavailable' });
    expect(response.json.rules).toBeNull();
    expect(response.json.decisions).not.toBeNull();
    expect(response.json.scoring).not.toBeNull();
  });

  it('com uma fonte lenta responde dentro do timeout, 200 e error upstream_timeout', async () => {
    const [rules, fn] = [await rulesUp(), await functionUp()];
    const slow = await fake(() => undefined);
    const bff = await startBff({ rules: rules.url, decisions: slow.url, function: fn.url }, { upstreamTimeoutMs: 100 });

    const begin = Date.now();
    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(Date.now() - begin).toBeLessThan(1000);
    expect(response.status).toBe(200);
    expect(response.json.sources.decisions).toMatchObject({ status: 'error', error: 'upstream_timeout' });
    expect(response.json.decisions).toBeNull();
  });

  it('com duas fontes falhando (500 e fora do ar) ainda responde 200', async () => {
    const broken = await fake((_r, res) => sendJson(res, 500, { error: 'boom' }));
    const fn = await functionUp();
    const bff = await startBff({ rules: broken.url, decisions: await deadUrl(), function: fn.url });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(response.status).toBe(200);
    expect(response.json.sources.rules.error).toBe('upstream_status_500');
    expect(response.json.sources.decisions.error).toBe('upstream_unavailable');
    expect(response.json.sources.scoring.status).toBe('ok');
  });

  it('com as três fontes falhando responde 502 com o mesmo formato', async () => {
    const bff = await startBff({ rules: await deadUrl(), decisions: await deadUrl(), function: await deadUrl() });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(response.status).toBe(502);
    expect(response.json.sources.rules.status).toBe('error');
    expect(response.json.sources.decisions.status).toBe('error');
    expect(response.json.sources.scoring.status).toBe('error');
    expect(response.json).toMatchObject({ rules: null, decisions: null, scoring: null });
  });

  it('Function ainda carregando (503 no /ready) é erro da fonte, mas a resposta segue 200', async () => {
    const [rules, decisions] = [await rulesUp(), await decisionsUp()];
    const starting = await fake((_r, res) =>
      sendJson(res, 503, { status: 'starting', index: { ...readyBody.index, state: 'loading', vector_count: 0 } }),
    );
    const bff = await startBff({ rules: rules.url, decisions: decisions.url, function: starting.url });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    expect(response.status).toBe(200);
    expect(response.json.sources.scoring).toMatchObject({ status: 'error', error: 'scoring_not_ready' });
    expect(response.json.scoring.status).toBe('starting');
  });

  it('a chave da Function não vai para os microserviços nem aparece na resposta', async () => {
    const [rules, decisions, fn] = [await rulesUp(), await decisionsUp(), await functionUp()];
    const bff = await startBff({ rules: rules.url, decisions: decisions.url, function: fn.url });

    const response = await call(bff.baseUrl, 'GET', '/aggregated-data');

    for (const upstream of [rules, decisions]) {
      for (const request of upstream.requests) expect(request.headers).not.toHaveProperty('x-functions-key');
    }
    expect(response.text).not.toContain(FUNCTION_KEY);
  });
});

describe('BFF completo', () => {
  async function fullBff(overrides = {}) {
    const [rules, decisions, fn] = [await rulesUp(), await decisionsUp(), await functionUp()];
    return startBff({ rules: rules.url, decisions: decisions.url, function: fn.url }, overrides);
  }

  it('GET /health responde 200 sem consultar ninguém', async () => {
    const bff = await startBff({ rules: await deadUrl(), decisions: await deadUrl(), function: await deadUrl() });

    const response = await call(bff.baseUrl, 'GET', '/health');

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ status: 'ok', service: 'argos-bff' });
  });

  it('rota inexistente devolve 404 em JSON', async () => {
    const bff = await fullBff();

    const response = await call(bff.baseUrl, 'GET', '/nao-existe');

    expect(response.status).toBe(404);
    expect(response.json).toEqual({ error: 'not_found', message: 'Rota não encontrada.' });
  });

  it('JSON inválido devolve 400 e corpo acima de 100kb devolve 413', async () => {
    const bff = await fullBff();

    const invalid = await call(bff.baseUrl, 'POST', '/score', '{quebrado');
    const large = await call(bff.baseUrl, 'POST', '/rules', { name: 'x'.repeat(150_000) });

    expect(invalid.status).toBe(400);
    expect(invalid.json.error).toBe('invalid_json');
    expect(large.status).toBe(413);
    expect(large.json.error).toBe('payload_too_large');
  });

  it('POST /score passa pelo app completo', async () => {
    const bff = await fullBff();

    const response = await call(bff.baseUrl, 'POST', '/score', scoreBody);

    expect(response.json).toEqual({ approved: true, fraud_score: 0.1 });
  });

  it('o Swagger documenta todas as rotas expostas e não contém a chave', async () => {
    const bff = await fullBff();

    const spec = await call(bff.baseUrl, 'GET', '/docs/openapi.json');
    const ui = await fetch(`${bff.baseUrl}/docs/`);

    expect(spec.status).toBe(200);
    expect(ui.status).toBe(200);
    const operations = Object.entries(spec.json.paths).flatMap(([path, item]) =>
      Object.keys(item as object).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
      [
        'GET /aggregated-data',
        'GET /rules',
        'POST /rules',
        'GET /rules/{id}',
        'PUT /rules/{id}',
        'DELETE /rules/{id}',
        'GET /decisions',
        'GET /decisions/metrics',
        'GET /decisions/{id}',
        'GET /decisions/{id}/reviews',
        'POST /decisions/{id}/reviews',
        'PUT /reviews/{id}',
        'DELETE /reviews/{id}',
        'POST /score',
        'GET /health',
      ].sort(),
    );
    expect(spec.text).not.toContain(FUNCTION_KEY);
    const examples = spec.json.paths['/aggregated-data'].get.responses['200'].content['application/json'].examples;
    expect(Object.keys(examples)).toHaveLength(2);
  });

  it('CORS fica desligado sem CORS_ORIGIN', async () => {
    const bff = await fullBff();

    const response = await call(bff.baseUrl, 'GET', '/health', undefined, { origin: 'http://localhost:5173' });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('CORS libera só as origens configuradas, inclusive no preflight', async () => {
    const bff = await fullBff({ corsOrigins: ['http://localhost:5173', 'https://app.example.com'] });

    const allowed = await call(bff.baseUrl, 'GET', '/health', undefined, { origin: 'https://app.example.com' });
    const denied = await call(bff.baseUrl, 'GET', '/health', undefined, { origin: 'https://malicioso.example' });
    const preflight = await call(bff.baseUrl, 'OPTIONS', '/rules', undefined, {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
