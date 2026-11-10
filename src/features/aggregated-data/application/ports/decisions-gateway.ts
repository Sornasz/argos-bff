import type { DecisionsOverview } from '../../domain/aggregated-data.js';

export interface DecisionsGateway {
  /** Lança SourceFailure quando o microserviço de decisões não responde de forma utilizável. */
  fetchOverview(): Promise<DecisionsOverview>;
}
