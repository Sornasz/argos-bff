import type { FeatureHttp } from '../../shared/feature-http.js';
import { createDecisionsRouter } from './api/decisions.router.js';
import { decisionsProxyPaths } from './api/decisions.openapi.js';
import { ForwardDecisionsRequest } from './application/forward-decisions-request.use-case.js';
import type { DecisionsGateway } from './application/ports/decisions-gateway.js';
import { HttpDecisionsGateway } from './infrastructure/http-decisions-gateway.js';

export interface DecisionsProxyFeatureOptions {
  readonly decisionsServiceUrl: string;
  readonly timeoutMs: number;
}

export function createDecisionsProxyFeature(options: DecisionsProxyFeatureOptions): FeatureHttp {
  const gateway: DecisionsGateway = new HttpDecisionsGateway(options.decisionsServiceUrl, options.timeoutMs);
  return { router: createDecisionsRouter(new ForwardDecisionsRequest(gateway)), openApiPaths: decisionsProxyPaths };
}
