const rule = {
  id: '6730b5f2a1c4d8e9f0a1b2c3',
  name: 'Valor máximo por transação',
  description: null,
  type: 'MAX_AMOUNT',
  params: { exemplo: 'ilustrativo' },
  enabled: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  updatedAt: '2026-11-09T12:00:00.000Z',
};

const decision = {
  id: '3f2c9a54-6d1e-4b7a-9c58-2a4f1e0d7b11',
  transactionId: 'tx-1329056812',
  status: 'NEGADO',
  fraudScore: 0.8,
  approvalThreshold: 0.6,
  decidedAt: '2026-11-09T13:20:41.368Z',
  amount: 9500,
  mcc: '7995',
  markedIncorrect: false,
  notificationStatus: 'enviada',
};

const fullExample = {
  generatedAt: '2026-11-09T14:30:00.123Z',
  sources: {
    rules: { status: 'ok', latencyMs: 41 },
    decisions: { status: 'ok', latencyMs: 87 },
    scoring: { status: 'ok', latencyMs: 12 },
  },
  rules: { total: 4, enabled: 3, items: [rule] },
  decisions: {
    metrics: {
      total: 120,
      approved: 96,
      denied: 24,
      approvalRate: 0.8,
      denialRate: 0.2,
      averageScore: 0.27,
      markedIncorrect: 3,
    },
    recent: [decision],
  },
  scoring: {
    status: 'ready',
    index: {
      state: 'ready',
      vectorCount: 100000,
      version: 'v1',
      loadedAt: '2026-11-09T12:00:05.000Z',
      loadDurationMs: 4210,
      failureReason: null,
    },
  },
};

const partialExample = {
  ...fullExample,
  sources: {
    ...fullExample.sources,
    decisions: { status: 'error', latencyMs: 5001, error: 'upstream_timeout' },
  },
  decisions: null,
};

export const aggregatedDataPaths = {
  '/aggregated-data': {
    get: {
      tags: ['Agregado'],
      summary: 'Dados agregados de regras, decisões e pontuação',
      description:
        'Consulta em paralelo o microserviço de regras, o de decisões e o /ready da Azure Function, cada um com timeout próprio, e devolve tudo num único response. Uma fonte que falha não derruba as outras: ela aparece com `status: "error"` em `sources` e o bloco dela vem `null`. A pontuação de transações não é chamada aqui.\n\n' +
        'Responde `200` quando pelo menos uma fonte respondeu e `502` apenas quando todas falharam (mesmo formato de corpo). Códigos de erro por fonte: `upstream_unavailable`, `upstream_timeout`, `upstream_status_<código>`, `upstream_invalid_response`, `scoring_not_ready` (a Function respondeu, mas o índice ainda não está pronto; os dados do /ready vêm em `scoring`).',
      responses: {
        '200': {
          description: 'Pelo menos uma fonte respondeu.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AggregatedData' },
              examples: {
                completo: { summary: 'Três fontes respondendo', value: fullExample },
                fonteComErro: { summary: 'Decisões em timeout', value: partialExample },
              },
            },
          },
        },
        '502': {
          description: 'As três fontes falharam.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AggregatedData' },
              example: {
                generatedAt: '2026-11-09T14:30:00.123Z',
                sources: {
                  rules: { status: 'error', latencyMs: 3, error: 'upstream_unavailable' },
                  decisions: { status: 'error', latencyMs: 4, error: 'upstream_unavailable' },
                  scoring: { status: 'error', latencyMs: 5001, error: 'upstream_timeout' },
                },
                rules: null,
                decisions: null,
                scoring: null,
              },
            },
          },
        },
      },
    },
  },
};
