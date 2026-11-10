import type { RulesSummary } from '../domain/aggregated-data.js';
import type { RulesGateway } from '../application/ports/rules-gateway.js';
import { getJson, readPage } from './upstream-json.js';

export class HttpRulesGateway implements RulesGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchSummary(): Promise<RulesSummary> {
    const [all, enabled] = await Promise.all([
      getJson(this.baseUrl, '/rules?page=1', this.timeoutMs),
      getJson(this.baseUrl, '/rules?enabled=true&page=1', this.timeoutMs),
    ]);
    const page = readPage(all);
    return { total: page.total, enabled: readPage(enabled).total, items: page.items };
  }
}
