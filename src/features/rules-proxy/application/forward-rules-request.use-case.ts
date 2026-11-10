import type { ProxyRequest, ProxyResult } from '../domain/proxy.js';
import type { RulesGateway } from './ports/rules-gateway.js';

export class ForwardRulesRequest {
  constructor(private readonly gateway: RulesGateway) {}

  execute(request: ProxyRequest): Promise<ProxyResult> {
    return this.gateway.forward(request);
  }
}
