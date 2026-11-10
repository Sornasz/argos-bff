/** Falha esperada ao consultar uma fonte; o código vai para `sources.<fonte>.error`. */
export class SourceFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SourceFailure';
  }
}
