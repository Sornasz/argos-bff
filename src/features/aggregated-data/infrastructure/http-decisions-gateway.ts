import { SourceFailure } from '../domain/source-failure.js';
import type { DecisionsOverview } from '../domain/aggregated-data.js';
import type { DecisionsGateway } from '../application/ports/decisions-gateway.js';
import { getJson, isObject, readPage } from './upstream-json.js';

export class HttpDecisionsGateway implements DecisionsGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchOverview(): Promise<DecisionsOverview> {
    const [metrics, recent] = await Promise.all([
      getJson(this.baseUrl, '/decisions/metrics', this.timeoutMs),
      getJson(this.baseUrl, '/decisions?page=1', this.timeoutMs),
    ]);
    if (!isObject(metrics)) throw new SourceFailure('upstream_invalid_response');
    return { metrics, recent: readPage(recent).items };
  }
}
