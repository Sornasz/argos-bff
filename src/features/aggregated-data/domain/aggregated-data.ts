export type SourceName = 'rules' | 'decisions' | 'scoring';

export interface SourceReport {
  readonly status: 'ok' | 'error';
  readonly latencyMs: number;
  /** Código estável do problema, presente só quando status é "error". */
  readonly error?: string;
}

export type Rule = Readonly<Record<string, unknown>>;

export interface RulesSummary {
  readonly total: number;
  readonly enabled: number;
  readonly items: readonly Rule[];
}

export type DecisionSummary = Readonly<Record<string, unknown>>;

export interface DecisionsOverview {
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly recent: readonly DecisionSummary[];
}

export interface IndexReadiness {
  readonly state: string;
  readonly vectorCount: number;
  readonly version: string | null;
  readonly loadedAt: string | null;
  readonly loadDurationMs: number | null;
  readonly failureReason: string | null;
}

/** Estado de prontidão da Function, vindo do /ready dela. */
export interface ScoringReadiness {
  readonly status: 'ready' | 'starting' | 'unavailable';
  readonly index: IndexReadiness;
}

export interface AggregatedData {
  readonly generatedAt: string;
  readonly sources: Readonly<Record<SourceName, SourceReport>>;
  readonly rules: RulesSummary | null;
  readonly decisions: DecisionsOverview | null;
  readonly scoring: ScoringReadiness | null;
}

/** Quantos itens do resumo vão no agregado. */
export const PREVIEW_LIMIT = 5;
