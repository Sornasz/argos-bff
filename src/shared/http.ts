import type { Request, Response } from 'express';
import type { UpstreamCall, UpstreamName } from './upstream-client.js';

export interface InvalidField {
  readonly field: string;
  readonly reason: string;
}

/** Evita que `..` ou `/` em parâmetros de rota mudem o caminho chamado no upstream. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

export function sendInvalidRequest(response: Response, invalidFields: readonly InvalidField[]): void {
  response.status(400).json({
    error: 'invalid_request',
    message: 'Campos ausentes ou em formato incorreto.',
    invalid_fields: invalidFields,
  });
}

export function sendInvalidId(response: Response, name: string): void {
  sendInvalidRequest(response, [{ field: name, reason: 'formato inválido' }]);
}

/** Query string original ("?a=b") ou vazio. */
export function searchOf(request: Request): string {
  const index = request.originalUrl.indexOf('?');
  return index === -1 ? '' : request.originalUrl.slice(index);
}

/** Corpo JSON recebido, ou undefined quando a requisição veio sem corpo. */
export function bodyOf(request: Request): unknown {
  return request.body === undefined || request.body === null ? undefined : request.body;
}

/** Devolve ao cliente o que o upstream respondeu, ou 502/504 quando ele não respondeu. */
export function sendUpstreamResult(response: Response, result: UpstreamCall, upstream: UpstreamName): void {
  if (result.kind === 'timeout') {
    response.status(504).json({ error: 'upstream_timeout', upstream });
    return;
  }
  if (result.kind === 'unavailable') {
    response.status(502).json({ error: 'upstream_unavailable', upstream });
    return;
  }
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  response.status(result.status);
  if (result.body === '') {
    response.end();
    return;
  }
  if (!response.hasHeader('content-type')) response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.send(result.body);
}
