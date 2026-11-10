import type { ScoringResult } from '../../domain/scoring.js';

export interface TransactionScorer {
  score(payload: Readonly<Record<string, unknown>>): Promise<ScoringResult>;
}
