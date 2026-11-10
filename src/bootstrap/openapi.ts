type PathItem = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` }) as const;

const sourceReport = {
  type: 'object',
  required: ['status', 'latencyMs'],
  properties: {
    status: { type: 'string', enum: ['ok', 'error'] },
    latencyMs: { type: 'integer', description: 'Tempo até a fonte responder ou falhar.' },
    error: { type: 'string', description: 'Código do problema; só quando status é "error".', example: 'upstream_timeout' },
  },
} as const;

const schemas = {
  AggregatedData: {
    type: 'object',
    required: ['generatedAt', 'sources', 'rules', 'decisions', 'scoring'],
    properties: {
      generatedAt: timestamp,
      sources: {
        type: 'object',
        required: ['rules', 'decisions', 'scoring'],
        properties: { rules: sourceReport, decisions: sourceReport, scoring: sourceReport },
      },
      rules: {
        type: 'object',
        nullable: true,
        description: 'null quando a fonte de regras falhou.',
        properties: {
          total: { type: 'integer' },
          enabled: { type: 'integer', description: 'Quantidade de regras com enabled=true.' },
          items: { type: 'array', maxItems: 5, items: ref('Rule') },
        },
      },
      decisions: {
        type: 'object',
        nullable: true,
        description: 'null quando a fonte de decisões falhou.',
        properties: {
          metrics: ref('DecisionMetrics'),
          recent: { type: 'array', maxItems: 5, items: ref('DecisionSummary') },
        },
      },
      scoring: {
        type: 'object',
        nullable: true,
        description: 'Prontidão da Function (/ready); null quando ela não respondeu.',
        properties: {
          status: { type: 'string', enum: ['ready', 'starting', 'unavailable'] },
          index: {
            type: 'object',
            properties: {
              state: { type: 'string', enum: ['loading', 'ready', 'failed'] },
              vectorCount: { type: 'integer' },
              version: { type: 'string', nullable: true },
              loadedAt: { ...timestamp, nullable: true },
              loadDurationMs: { type: 'integer', nullable: true },
              failureReason: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },
  Rule: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      type: { type: 'string', enum: ['MAX_AMOUNT', 'BLOCKED_MCC'] },
      params: { type: 'object', description: 'Parâmetros da regra, definidos pelo serviço de regras conforme o tipo.' },
      enabled: { type: 'boolean' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  RuleInput: {
    type: 'object',
    required: ['name', 'type', 'params'],
    properties: {
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      type: { type: 'string', enum: ['MAX_AMOUNT', 'BLOCKED_MCC'] },
      params: { type: 'object' },
      enabled: { type: 'boolean' },
    },
  },
  RulePage: {
    type: 'object',
    properties: {
      items: { type: 'array', items: ref('Rule') },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
    },
  },
  DecisionSummary: {
    type: 'object',
    properties: {
      id: uuid,
      transactionId: { type: 'string' },
      status: { type: 'string', enum: ['APROVADO', 'NEGADO'] },
      fraudScore: { type: 'number', minimum: 0, maximum: 1 },
      approvalThreshold: { type: 'number' },
      decidedAt: timestamp,
      amount: { type: 'number' },
      mcc: { type: 'string' },
      markedIncorrect: { type: 'boolean' },
      notificationStatus: { type: 'string', enum: ['pendente', 'nao_aplicavel', 'enviada', 'falhou'] },
    },
  },
  DecisionPage: {
    type: 'object',
    properties: {
      items: { type: 'array', items: ref('DecisionSummary') },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  },
  DecisionDetail: {
    type: 'object',
    description: 'Decisão com transação, vetor de 14 dimensões e vizinhos, como devolvida pelo serviço de decisões.',
    additionalProperties: true,
  },
  DecisionMetrics: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      approved: { type: 'integer' },
      denied: { type: 'integer' },
      approvalRate: { type: 'number', minimum: 0, maximum: 1 },
      denialRate: { type: 'number', minimum: 0, maximum: 1 },
      averageScore: { type: 'number', nullable: true },
      markedIncorrect: { type: 'integer' },
    },
  },
  NewReview: {
    type: 'object',
    required: ['analyst', 'incorrect'],
    properties: {
      analyst: {
        type: 'object',
        required: ['name', 'email'],
        properties: { name: { type: 'string', maxLength: 200 }, email: { type: 'string', format: 'email' } },
      },
      incorrect: { type: 'boolean' },
      comment: { type: 'string', nullable: true, maxLength: 2000 },
    },
  },
  ReviewChanges: {
    type: 'object',
    properties: {
      incorrect: { type: 'boolean' },
      comment: { type: 'string', nullable: true, maxLength: 2000 },
    },
  },
  Review: {
    type: 'object',
    properties: {
      id: uuid,
      decisionId: uuid,
      analyst: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' } } },
      incorrect: { type: 'boolean' },
      comment: { type: 'string', nullable: true },
      reviewedAt: timestamp,
      updatedAt: { ...timestamp, nullable: true },
    },
  },
  ScoreRequest: {
    type: 'object',
    required: ['id', 'transaction', 'customer', 'merchant', 'terminal'],
    description: 'O BFF exige só estes campos; a Function valida o restante (inclusive last_transaction, que aceita null).',
    properties: {
      id: { type: 'string' },
      transaction: { type: 'object' },
      customer: { type: 'object' },
      merchant: { type: 'object' },
      terminal: { type: 'object' },
      last_transaction: { type: 'object', nullable: true },
      approvalThreshold: { type: 'number', description: 'Opcional, no intervalo (0, 1].' },
    },
  },
  ScoreResponse: {
    type: 'object',
    properties: { approved: { type: 'boolean' }, fraud_score: { type: 'number', minimum: 0, maximum: 1 } },
  },
  Health: {
    type: 'object',
    properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', example: 'argos-bff' } },
  },
  Error: {
    type: 'object',
    properties: {
      error: { type: 'string', example: 'invalid_request' },
      message: { type: 'string' },
      invalid_fields: {
        type: 'array',
        items: { type: 'object', properties: { field: { type: 'string' }, reason: { type: 'string' } } },
      },
    },
  },
  UpstreamError: {
    type: 'object',
    required: ['error', 'upstream'],
    properties: {
      error: { type: 'string', enum: ['upstream_unavailable', 'upstream_timeout'] },
      upstream: { type: 'string', enum: ['rules', 'decisions', 'scoring'] },
    },
  },
};

const errorResponse = (description: string, example: unknown) => ({
  description,
  content: { 'application/json': { schema: ref('Error'), example } },
});

const upstreamResponse = (description: string, error: string, upstream: string) => ({
  description,
  content: { 'application/json': { schema: ref('UpstreamError'), example: { error, upstream } } },
});

const responses = {
  InvalidRequest: errorResponse('Parâmetro, campo ou corpo inválido (do BFF ou repassado do microserviço).', {
    error: 'invalid_request',
    message: 'Campos ausentes ou em formato incorreto.',
    invalid_fields: [{ field: 'id', reason: 'deve ser um texto não vazio' }],
  }),
  NotFound: errorResponse('Recurso não encontrado (repassado do microserviço).', {
    error: 'not_found',
    message: 'Recurso não encontrado.',
  }),
  Conflict: errorResponse('Conflito, por exemplo nome duplicado (repassado do microserviço).', {
    error: 'conflict',
    message: 'Já existe um recurso com esse nome.',
  }),
  UpstreamUnavailable: upstreamResponse('O microserviço ou a Function não respondeu (rede).', 'upstream_unavailable', 'rules'),
  UpstreamTimeout: upstreamResponse('O microserviço ou a Function estourou o tempo limite.', 'upstream_timeout', 'decisions'),
};

/** Junta os paths das features; a mesma rota pode vir de features diferentes, com métodos diferentes. */
function mergePaths(featurePaths: readonly Record<string, unknown>[]): Record<string, PathItem> {
  const merged: Record<string, PathItem> = {};
  for (const paths of featurePaths) {
    for (const [path, item] of Object.entries(paths)) {
      merged[path] = { ...merged[path], ...(item as PathItem) };
    }
  }
  return merged;
}

export function buildOpenApiDocument(featurePaths: readonly Record<string, unknown>[]) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Argos BFF',
      version: '0.1.0',
      description:
        'Backend for Frontend do Argos. O front fala só com este serviço, que agrega dados, repassa o CRUD aos microserviços de regras e de decisões e chama a Azure Function de pontuação.',
    },
    tags: [
      { name: 'Agregado', description: 'Visão única das três fontes.' },
      { name: 'Regras', description: 'CRUD repassado ao microserviço de regras.' },
      { name: 'Decisões', description: 'Consulta ao histórico, repassada ao microserviço de decisões.' },
      { name: 'Revisões', description: 'CRUD de revisões, repassado ao microserviço de decisões.' },
      { name: 'Pontuação', description: 'Chamada à Azure Function.' },
      { name: 'Saúde' },
    ],
    paths: mergePaths(featurePaths),
    components: { schemas, responses },
  };
}
