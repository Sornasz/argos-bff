import type { InvalidField, ScoringResult } from '../domain/scoring.js';
import type { TransactionScorer } from './ports/transaction-scorer.js';
import { checkScoreRequest } from './score-request.js';

export type ScoreTransactionOutcome =
  | { readonly kind: 'invalid'; readonly invalidFields: InvalidField[] }
  | { readonly kind: 'scored'; readonly result: ScoringResult };

export class ScoreTransaction {
  constructor(private readonly scorer: TransactionScorer) {}

  async execute(input: unknown): Promise<ScoreTransactionOutcome> {
    const check = checkScoreRequest(input);
    if (!check.ok) return { kind: 'invalid', invalidFields: check.invalidFields };
    return { kind: 'scored', result: await this.scorer.score(check.payload) };
  }
}
