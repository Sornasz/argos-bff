import { describe, expect, it } from 'vitest';
import { BffConfigError, readBffConfig } from '../../src/bootstrap/config.js';

const URLS = {
  RULES_SERVICE_URL: 'http://rules:3001',
  DECISIONS_SERVICE_URL: 'http://decisions:3002/',
  FUNCTION_URL: 'https://func.example.net',
};

function problemsOf(env: Record<string, string>): string[] {
  try {
    readBffConfig(env);
  } catch (error) {
    if (error instanceof BffConfigError) return error.problems;
    throw error;
  }
  throw new Error('esperava configuração inválida');
}

describe('readBffConfig', () => {
  it('usa porta 3000 e timeout de 5000 ms por padrão', () => {
    const config = readBffConfig(URLS);

    expect(config.port).toBe(3000);
    expect(config.upstreamTimeoutMs).toBe(5000);
    expect(config.corsOrigins).toEqual([]);
    expect(config.functionKey).toBeNull();
  });

  it('lê PORT, UPSTREAM_TIMEOUT_MS, FUNCTION_KEY e CORS_ORIGIN', () => {
    const config = readBffConfig({
      ...URLS,
      PORT: '8080',
      UPSTREAM_TIMEOUT_MS: '1500',
      FUNCTION_KEY: ' abc ',
      CORS_ORIGIN: 'http://localhost:5173, https://app.example.com ,',
    });

    expect(config).toMatchObject({
      port: 8080,
      upstreamTimeoutMs: 1500,
      functionKey: 'abc',
      corsOrigins: ['http://localhost:5173', 'https://app.example.com'],
    });
  });

  it('remove a barra final das URLs', () => {
    expect(readBffConfig(URLS)).toMatchObject({
      rulesServiceUrl: 'http://rules:3001',
      decisionsServiceUrl: 'http://decisions:3002',
      functionUrl: 'https://func.example.net',
    });
  });

  it('exige as três URLs, sem cair em localhost', () => {
    expect(problemsOf({})).toEqual([
      expect.stringContaining('RULES_SERVICE_URL é obrigatória'),
      expect.stringContaining('DECISIONS_SERVICE_URL é obrigatória'),
      expect.stringContaining('FUNCTION_URL é obrigatória'),
    ]);
  });

  it('rejeita URL inválida, de outro protocolo ou com credenciais', () => {
    expect(problemsOf({ ...URLS, RULES_SERVICE_URL: 'rules' })[0]).toContain('URL válida');
    expect(problemsOf({ ...URLS, RULES_SERVICE_URL: 'ftp://rules' })[0]).toContain('http://');
    expect(problemsOf({ ...URLS, FUNCTION_URL: 'https://user:senha@func.net' })[0]).toContain('usuário ou senha');
  });

  it('rejeita PORT e UPSTREAM_TIMEOUT_MS inválidos', () => {
    expect(problemsOf({ ...URLS, PORT: 'abc' })[0]).toContain('PORT');
    expect(problemsOf({ ...URLS, PORT: '70000' })[0]).toContain('PORT');
    expect(problemsOf({ ...URLS, UPSTREAM_TIMEOUT_MS: '0' })[0]).toContain('UPSTREAM_TIMEOUT_MS');
    expect(problemsOf({ ...URLS, UPSTREAM_TIMEOUT_MS: 'rápido' })[0]).toContain('UPSTREAM_TIMEOUT_MS');
  });

  it('a mensagem de erro não carrega a chave da Function', () => {
    expect(() => readBffConfig({ FUNCTION_KEY: 'segredo-xyz' })).toThrowError(expect.not.stringContaining('segredo-xyz'));
  });
});
