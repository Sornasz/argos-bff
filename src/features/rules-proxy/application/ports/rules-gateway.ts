import type { ProxyRequest, ProxyResult } from '../../domain/proxy.js';

export interface RulesGateway {
  forward(request: ProxyRequest): Promise<ProxyResult>;
}
