import {
  PREVIEW_LIMIT,
  type AggregatedData,
  type SourceName,
  type SourceReport,
} from '../domain/aggregated-data.js';
import { SourceFailure } from '../domain/source-failure.js';
import type { DecisionsGateway } from './ports/decisions-gateway.js';
import type { RulesGateway } from './ports/rules-gateway.js';
import type { ScoringGateway } from './ports/scoring-gateway.js';

export interface AggregatedDataResult {
  readonly data: AggregatedData;
  /** false só quando as três fontes falharam. */
  readonly available: boolean;
}

export interface GetAggregatedDataOptions {
  readonly now?: () => number;
  readonly clock?: () => Date;
}

class TimedFailure extends Error {
  constructor(
    readonly code: string,
    readonly latencyMs: number,
  ) {
    super(code);
  }
}

export class GetAggregatedData {
  private readonly now: () => number;
  private readonly clock: () => Date;

  constructor(
    private readonly rules: RulesGateway,
    private readonly decisions: DecisionsGateway,
    private readonly scoring: ScoringGateway,
    options: GetAggregatedDataOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.clock = options.clock ?? (() => new Date());
  }

  /** Mede a latência de cada fonte e converte a falha em código, sem derrubar as outras. */
  private async timed<T>(run: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
    const started = this.now();
    try {
      const value = await run();
      return { value, latencyMs: Math.round(this.now() - started) };
    } catch (error) {
      const code = error instanceof SourceFailure ? error.code : 'unexpected_error';
      throw new TimedFailure(code, Math.round(this.now() - started));
    }
  }

  async execute(): Promise<AggregatedDataResult> {
    const [rules, decisions, scoring] = await Promise.allSettled([
      this.timed(() => this.rules.fetchSummary()),
      this.timed(() => this.decisions.fetchOverview()),
      this.timed(() => this.scoring.fetchReadiness()),
    ]);

    const failed = (result: PromiseRejectedResult): SourceReport => {
      const failure = result.reason as TimedFailure;
      return { status: 'error', latencyMs: failure.latencyMs, error: failure.code };
    };

    const rulesReport: SourceReport =
      rules.status === 'fulfilled' ? { status: 'ok', latencyMs: rules.value.latencyMs } : failed(rules);
    const decisionsReport: SourceReport =
      decisions.status === 'fulfilled' ? { status: 'ok', latencyMs: decisions.value.latencyMs } : failed(decisions);

    // Function que respondeu mas não está pronta conta como erro da fonte, com os dados do /ready.
    let scoringReport: SourceReport;
    if (scoring.status === 'rejected') {
      scoringReport = failed(scoring);
    } else if (scoring.value.value.status === 'ready') {
      scoringReport = { status: 'ok', latencyMs: scoring.value.latencyMs };
    } else {
      scoringReport = { status: 'error', latencyMs: scoring.value.latencyMs, error: 'scoring_not_ready' };
    }

    const sources: Record<SourceName, SourceReport> = {
      rules: rulesReport,
      decisions: decisionsReport,
      scoring: scoringReport,
    };

    const data: AggregatedData = {
      generatedAt: this.clock().toISOString(),
      sources,
      rules:
        rules.status === 'fulfilled'
          ? { ...rules.value.value, items: rules.value.value.items.slice(0, PREVIEW_LIMIT) }
          : null,
      decisions:
        decisions.status === 'fulfilled'
          ? {
              metrics: decisions.value.value.metrics,
              recent: decisions.value.value.recent.slice(0, PREVIEW_LIMIT),
            }
          : null,
      scoring: scoring.status === 'fulfilled' ? scoring.value.value : null,
    };

    const available = Object.values(sources).some((source) => source.status === 'ok');
    return { data, available };
  }
}
