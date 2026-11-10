import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/bootstrap/server.js';
import { createDecisionsProxyFeature } from '../../../src/features/decisions-proxy/index.js';
import { aDecision, metrics } from '../../support/builders.js';
import { call, listen } from '../../support/app-server.js';
import { deadUrl, sendJson, startFakeUpstream } from '../../support/fake-upstream.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

const ID = '3f2c9a54-6d1e-4b7a-9c58-2a4f1e0d7b11';

async function bffFor(decisionsServiceUrl: string, timeoutMs = 200) {
  const app = await listen(createApp({ features: [createDecisionsProxyFeature({ decisionsServiceUrl, timeoutMs })] }));
  cleanup.push(app.close);
  return app;
}

async function setup(handler: Parameters<typeof startFakeUpstream>[0], timeoutMs = 200) {
  const fake = await startFakeUpstream(handler);
  cleanup.push(fake.close);
  return { fake, bff: await bffFor(fake.url, timeoutMs) };
}

describe('proxy de decisões e revisões', () => {
  it('repassa a listagem com os filtros', async () => {
    const page = { items: [aDecision()], page: 1, pageSize: 20, total: 1, totalPages: 1 };
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, page));

    const response = await call(bff.baseUrl, 'GET', '/decisions?status=NEGADO&minScore=0.6&page=1');

    expect(response.json).toEqual(page);
    expect(fake.requests[0]!.url).toBe('/decisions?status=NEGADO&minScore=0.6&page=1');
  });

  it('/decisions/metrics não é confundida com /decisions/:id', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, metrics));

    const response = await call(bff.baseUrl, 'GET', '/decisions/metrics');

    expect(response.json).toEqual(metrics);
    expect(fake.requests[0]!.url).toBe('/decisions/metrics');
  });

  it('repassa o detalhe, incluindo o 404 do upstream', async () => {
    const { bff } = await setup((request, res) =>
      request.url === `/decisions/${ID}`
        ? sendJson(res, 200, aDecision({ id: ID }))
        : sendJson(res, 404, { error: 'not_found', message: 'Decisão não encontrada.' }),
    );

    expect((await call(bff.baseUrl, 'GET', `/decisions/${ID}`)).status).toBe(200);
    const missing = await call(bff.baseUrl, 'GET', '/decisions/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: 'not_found', message: 'Decisão não encontrada.' });
  });

  it('repassa o CRUD de revisões com método, caminho e corpo', async () => {
    const review = { id: 'rev-1', decisionId: ID, incorrect: true };
    const { fake, bff } = await setup((request, res) => {
      if (request.method === 'DELETE') {
        res.writeHead(204);
        res.end();
      } else if (request.method === 'POST') sendJson(res, 201, review, { location: '/reviews/rev-1' });
      else sendJson(res, 200, request.method === 'GET' ? { items: [review] } : review);
    });
    const newReview = { analyst: { name: 'Ana', email: 'ana@example.com' }, incorrect: true };

    const created = await call(bff.baseUrl, 'POST', `/decisions/${ID}/reviews`, newReview);
    expect(created.status).toBe(201);
    expect(created.headers.get('location')).toBe('/reviews/rev-1');
    expect((await call(bff.baseUrl, 'GET', `/decisions/${ID}/reviews`)).json).toEqual({ items: [review] });
    expect((await call(bff.baseUrl, 'PUT', '/reviews/rev-1', { incorrect: false })).status).toBe(200);
    expect((await call(bff.baseUrl, 'DELETE', '/reviews/rev-1')).status).toBe(204);

    expect(fake.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST /decisions/${ID}/reviews`,
      `GET /decisions/${ID}/reviews`,
      'PUT /reviews/rev-1',
      'DELETE /reviews/rev-1',
    ]);
    expect(JSON.parse(fake.requests[0]!.body)).toEqual(newReview);
  });

  it('devolve o 400 do upstream com invalid_fields', async () => {
    const body = { error: 'invalid_request', invalid_fields: [{ field: 'incorrect', reason: 'deve ser true ou false' }] };
    const { bff } = await setup((_r, res) => sendJson(res, 400, body));

    const response = await call(bff.baseUrl, 'POST', `/decisions/${ID}/reviews`, { incorrect: 'talvez' });

    expect(response.status).toBe(400);
    expect(response.json).toEqual(body);
  });

  it('não repassa authorization, cookie nem x-functions-key', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, metrics));

    await call(bff.baseUrl, 'GET', '/decisions/metrics', undefined, {
      authorization: 'Bearer x',
      cookie: 'a=b',
      'x-functions-key': 'k',
    });

    expect(fake.requests[0]!.headers).not.toHaveProperty('authorization');
    expect(fake.requests[0]!.headers).not.toHaveProperty('cookie');
    expect(fake.requests[0]!.headers).not.toHaveProperty('x-functions-key');
  });

  it('responde 502 e 504 com o nome do upstream', async () => {
    const down = await bffFor(await deadUrl());
    const slow = await setup(() => undefined, 100);

    const unavailable = await call(down.baseUrl, 'GET', '/decisions');
    const timeout = await call(slow.bff.baseUrl, 'GET', '/decisions');

    expect(unavailable.status).toBe(502);
    expect(unavailable.json).toEqual({ error: 'upstream_unavailable', upstream: 'decisions' });
    expect(timeout.status).toBe(504);
    expect(timeout.json).toEqual({ error: 'upstream_timeout', upstream: 'decisions' });
  });
});
