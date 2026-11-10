import type { FeatureHttp } from '../../shared/feature-http.js';
import { healthPaths } from './api/health.openapi.js';
import { createHealthRouter } from './api/health.router.js';
import { CheckHealth } from './application/check-health.use-case.js';

export function createHealthCheckFeature(): FeatureHttp {
  return { router: createHealthRouter(new CheckHealth()), openApiPaths: healthPaths };
}
