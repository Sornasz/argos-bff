import type { InvalidField, ScoreRequestCheck } from '../domain/scoring.js';

const REQUIRED_OBJECTS = ['transaction', 'customer', 'merchant', 'terminal'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validação mínima do BFF: só garante que o corpo tem a forma esperada. A
 * validação completa dos campos é da Function, cuja resposta 400 é repassada.
 */
export function checkScoreRequest(input: unknown): ScoreRequestCheck {
  if (!isObject(input)) {
    return { ok: false, invalidFields: [{ field: 'body', reason: 'deve ser um objeto JSON' }] };
  }
  const invalidFields: InvalidField[] = [];
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    invalidFields.push({ field: 'id', reason: 'deve ser um texto não vazio' });
  }
  for (const name of REQUIRED_OBJECTS) {
    if (!isObject(input[name])) invalidFields.push({ field: name, reason: 'deve ser um objeto' });
  }
  return invalidFields.length > 0 ? { ok: false, invalidFields } : { ok: true, payload: input };
}
