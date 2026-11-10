export type UpstreamName = 'rules' | 'decisions' | 'scoring';

export interface UpstreamRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Caminho começando em "/", relativo à URL base do upstream. */
  readonly path: string;
  /** Query string com o "?" inicial, ou vazio. */
  readonly search?: string;
  readonly body?: unknown;
  /** Headers extras do BFF para este upstream (ex.: chave da Function). */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface UpstreamResponse {
  readonly kind: 'response';
  readonly status: number;
  /** Só os headers da lista de repasse; nenhum outro sai do BFF. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type UpstreamCall = UpstreamResponse | { readonly kind: 'unavailable' } | { readonly kind: 'timeout' };

/** Headers do upstream que o BFF devolve ao cliente. */
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'location', 'retry-after'] as const;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Location absoluto do upstream vira caminho relativo, que é o que o front enxerga no BFF. */
function relativeLocation(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

/**
 * Chama o upstream com fetch nativo e timeout por AbortSignal. Nunca lança:
 * falha de rede e timeout viram resultados. Do cliente só passam content-type e
 * accept; cookies, authorization e afins nunca são repassados.
 */
export async function callUpstream(
  baseUrl: string,
  request: UpstreamRequest,
  timeoutMs: number,
  accept = 'application/json',
): Promise<UpstreamCall> {
  const hasBody = request.body !== undefined;
  const headers: Record<string, string> = { accept, ...request.headers };
  if (hasBody) headers['content-type'] = 'application/json';

  try {
    const response = await fetch(`${baseUrl}${request.path}${request.search ?? ''}`, {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    const passed: Record<string, string> = {};
    for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) passed[name] = name === 'location' ? relativeLocation(value) : value;
    }
    return { kind: 'response', status: response.status, headers: passed, body };
  } catch (error) {
    return isTimeout(error) ? { kind: 'timeout' } : { kind: 'unavailable' };
  }
}

/** Interpreta o corpo como JSON; null quando não for JSON válido. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
