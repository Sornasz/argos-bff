import type { ProxyRequest, ProxyResult } from '../domain/proxy.js';
import type { DecisionsGateway } from './ports/decisions-gateway.js';

export class ForwardDecisionsRequest {
  constructor(private readonly gateway: DecisionsGateway) {}

  execute(request: ProxyRequest): Promise<ProxyResult> {
    return this.gateway.forward(request);
  }
}
