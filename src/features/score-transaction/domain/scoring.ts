export interface InvalidField {
  readonly field: string;
  readonly reason: string;
}

export type ScoreRequestCheck =
  | { readonly ok: true; readonly payload: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly invalidFields: InvalidField[] };

export interface ScoringResponse {
  readonly kind: 'response';
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Resposta da Function (qualquer status) ou a falha de rede/timeout ao chamá-la. */
export type ScoringResult = ScoringResponse | { readonly kind: 'unavailable' } | { readonly kind: 'timeout' };
