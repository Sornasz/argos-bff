import type { Express } from 'express';
import { createAggregatedDataFeature } from '../features/aggregated-data/index.js';
import { createDecisionsProxyFeature } from '../features/decisions-proxy/index.js';
import { createHealthCheckFeature } from '../features/health-check/index.js';
import { createRulesProxyFeature } from '../features/rules-proxy/index.js';
import { createScoreTransactionFeature } from '../features/score-transaction/index.js';
import type { BffConfig } from './config.js';
import { createApp } from './server.js';

/** Monta o BFF completo a partir da configuração: usado pelo main.ts e pelos testes de API. */
export function createBffApp(config: BffConfig, log?: (line: string) => void): Express {
  const timeoutMs = config.upstreamTimeoutMs;
  return createApp({
    corsOrigins: config.corsOrigins,
    ...(log && { log }),
    features: [
      createAggregatedDataFeature({
        rulesServiceUrl: config.rulesServiceUrl,
        decisionsServiceUrl: config.decisionsServiceUrl,
        functionUrl: config.functionUrl,
        timeoutMs,
      }),
      createRulesProxyFeature({ rulesServiceUrl: config.rulesServiceUrl, timeoutMs }),
      createDecisionsProxyFeature({ decisionsServiceUrl: config.decisionsServiceUrl, timeoutMs }),
      createScoreTransactionFeature({
        functionUrl: config.functionUrl,
        functionKey: config.functionKey,
        timeoutMs,
      }),
      createHealthCheckFeature(),
    ],
  });
}
