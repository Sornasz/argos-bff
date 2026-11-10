import { Router } from 'express';
import type { GetAggregatedData } from '../application/get-aggregated-data.use-case.js';

export function createAggregatedDataRouter(useCase: GetAggregatedData): Router {
  const router = Router();

  router.get('/aggregated-data', async (_request, response) => {
    const { data, available } = await useCase.execute();
    response.status(available ? 200 : 502).json(data);
  });

  return router;
}
