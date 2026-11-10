import type { ScoringResult } from '../domain/scoring.js';
import type { TransactionScorer } from '../application/ports/transaction-scorer.js';
import { callUpstream } from '../../../shared/upstream-client.js';

/** Chama a Function (HTTP Trigger). A chave só viaja no header x-functions-key desta chamada. */
export class HttpTransactionScorer implements TransactionScorer {
  constructor(
    private readonly functionUrl: string,
    private readonly functionKey: string | null,
    private readonly timeoutMs: number,
  ) {}

  score(payload: Readonly<Record<string, unknown>>): Promise<ScoringResult> {
    return callUpstream(
      this.functionUrl,
      {
        method: 'POST',
        path: '/fraud-score',
        body: payload,
        headers: this.functionKey === null ? {} : { 'x-functions-key': this.functionKey },
      },
      this.timeoutMs,
    );
  }
}
