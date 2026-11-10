import { SourceFailure } from '../domain/source-failure.js';
import { callUpstream, parseJson } from '../../../shared/upstream-client.js';

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** GET que devolve o JSON de uma resposta 200; qualquer outra coisa vira SourceFailure. */
export async function getJson(baseUrl: string, path: string, timeoutMs: number): Promise<unknown> {
  const result = await callUpstream(baseUrl, { method: 'GET', path }, timeoutMs);
  if (result.kind === 'timeout') throw new SourceFailure('upstream_timeout');
  if (result.kind === 'unavailable') throw new SourceFailure('upstream_unavailable');
  if (result.status !== 200) throw new SourceFailure(`upstream_status_${result.status}`);
  const json = parseJson(result.body);
  if (json === null) throw new SourceFailure('upstream_invalid_response');
  return json;
}

/** Página no formato { items, total }; qualquer desvio vira SourceFailure. */
export function readPage(json: unknown): { items: JsonObject[]; total: number } {
  if (!isObject(json) || !Array.isArray(json.items) || typeof json.total !== 'number') {
    throw new SourceFailure('upstream_invalid_response');
  }
  if (!json.items.every(isObject)) throw new SourceFailure('upstream_invalid_response');
  return { items: json.items as JsonObject[], total: json.total };
}
