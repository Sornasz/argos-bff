import type { HealthStatus } from '../domain/health-status.js';

/** Liveness do próprio BFF; não consulta os microserviços (isso é o /aggregated-data). */
export class CheckHealth {
  execute(): HealthStatus {
    return { status: 'ok', service: 'argos-bff' };
  }
}
