import { Router } from 'express';
import type { CheckHealth } from '../application/check-health.use-case.js';

export function createHealthRouter(useCase: CheckHealth): Router {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.json(useCase.execute());
  });
  return router;
}
