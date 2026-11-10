import { SourceFailure } from '../domain/source-failure.js';
import type { ScoringReadiness } from '../domain/aggregated-data.js';
import type { ScoringGateway } from '../application/ports/scoring-gateway.js';
import { callUpstream, parseJson } from '../../../shared/upstream-client.js';
import { isObject } from './upstream-json.js';

const STATUSES = ['ready', 'starting', 'unavailable'] as const;

/** Converte o corpo do /ready da Function (snake_case) para o modelo do BFF. */
function parseReadiness(json: unknown): ScoringReadiness | null {
  if (!isObject(json) || !isObject(json.index)) return null;
  const { index } = json;
  const status = STATUSES.find((candidate) => candidate === json.status);
  if (status === undefined || typeof index.state !== 'string' || typeof index.vector_count !== 'number') return null;
  const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    status,
    index: {
      state: index.state,
      vectorCount: index.vector_count,
      version: textOrNull(index.version),
      loadedAt: textOrNull(index.loaded_at),
      loadDurationMs: typeof index.load_duration_ms === 'number' ? index.load_duration_ms : null,
      failureReason: textOrNull(index.failure_reason),
    },
  };
}

/** Usa só GET /ready (anônimo): a rota de pontuação gera evento e grava decisão. */
export class HttpScoringGateway implements ScoringGateway {
  constructor(
    private readonly functionUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchReadiness(): Promise<ScoringReadiness> {
    const result = await callUpstream(this.functionUrl, { method: 'GET', path: '/ready' }, this.timeoutMs);
    if (result.kind === 'timeout') throw new SourceFailure('upstream_timeout');
    if (result.kind === 'unavailable') throw new SourceFailure('upstream_unavailable');
    // 503 é o /ready dizendo "ainda não está pronta", com corpo no mesmo formato.
    if (result.status !== 200 && result.status !== 503) throw new SourceFailure(`upstream_status_${result.status}`);
    const readiness = parseReadiness(parseJson(result.body));
    if (readiness === null) throw new SourceFailure('upstream_invalid_response');
    return readiness;
  }
}
