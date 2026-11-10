import type { FeatureHttp } from '../../shared/feature-http.js';
import { createRulesRouter } from './api/rules.router.js';
import { rulesProxyPaths } from './api/rules.openapi.js';
import { ForwardRulesRequest } from './application/forward-rules-request.use-case.js';
import type { RulesGateway } from './application/ports/rules-gateway.js';
import { HttpRulesGateway } from './infrastructure/http-rules-gateway.js';

export interface RulesProxyFeatureOptions {
  readonly rulesServiceUrl: string;
  readonly timeoutMs: number;
}

export function createRulesProxyFeature(options: RulesProxyFeatureOptions): FeatureHttp {
  const gateway: RulesGateway = new HttpRulesGateway(options.rulesServiceUrl, options.timeoutMs);
  return { router: createRulesRouter(new ForwardRulesRequest(gateway)), openApiPaths: rulesProxyPaths };
}
