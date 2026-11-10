import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/bootstrap/server.js';
import { createRulesProxyFeature } from '../../../src/features/rules-proxy/index.js';
import { ForwardRulesRequest } from '../../../src/features/rules-proxy/application/forward-rules-request.use-case.js';
import { aRule } from '../../support/builders.js';
import { call, listen, type RunningApp } from '../../support/app-server.js';
import { deadUrl, sendJson, startFakeUpstream, type FakeUpstream } from '../../support/fake-upstream.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function setup(handler: Parameters<typeof startFakeUpstream>[0], timeoutMs = 200) {
  const fake: FakeUpstream = await startFakeUpstream(handler);
  cleanup.push(fake.close);
  return { fake, bff: await bffFor(fake.url, timeoutMs) };
}

async function bffFor(rulesServiceUrl: string, timeoutMs = 200): Promise<RunningApp> {
  const app = await listen(createApp({ features: [createRulesProxyFeature({ rulesServiceUrl, timeoutMs })] }));
  cleanup.push(app.close);
  return app;
}

describe('ForwardRulesRequest', () => {
  it('entrega a requisição à porta e devolve o resultado', async () => {
    const seen: unknown[] = [];
    const useCase = new ForwardRulesRequest({
      forward: async (request) => {
        seen.push(request);
        return { kind: 'timeout' };
      },
    });

    const request = { method: 'GET', path: '/rules', search: '?page=2' } as const;
    expect(await useCase.execute(request)).toEqual({ kind: 'timeout' });
    expect(seen).toEqual([request]);
  });
});

describe('proxy de regras', () => {
  it('repassa GET com query e devolve status e corpo do upstream', async () => {
    const page = { items: [aRule()], page: 2, pageSize: 20, total: 21 };
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, page));

    const response = await call(bff.baseUrl, 'GET', '/rules?enabled=true&type=MAX_AMOUNT&page=2');

    expect(response.status).toBe(200);
    expect(response.json).toEqual(page);
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: '/rules?enabled=true&type=MAX_AMOUNT&page=2' });
  });

  it('repassa POST com corpo e devolve 201 com Location', async () => {
    const created = aRule({ id: 'novo' });
    const { fake, bff } = await setup((_r, res) => sendJson(res, 201, created, { location: '/rules/novo' }));
    const body = { name: 'Valor máximo', type: 'MAX_AMOUNT', params: { limit: 100 } };

    const response = await call(bff.baseUrl, 'POST', '/rules', body);

    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe('/rules/novo');
    expect(response.json).toEqual(created);
    expect(JSON.parse(fake.requests[0]!.body)).toEqual(body);
    expect(fake.requests[0]!.headers['content-type']).toBe('application/json');
  });

  it('reescreve Location absoluto do upstream para caminho relativo', async () => {
    const { bff } = await setup((_request, res) =>
      sendJson(res, 201, aRule(), { location: 'http://interno:3001/rules/abc' }),
    );

    const response = await call(bff.baseUrl, 'POST', '/rules', { name: 'x' });

    expect(response.headers.get('location')).toBe('/rules/abc');
  });

  it('repassa GET, PUT e DELETE de /rules/:id', async () => {
    const { fake, bff } = await setup((request, res) => {
      if (request.method === 'DELETE') {
        res.writeHead(204);
        res.end();
      } else sendJson(res, 200, aRule({ id: 'r1' }));
    });

    expect((await call(bff.baseUrl, 'GET', '/rules/r1')).status).toBe(200);
    expect((await call(bff.baseUrl, 'PUT', '/rules/r1', { enabled: false })).status).toBe(200);
    const removed = await call(bff.baseUrl, 'DELETE', '/rules/r1');
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');
    expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /rules/r1', 'PUT /rules/r1', 'DELETE /rules/r1']);
    expect(JSON.parse(fake.requests[1]!.body)).toEqual({ enabled: false });
  });

  it.each([
    [400, { error: 'invalid_request', invalid_fields: [{ field: 'name', reason: 'obrigatório' }] }],
    [404, { error: 'not_found' }],
    [409, { error: 'conflict' }],
    [500, { error: 'internal_error' }],
  ])('devolve o status %i e o corpo do upstream sem alterar', async (status, body) => {
    const { bff } = await setup((_r, res) => sendJson(res, status, body));

    const response = await call(bff.baseUrl, 'PUT', '/rules/r1', { name: '' });

    expect(response.status).toBe(status);
    expect(response.json).toEqual(body);
  });

  it('não repassa headers sensíveis do cliente nem devolve headers internos do upstream', async () => {
    const { fake, bff } = await setup((_r, res) =>
      sendJson(res, 200, { items: [], total: 0 }, { 'set-cookie': 'sessao=1', 'x-interno': 'segredo', server: 'mongo-api' }),
    );

    const response = await call(bff.baseUrl, 'GET', '/rules', undefined, {
      authorization: 'Bearer token-do-usuario',
      cookie: 'sessao=abc',
      'x-functions-key': 'chave',
      'x-forwarded-for': '1.2.3.4',
    });

    const sent = fake.requests[0]!.headers;
    for (const name of ['authorization', 'cookie', 'x-functions-key', 'x-forwarded-for']) {
      expect(sent).not.toHaveProperty(name);
    }
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-interno')).toBeNull();
  });

  it('responde 502 upstream_unavailable quando o serviço está fora do ar', async () => {
    const bff = await bffFor(await deadUrl());

    const response = await call(bff.baseUrl, 'GET', '/rules');

    expect(response.status).toBe(502);
    expect(response.json).toEqual({ error: 'upstream_unavailable', upstream: 'rules' });
  });

  it('responde 504 upstream_timeout quando o serviço demora demais', async () => {
    const { bff } = await setup(() => undefined, 100);

    const response = await call(bff.baseUrl, 'GET', '/rules');

    expect(response.status).toBe(504);
    expect(response.json).toEqual({ error: 'upstream_timeout', upstream: 'rules' });
  });

  it('rejeita id que poderia alterar o caminho do upstream', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, {}));

    const response = await call(bff.baseUrl, 'GET', '/rules/a%2F..%2Fb');

    expect(response.status).toBe(400);
    expect(response.json.error).toBe('invalid_request');
    expect(fake.requests).toHaveLength(0);
  });
});
