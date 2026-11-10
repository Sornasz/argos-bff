import type { RulesSummary } from '../../domain/aggregated-data.js';

export interface RulesGateway {
  /** Lança SourceFailure quando o microserviço de regras não responde de forma utilizável. */
  fetchSummary(): Promise<RulesSummary>;
}
