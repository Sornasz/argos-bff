import { Router, type Request, type Response } from 'express';
import { bodyOf, isSafeId, searchOf, sendInvalidId, sendUpstreamResult } from '../../../shared/http.js';
import type { ForwardRulesRequest } from '../application/forward-rules-request.use-case.js';
import type { ProxyMethod } from '../domain/proxy.js';

export function createRulesRouter(useCase: ForwardRulesRequest): Router {
  const router = Router();

  const forward = (method: ProxyMethod, withId: boolean) => async (request: Request, response: Response) => {
    const id = request.params.id as string | undefined;
    if (withId && !isSafeId(id ?? '')) {
      sendInvalidId(response, 'id');
      return;
    }
    const path = withId ? `/rules/${id}` : '/rules';
    const result = await useCase.execute({ method, path, search: searchOf(request), body: bodyOf(request) });
    sendUpstreamResult(response, result, 'rules');
  };

  router.get('/rules', forward('GET', false));
  router.post('/rules', forward('POST', false));
  router.get('/rules/:id', forward('GET', true));
  router.put('/rules/:id', forward('PUT', true));
  router.delete('/rules/:id', forward('DELETE', true));
  return router;
}
