const decisionId = '3f2c9a54-6d1e-4b7a-9c58-2a4f1e0d7b11';
const reviewId = '9b1d6c20-7a3e-4f58-8d12-5c0e4a7f3b66';

const summaryExample = {
  id: decisionId,
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

const reviewExample = {
  id: reviewId,
  decisionId,
  analyst: { name: 'Eduardo Martins', email: 'eduardo.martins@example.com' },
  incorrect: true,
  comment: 'Cliente confirmou a compra.',
  reviewedAt: '2026-11-09T14:02:10.000Z',
  updatedAt: null,
};

const idParameter = (description: string, example: string) =>
  ({ name: 'id', in: 'path', required: true, description, schema: { type: 'string' }, example }) as const;

const upstreamFailures = {
  '502': { $ref: '#/components/responses/UpstreamUnavailable' },
  '504': { $ref: '#/components/responses/UpstreamTimeout' },
} as const;

const reviewResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Review' }, example: reviewExample } },
});

export const decisionsProxyPaths = {
  '/decisions': {
    get: {
      tags: ['Decisões'],
      summary: 'Lista as decisões, da mais recente para a mais antiga',
      description: 'Repassa a consulta ao microserviço de decisões (Azure SQL). Todos os filtros são opcionais e se combinam.',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['APROVADO', 'NEGADO'] }, example: 'NEGADO' },
        { name: 'from', in: 'query', description: 'Início do período (inclusive), em ISO 8601.', schema: { type: 'string' }, example: '2026-11-09' },
        { name: 'to', in: 'query', description: 'Fim do período (inclusive), em ISO 8601.', schema: { type: 'string' }, example: '2026-11-09T23:59:59Z' },
        { name: 'minScore', in: 'query', schema: { type: 'number', minimum: 0, maximum: 1 }, example: 0.6 },
        { name: 'maxScore', in: 'query', schema: { type: 'number', minimum: 0, maximum: 1 }, example: 1 },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, example: 1 },
      ],
      responses: {
        '200': {
          description: 'Página de decisões.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DecisionPage' },
              example: { items: [summaryExample], page: 1, pageSize: 20, total: 1, totalPages: 1 },
            },
          },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        ...upstreamFailures,
      },
    },
  },
  '/decisions/metrics': {
    get: {
      tags: ['Decisões'],
      summary: 'Métricas das decisões',
      responses: {
        '200': {
          description: 'Volume, taxas e total marcado como incorreto.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DecisionMetrics' },
              example: {
                total: 120,
                approved: 96,
                denied: 24,
                approvalRate: 0.8,
                denialRate: 0.2,
                averageScore: 0.27,
                markedIncorrect: 3,
              },
            },
          },
        },
        ...upstreamFailures,
      },
    },
  },
  '/decisions/{id}': {
    get: {
      tags: ['Decisões'],
      summary: 'Busca uma decisão com a transação e os vizinhos',
      parameters: [idParameter('UUID da decisão.', decisionId)],
      responses: {
        '200': {
          description: 'Decisão encontrada.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DecisionDetail' },
              example: {
                ...summaryExample,
                eventId: 'evt-7c1f',
                referenceIndexVersion: 'v1',
                notification: { status: 'enviada', channel: 'gmail', error: null, updatedAt: '2026-11-09T13:20:43.000Z' },
                featureVector: [0.5, 0.1, 0.2, 0.8, 0.3, 0.4, 0.9, 0.1, 0.6, 1, 0, 0.7, 0.2, 0.3],
                neighbors: [{ position: 1, referenceId: 300, distance: 0.011, label: 'fraud' }],
                transaction: { amount: 9500, installments: 1, requestedAt: '2026-11-09T13:20:40Z' },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
  },
  '/decisions/{id}/reviews': {
    get: {
      tags: ['Revisões'],
      summary: 'Lista as revisões de uma decisão',
      parameters: [idParameter('UUID da decisão.', decisionId)],
      responses: {
        '200': {
          description: 'Revisões, da mais recente para a mais antiga.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Review' } } } },
              example: { items: [reviewExample] },
            },
          },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
    post: {
      tags: ['Revisões'],
      summary: 'Cria uma revisão para a decisão',
      parameters: [idParameter('UUID da decisão.', decisionId)],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NewReview' },
            example: {
              analyst: reviewExample.analyst,
              incorrect: true,
              comment: reviewExample.comment,
            },
          },
        },
      },
      responses: {
        '201': {
          ...reviewResponse('Revisão criada. O header Location aponta para /reviews/{id}.'),
          headers: { Location: { schema: { type: 'string' }, example: `/reviews/${reviewId}` } },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
  },
  '/reviews/{id}': {
    put: {
      tags: ['Revisões'],
      summary: 'Altera uma revisão',
      parameters: [idParameter('UUID da revisão.', reviewId)],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ReviewChanges' },
            example: { incorrect: false, comment: 'Após nova análise, a decisão estava correta.' },
          },
        },
      },
      responses: {
        '200': reviewResponse('Revisão atualizada.'),
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
    delete: {
      tags: ['Revisões'],
      summary: 'Remove uma revisão',
      parameters: [idParameter('UUID da revisão.', reviewId)],
      responses: {
        '204': { description: 'Revisão removida.' },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
  },
};
