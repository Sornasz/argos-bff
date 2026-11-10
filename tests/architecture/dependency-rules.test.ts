import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { cleanProject, violations, writeProject } from './fixture-project.js';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const configPath = `${repoRoot}.dependency-cruiser.cjs`;
const depcruiseBin = `${repoRoot}node_modules/.bin/depcruise`;

const createdRoots: string[] = [];
afterAll(() => createdRoots.forEach((root) => rmSync(root, { recursive: true, force: true })));

interface CheckResult {
  readonly exitCode: number;
  readonly violatedRules: string[];
}

/**
 * Roda exatamente a checagem de `npm run check:arch` (saída `err`, que é a que
 * define o exit code) sobre um projeto de fixture.
 */
async function checkArchitecture(files: Record<string, string>): Promise<CheckResult> {
  const root = writeProject(files);
  createdRoots.push(root);
  let exitCode = 0;
  let output: string;
  try {
    ({ stdout: output } = await run(depcruiseBin, ['src', '--config', configPath], { cwd: root }));
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    exitCode = failure.code;
    output = failure.stdout;
  }
  const violatedRules = [...new Set([...output.matchAll(/^\s*error (\S+):/gm)].map((match) => match[1]!))];
  return { exitCode, violatedRules };
}

describe('regras de dependência (dependency-cruiser)', () => {
  it('aceita um projeto que respeita as camadas e as features', async () => {
    const result = await checkArchitecture(cleanProject);

    expect(result).toEqual({ exitCode: 0, violatedRules: [] });
  });

  it.concurrent.each(violations.map((violation) => [violation.rule, violation.file, violation] as const))(
    'quebra a checagem com a regra %s ao introduzir %s',
    async (rule, _file, violation) => {
      const result = await checkArchitecture({ ...cleanProject, [violation.file]: violation.content });

      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.violatedRules).toEqual([rule]);
    },
  );
});
