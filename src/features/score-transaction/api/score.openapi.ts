export const scoreTransactionPaths = {
  '/score': {
    post: {
      tags: ['Pontuação'],
      summary: 'Pontua uma transação',
      description:
        'Valida o mínimo e repassa a transação à Azure Function de pontuação. A resposta da Function, inclusive 400 e 503, é devolvida com o mesmo status. Cada chamada gera um evento e grava uma decisão no histórico.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ScoreRequest' },
            example: {
              id: 'tx-1329056812',
              transaction: { amount: 384.88, installments: 3, requested_at: '2026-03-11T20:23:35Z' },
              customer: { avg_amount: 769.76, tx_count_24h: 3, known_merchants: ['MERC-009', 'MERC-001'] },
              merchant: { id: 'MERC-001', mcc: '5912', avg_amount: 298.95 },
              terminal: { is_online: false, card_present: true, km_from_home: 13.7090520965 },
              last_transaction: null,
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Decisão da Function.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ScoreResponse' },
              example: { approved: true, fraud_score: 0.2 },
            },
          },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '503': {
          description: 'A Function ainda está carregando o índice (repassado; inclui Retry-After).',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { error: 'index_not_ready', message: 'O índice vetorial ainda está sendo carregado.' },
            },
          },
        },
        '502': { $ref: '#/components/responses/UpstreamUnavailable' },
        '504': { $ref: '#/components/responses/UpstreamTimeout' },
      },
    },
  },
};
