import type { ProxyRequest, ProxyResult } from '../../domain/proxy.js';

export interface DecisionsGateway {
  forward(request: ProxyRequest): Promise<ProxyResult>;
}
