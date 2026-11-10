import { Router, type Request, type Response } from 'express';
import { bodyOf, isSafeId, searchOf, sendInvalidId, sendUpstreamResult } from '../../../shared/http.js';
import type { ForwardDecisionsRequest } from '../application/forward-decisions-request.use-case.js';
import type { ProxyMethod } from '../domain/proxy.js';

export function createDecisionsRouter(useCase: ForwardDecisionsRequest): Router {
  const router = Router();

  /** `template` usa `:id` para o parâmetro de rota, validado antes de montar o caminho do upstream. */
  const forward = (method: ProxyMethod, template: string) => async (request: Request, response: Response) => {
    const id = request.params.id as string | undefined;
    if (template.includes(':id') && !isSafeId(id ?? '')) {
      sendInvalidId(response, 'id');
      return;
    }
    const path = template.replace(':id', id ?? '');
    const result = await useCase.execute({ method, path, search: searchOf(request), body: bodyOf(request) });
    sendUpstreamResult(response, result, 'decisions');
  };

  router.get('/decisions', forward('GET', '/decisions'));
  // Precisa vir antes de /decisions/:id.
  router.get('/decisions/metrics', forward('GET', '/decisions/metrics'));
  router.get('/decisions/:id', forward('GET', '/decisions/:id'));
  router.get('/decisions/:id/reviews', forward('GET', '/decisions/:id/reviews'));
  router.post('/decisions/:id/reviews', forward('POST', '/decisions/:id/reviews'));
  router.put('/reviews/:id', forward('PUT', '/reviews/:id'));
  router.delete('/reviews/:id', forward('DELETE', '/reviews/:id'));
  return router;
}
