import type { FeatureHttp } from '../../shared/feature-http.js';
import { aggregatedDataPaths } from './api/aggregated-data.openapi.js';
import { createAggregatedDataRouter } from './api/aggregated-data.router.js';
import { GetAggregatedData } from './application/get-aggregated-data.use-case.js';
import type { DecisionsGateway } from './application/ports/decisions-gateway.js';
import type { RulesGateway } from './application/ports/rules-gateway.js';
import type { ScoringGateway } from './application/ports/scoring-gateway.js';
import { HttpDecisionsGateway } from './infrastructure/http-decisions-gateway.js';
import { HttpRulesGateway } from './infrastructure/http-rules-gateway.js';
import { HttpScoringGateway } from './infrastructure/http-scoring-gateway.js';

export interface AggregatedDataFeatureOptions {
  readonly rulesServiceUrl: string;
  readonly decisionsServiceUrl: string;
  readonly functionUrl: string;
  readonly timeoutMs: number;
}

export function createAggregatedDataFeature(options: AggregatedDataFeatureOptions): FeatureHttp {
  const rules: RulesGateway = new HttpRulesGateway(options.rulesServiceUrl, options.timeoutMs);
  const decisions: DecisionsGateway = new HttpDecisionsGateway(options.decisionsServiceUrl, options.timeoutMs);
  const scoring: ScoringGateway = new HttpScoringGateway(options.functionUrl, options.timeoutMs);
  return {
    router: createAggregatedDataRouter(new GetAggregatedData(rules, decisions, scoring)),
    openApiPaths: aggregatedDataPaths,
  };
}
