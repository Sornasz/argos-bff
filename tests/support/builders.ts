import type { BffConfig } from '../../src/bootstrap/config.js';

export const aRule = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Valor máximo',
  description: null,
  type: 'MAX_AMOUNT',
  params: { limit: 5000 },
  enabled: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  updatedAt: '2026-11-09T12:00:00.000Z',
  ...overrides,
});

export const aDecision = (overrides: Record<string, unknown> = {}) => ({
  id: '3f2c9a54-6d1e-4b7a-9c58-2a4f1e0d7b11',
  transactionId: 'tx-1',
  status: 'NEGADO',
  fraudScore: 0.8,
  approvalThreshold: 0.6,
  decidedAt: '2026-11-09T13:20:41.368Z',
  amount: 9500,
  mcc: '7995',
  markedIncorrect: false,
  notificationStatus: 'enviada',
  ...overrides,
});

export const metrics = {
  total: 10,
  approved: 8,
  denied: 2,
  approvalRate: 0.8,
  denialRate: 0.2,
  averageScore: 0.3,
  markedIncorrect: 1,
};

export const readyBody = {
  status: 'ready',
  index: {
    state: 'ready',
    vector_count: 1000,
    version: 'v1',
    loaded_at: '2026-11-09T12:00:00.000Z',
    load_duration_ms: 1200,
    failure_reason: null,
  },
};

export const scoreBody = {
  id: 'tx-1',
  transaction: { amount: 100, installments: 1, requested_at: '2026-03-11T20:23:35Z' },
  customer: { avg_amount: 100, tx_count_24h: 1, known_merchants: [] },
  merchant: { id: 'M1', mcc: '5912', avg_amount: 100 },
  terminal: { is_online: false, card_present: true, km_from_home: 1 },
  last_transaction: null,
};

export const FUNCTION_KEY = 'chave-super-secreta-123';

export function aConfig(overrides: Partial<BffConfig> = {}): BffConfig {
  return {
    port: 0,
    rulesServiceUrl: 'http://127.0.0.1:9',
    decisionsServiceUrl: 'http://127.0.0.1:9',
    functionUrl: 'http://127.0.0.1:9',
    functionKey: FUNCTION_KEY,
    upstreamTimeoutMs: 500,
    corsOrigins: [],
    ...overrides,
  };
}
