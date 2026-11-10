import type { FeatureHttp } from '../../shared/feature-http.js';
import { createScoreRouter } from './api/score.router.js';
import { scoreTransactionPaths } from './api/score.openapi.js';
import type { TransactionScorer } from './application/ports/transaction-scorer.js';
import { ScoreTransaction } from './application/score-transaction.use-case.js';
import { HttpTransactionScorer } from './infrastructure/http-transaction-scorer.js';

export interface ScoreTransactionFeatureOptions {
  readonly functionUrl: string;
  readonly functionKey: string | null;
  readonly timeoutMs: number;
}

export function createScoreTransactionFeature(options: ScoreTransactionFeatureOptions): FeatureHttp {
  const scorer: TransactionScorer = new HttpTransactionScorer(
    options.functionUrl,
    options.functionKey,
    options.timeoutMs,
  );
  return { router: createScoreRouter(new ScoreTransaction(scorer)), openApiPaths: scoreTransactionPaths };
}
