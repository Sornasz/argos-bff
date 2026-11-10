export type ProxyMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Requisição do front que o BFF repassa ao microserviço sem interpretar. */
export interface ProxyRequest {
  readonly method: ProxyMethod;
  readonly path: string;
  readonly search: string;
  readonly body?: unknown;
}

export interface ProxyResponse {
  readonly kind: 'response';
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** Resposta do microserviço (qualquer status) ou a falha de rede/timeout ao chamá-lo. */
export type ProxyResult = ProxyResponse | { readonly kind: 'unavailable' } | { readonly kind: 'timeout' };
