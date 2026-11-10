const ruleExample = {
  id: '6730b5f2a1c4d8e9f0a1b2c3',
  name: 'Valor máximo por transação',
  description: 'Nega transações acima do limite.',
  type: 'MAX_AMOUNT',
  params: { exemplo: 'ilustrativo; o formato é definido pelo serviço de regras' },
  enabled: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  updatedAt: '2026-11-09T12:00:00.000Z',
};

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Identificador da regra.',
  schema: { type: 'string' },
  example: ruleExample.id,
} as const;

const upstreamFailures = {
  '502': { $ref: '#/components/responses/UpstreamUnavailable' },
  '504': { $ref: '#/components/responses/UpstreamTimeout' },
} as const;

const ruleBody = (description: string) => ({
  required: true,
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/RuleInput' },
      example: {
        name: ruleExample.name,
        description: ruleExample.description,
        type: ruleExample.type,
        params: ruleExample.params,
        enabled: true,
      },
    },
  },
});

const ruleResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Rule' }, example: ruleExample } },
});

export const rulesProxyPaths = {
  '/rules': {
    get: {
      tags: ['Regras'],
      summary: 'Lista as regras',
      description: 'Repassa a consulta ao microserviço de regras (MongoDB) e devolve a resposta dele.',
      parameters: [
        { name: 'enabled', in: 'query', schema: { type: 'boolean' }, example: true },
        { name: 'type', in: 'query', schema: { type: 'string', enum: ['MAX_AMOUNT', 'BLOCKED_MCC'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, example: 1 },
      ],
      responses: {
        '200': {
          description: 'Página de regras.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RulePage' },
              example: { items: [ruleExample], page: 1, pageSize: 20, total: 1 },
            },
          },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        ...upstreamFailures,
      },
    },
    post: {
      tags: ['Regras'],
      summary: 'Cria uma regra',
      requestBody: ruleBody('Dados da nova regra.'),
      responses: {
        '201': {
          ...ruleResponse('Regra criada. O header Location aponta para /rules/{id}.'),
          headers: { Location: { schema: { type: 'string' }, example: `/rules/${ruleExample.id}` } },
        },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '409': { $ref: '#/components/responses/Conflict' },
        ...upstreamFailures,
      },
    },
  },
  '/rules/{id}': {
    get: {
      tags: ['Regras'],
      summary: 'Busca uma regra',
      parameters: [idParameter],
      responses: {
        '200': ruleResponse('Regra encontrada.'),
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
    put: {
      tags: ['Regras'],
      summary: 'Atualiza uma regra',
      parameters: [idParameter],
      requestBody: ruleBody('Dados atualizados da regra.'),
      responses: {
        '200': ruleResponse('Regra atualizada.'),
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
        ...upstreamFailures,
      },
    },
    delete: {
      tags: ['Regras'],
      summary: 'Remove uma regra',
      parameters: [idParameter],
      responses: {
        '204': { description: 'Regra removida.' },
        '400': { $ref: '#/components/responses/InvalidRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        ...upstreamFailures,
      },
    },
  },
};
