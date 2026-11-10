import type { ScoringReadiness } from '../../domain/aggregated-data.js';

export interface ScoringGateway {
  /** Consulta só a prontidão da Function; nunca pontua transação. Lança SourceFailure se ela não responder. */
  fetchReadiness(): Promise<ScoringReadiness>;
}
