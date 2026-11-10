import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/bootstrap/server.js';
import { ScoreTransaction } from '../../../src/features/score-transaction/application/score-transaction.use-case.js';
import { checkScoreRequest } from '../../../src/features/score-transaction/application/score-request.js';
import { createScoreTransactionFeature } from '../../../src/features/score-transaction/index.js';
import { FUNCTION_KEY, scoreBody } from '../../support/builders.js';
import { call, listen } from '../../support/app-server.js';
import { deadUrl, sendJson, startFakeUpstream } from '../../support/fake-upstream.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

async function bffFor(functionUrl: string, timeoutMs = 200) {
  const app = await listen(
    createApp({ features: [createScoreTransactionFeature({ functionUrl, functionKey: FUNCTION_KEY, timeoutMs })] }),
  );
  cleanup.push(app.close);
  return app;
}

async function setup(handler: Parameters<typeof startFakeUpstream>[0], timeoutMs = 200) {
  const fake = await startFakeUpstream(handler);
  cleanup.push(fake.close);
  return { fake, bff: await bffFor(fake.url, timeoutMs) };
}

describe('checkScoreRequest', () => {
  it('aceita o corpo com id e os quatro blocos', () => {
    expect(checkScoreRequest(scoreBody)).toEqual({ ok: true, payload: scoreBody });
  });

  it.each([null, 'texto', [], 42])('rejeita corpo que não é objeto (%j)', (input) => {
    expect(checkScoreRequest(input)).toEqual({
      ok: false,
      invalidFields: [{ field: 'body', reason: 'deve ser um objeto JSON' }],
    });
  });

  it('lista todos os campos que faltam de uma vez', () => {
    const result = checkScoreRequest({ id: '  ', transaction: {}, customer: 'x' });

    expect(result).toMatchObject({ ok: false });
    expect((result as { invalidFields: { field: string }[] }).invalidFields.map((f) => f.field)).toEqual([
      'id',
      'customer',
      'merchant',
      'terminal',
    ]);
  });
});

describe('ScoreTransaction', () => {
  it('não chama a porta quando o corpo é inválido', async () => {
    let calls = 0;
    const useCase = new ScoreTransaction({
      score: async () => {
        calls += 1;
        return { kind: 'timeout' };
      },
    });

    expect((await useCase.execute({})).kind).toBe('invalid');
    expect(calls).toBe(0);
  });

  it('repassa o corpo à porta quando é válido', async () => {
    const useCase = new ScoreTransaction({
      score: async (payload) => ({ kind: 'response', status: 200, headers: {}, body: JSON.stringify(payload) }),
    });

    expect(await useCase.execute(scoreBody)).toMatchObject({ kind: 'scored', result: { status: 200 } });
  });
});

describe('POST /score', () => {
  it('repassa para /fraud-score da Function com a chave no header e devolve a decisão', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, { approved: true, fraud_score: 0.2 }));

    const response = await call(bff.baseUrl, 'POST', '/score', scoreBody);

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ approved: true, fraud_score: 0.2 });
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: '/fraud-score' });
    expect(fake.requests[0]!.headers['x-functions-key']).toBe(FUNCTION_KEY);
    expect(JSON.parse(fake.requests[0]!.body)).toEqual(scoreBody);
  });

  it('a chave do cliente nunca substitui a do servidor', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, { approved: true, fraud_score: 0 }));

    await call(bff.baseUrl, 'POST', '/score', scoreBody, { 'x-functions-key': 'chave-do-cliente' });

    expect(fake.requests[0]!.headers['x-functions-key']).toBe(FUNCTION_KEY);
  });

  it('não envia o header quando não há chave configurada', async () => {
    const fake = await startFakeUpstream((_r, res) => sendJson(res, 200, { approved: true, fraud_score: 0 }));
    cleanup.push(fake.close);
    const app = await listen(
      createApp({ features: [createScoreTransactionFeature({ functionUrl: fake.url, functionKey: null, timeoutMs: 200 })] }),
    );
    cleanup.push(app.close);

    await call(app.baseUrl, 'POST', '/score', scoreBody);

    expect(fake.requests[0]!.headers).not.toHaveProperty('x-functions-key');
  });

  it('responde 400 do BFF sem chamar a Function quando o mínimo falta', async () => {
    const { fake, bff } = await setup((_r, res) => sendJson(res, 200, {}));

    const response = await call(bff.baseUrl, 'POST', '/score', { id: 'tx' });

    expect(response.status).toBe(400);
    expect(response.json.error).toBe('invalid_request');
    expect(response.json.invalid_fields.map((f: { field: string }) => f.field)).toEqual([
      'transaction',
      'customer',
      'merchant',
      'terminal',
    ]);
    expect(fake.requests).toHaveLength(0);
  });

  it('devolve o 400 e o 503 da Function com o mesmo status, corpo e Retry-After', async () => {
    const invalid = { error: 'invalid_request', invalid_fields: [{ field: 'transaction.amount', reason: 'deve ser um número' }] };
    const { bff } = await setup((request, res) =>
      JSON.parse(request.body).id === 'tx-503'
        ? sendJson(res, 503, { error: 'index_not_ready' }, { 'retry-after': '5' })
        : sendJson(res, 400, invalid),
    );

    const rejected = await call(bff.baseUrl, 'POST', '/score', scoreBody);
    const notReady = await call(bff.baseUrl, 'POST', '/score', { ...scoreBody, id: 'tx-503' });

    expect(rejected.status).toBe(400);
    expect(rejected.json).toEqual(invalid);
    expect(notReady.status).toBe(503);
    expect(notReady.headers.get('retry-after')).toBe('5');
  });

  it('responde 502 e 504 sem expor a chave nem a URL da Function', async () => {
    const down = await bffFor(await deadUrl());
    const slow = await setup(() => undefined, 100);

    const unavailable = await call(down.baseUrl, 'POST', '/score', scoreBody);
    const timeout = await call(slow.bff.baseUrl, 'POST', '/score', scoreBody);

    expect(unavailable.status).toBe(502);
    expect(unavailable.json).toEqual({ error: 'upstream_unavailable', upstream: 'scoring' });
    expect(timeout.status).toBe(504);
    expect(timeout.json).toEqual({ error: 'upstream_timeout', upstream: 'scoring' });
    for (const response of [unavailable, timeout]) {
      expect(response.text).not.toContain(FUNCTION_KEY);
      expect(response.text).not.toContain('127.0.0.1');
      expect(JSON.stringify([...response.headers])).not.toContain(FUNCTION_KEY);
    }
  });
});
