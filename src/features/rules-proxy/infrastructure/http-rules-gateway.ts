import type { ProxyRequest, ProxyResult } from '../domain/proxy.js';
import type { RulesGateway } from '../application/ports/rules-gateway.js';
import { callUpstream } from '../../../shared/upstream-client.js';

export class HttpRulesGateway implements RulesGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  forward(request: ProxyRequest): Promise<ProxyResult> {
    return callUpstream(this.baseUrl, request, this.timeoutMs);
  }
}
