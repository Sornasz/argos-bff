export const healthPaths = {
  '/health': {
    get: {
      tags: ['Saúde'],
      summary: 'Verifica se o BFF está de pé',
      description: 'Não consulta os microserviços; para o estado de cada fonte use GET /aggregated-data.',
      responses: {
        '200': {
          description: 'BFF respondendo.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Health' },
              example: { status: 'ok', service: 'argos-bff' },
            },
          },
        },
      },
    },
  },
};
