type Env = Readonly<Record<string, string | undefined>>;

export interface BffConfig {
  readonly port: number;
  readonly rulesServiceUrl: string;
  readonly decisionsServiceUrl: string;
  readonly functionUrl: string;
  /** null quando FUNCTION_KEY não foi definida (Function local, sem autenticação). */
  readonly functionKey: string | null;
  readonly upstreamTimeoutMs: number;
  /** Vazia quando CORS_ORIGIN não foi definida: CORS fica desligado. */
  readonly corsOrigins: readonly string[];
}

export class BffConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuração inválida do argos-bff:\n- ${problems.join('\n- ')}`);
    this.name = 'BffConfigError';
  }
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 5000;
const MAX_UPSTREAM_TIMEOUT_MS = 120_000;

function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

function readPort(env: Env, problems: string[]): number {
  const raw = value(env, 'PORT');
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT deve ser um inteiro entre 1 e 65535 (recebido "${raw}").`);
    return DEFAULT_PORT;
  }
  return port;
}

function readTimeout(env: Env, problems: string[]): number {
  const raw = value(env, 'UPSTREAM_TIMEOUT_MS');
  if (raw === undefined) return DEFAULT_UPSTREAM_TIMEOUT_MS;
  const timeout = Number(raw);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_UPSTREAM_TIMEOUT_MS) {
    problems.push(`UPSTREAM_TIMEOUT_MS deve ser um inteiro entre 1 e ${MAX_UPSTREAM_TIMEOUT_MS} (recebido "${raw}").`);
    return DEFAULT_UPSTREAM_TIMEOUT_MS;
  }
  return timeout;
}

/** URL obrigatória, http(s), sem barra final. Não há valor padrão: quem sobe o serviço escolhe os destinos. */
function readUrl(env: Env, name: string, problems: string[]): string {
  const raw = value(env, name);
  if (raw === undefined) {
    problems.push(`${name} é obrigatória (ex.: veja .env.example).`);
    return '';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push(`${name} deve ser uma URL válida (recebido "${raw}").`);
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    problems.push(`${name} deve começar com http:// ou https://.`);
    return '';
  }
  if (url.username || url.password) {
    problems.push(`${name} não deve conter usuário ou senha na URL.`);
    return '';
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

function readCorsOrigins(env: Env): string[] {
  return (value(env, 'CORS_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function readBffConfig(env: Env): BffConfig {
  const problems: string[] = [];
  const port = readPort(env, problems);
  const rulesServiceUrl = readUrl(env, 'RULES_SERVICE_URL', problems);
  const decisionsServiceUrl = readUrl(env, 'DECISIONS_SERVICE_URL', problems);
  const functionUrl = readUrl(env, 'FUNCTION_URL', problems);
  const upstreamTimeoutMs = readTimeout(env, problems);

  if (problems.length > 0) throw new BffConfigError(problems);
  return {
    port,
    rulesServiceUrl,
    decisionsServiceUrl,
    functionUrl,
    functionKey: value(env, 'FUNCTION_KEY') ?? null,
    upstreamTimeoutMs,
    corsOrigins: readCorsOrigins(env),
  };
}
