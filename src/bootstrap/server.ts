import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { FeatureHttp } from '../shared/index.js';
import { buildOpenApiDocument } from './openapi.js';

export interface AppOptions {
  readonly features: readonly FeatureHttp[];
  /** Origens permitidas; vazia mantém o CORS desligado. */
  readonly corsOrigins?: readonly string[];
  readonly log?: (line: string) => void;
}

export function createApp(options: AppOptions): Express {
  const log = options.log ?? console.error;
  const app = express();
  app.disable('x-powered-by');

  if (options.corsOrigins && options.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: [...options.corsOrigins],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['content-type', 'accept'],
        exposedHeaders: ['location', 'retry-after'],
        maxAge: 600,
      }),
    );
  }
  app.use(express.json({ limit: '100kb' }));

  const openApi = buildOpenApiDocument(options.features.map((feature) => feature.openApiPaths));
  app.get('/docs/openapi.json', (_request, response) => {
    response.json(openApi);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApi, { customSiteTitle: 'Argos BFF' }));

  for (const feature of options.features) app.use(feature.router);

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found', message: 'Rota não encontrada.' });
  });

  const onError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const failure = error as { type?: string } | null;
    if (failure?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'invalid_json', message: 'O corpo da requisição não é um JSON válido.' });
      return;
    }
    if (failure?.type === 'entity.too.large') {
      response.status(413).json({ error: 'payload_too_large', message: 'O corpo da requisição é grande demais.' });
      return;
    }
    log(JSON.stringify({ event: 'request_failed', reason: error instanceof Error ? error.message : String(error) }));
    response.status(500).json({ error: 'internal_error', message: 'Erro interno ao processar a requisição.' });
  };
  app.use(onError);

  return app;
}
