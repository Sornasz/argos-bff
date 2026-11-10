import type { ProxyRequest, ProxyResult } from '../domain/proxy.js';
import type { DecisionsGateway } from '../application/ports/decisions-gateway.js';
import { callUpstream } from '../../../shared/upstream-client.js';

export class HttpDecisionsGateway implements DecisionsGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  forward(request: ProxyRequest): Promise<ProxyResult> {
    return callUpstream(this.baseUrl, request, this.timeoutMs);
  }
}
