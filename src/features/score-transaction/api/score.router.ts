import { Router } from 'express';
import { sendInvalidRequest, sendUpstreamResult } from '../../../shared/http.js';
import type { ScoreTransaction } from '../application/score-transaction.use-case.js';

export function createScoreRouter(useCase: ScoreTransaction): Router {
  const router = Router();

  router.post('/score', async (request, response) => {
    const outcome = await useCase.execute(request.body);
    if (outcome.kind === 'invalid') {
      sendInvalidRequest(response, outcome.invalidFields);
      return;
    }
    sendUpstreamResult(response, outcome.result, 'scoring');
  });

  return router;
}
