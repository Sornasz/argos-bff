import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = 'src';

const baseFiles: Record<string, string> = {
  [`${root}/features/alpha/domain/entity.ts`]: `export interface Entity { id: string }\n`,
  [`${root}/features/alpha/domain/rules.ts`]:
    `import type { Entity } from './entity.js';\nexport const isValid = (entity: Entity) => entity.id !== '';\n`,
  [`${root}/features/alpha/application/ports/repository.ts`]:
    `import type { Entity } from '../../domain/entity.js';\nexport interface Repository { find(id: string): Entity | undefined }\n`,
  [`${root}/features/alpha/application/use-case.ts`]: [
    `import { isValid } from '../domain/rules.js';`,
    `import type { Repository } from './ports/repository.js';`,
    `export const findValid = (repository: Repository, id: string) => {`,
    `  const entity = repository.find(id);`,
    `  return entity && isValid(entity) ? entity : undefined;`,
    `};`,
    ``,
  ].join('\n'),
  [`${root}/features/alpha/infrastructure/repository.ts`]: [
    `import { existsSync } from 'node:fs';`,
    `import type { Repository } from '../application/ports/repository.js';`,
    `export const fileRepository: Repository = { find: (id) => (existsSync(id) ? { id } : undefined) };`,
    ``,
  ].join('\n'),
  [`${root}/features/alpha/api/handler.ts`]: [
    `import { findValid } from '../application/use-case.js';`,
    `import type { Repository } from '../application/ports/repository.js';`,
    `export const handle = (repository: Repository, id: string) => findValid(repository, id) ?? null;`,
    ``,
  ].join('\n'),
  [`${root}/features/alpha/feature.ts`]: [
    `import { fileRepository } from './infrastructure/repository.js';`,
    `import { handle } from './api/handler.js';`,
    `export const alpha = (id: string) => handle(fileRepository, id);`,
    ``,
  ].join('\n'),
  [`${root}/features/alpha/index.ts`]: `export { alpha } from './feature.js';\n`,

  [`${root}/features/beta/infrastructure/alpha-adapter.ts`]:
    `import { alpha } from '../../alpha/index.js';\nexport const lookup = (id: string) => alpha(id);\n`,
  [`${root}/features/beta/index.ts`]: `export { lookup } from './infrastructure/alpha-adapter.js';\n`,

  [`${root}/shared/kernel.ts`]: `export const kernelVersion = 1;\n`,
  [`${root}/shared/cycle-a.ts`]: `import { b } from './cycle-b.js';\nexport const a = () => b;\n`,
  [`${root}/shared/cycle-b.ts`]: `export const b = 1;\n`,

  [`${root}/main.ts`]:
    `import { alpha } from './features/alpha/index.js';\nimport { lookup } from './features/beta/index.js';\nexport const run = () => [alpha('a'), lookup('b')];\n`,
};

/**
 * Projeto mínimo com a mesma forma do repositório (features com as camadas
 * domain, application, infrastructure e api) e nenhuma violação. Cada cenário
 * do teste acrescenta um único import proibido.
 */
export const cleanProject: Record<string, string> = baseFiles;

export interface Violation {
  readonly rule: string;
  readonly file: string;
  readonly content: string;
}

/** Uma violação artificial por regra do .dependency-cruiser.cjs. */
export const violations: Violation[] = [
  {
    rule: 'domain-nao-depende-de-camadas-externas',
    file: `${root}/features/alpha/domain/leak.ts`,
    content: `import { findValid } from '../application/use-case.js';\nexport const leak = findValid;\n`,
  },
  {
    rule: 'domain-autocontido',
    file: `${root}/features/alpha/domain/leak.ts`,
    content: `import { randomUUID } from 'node:crypto';\nexport const newId = () => randomUUID();\n`,
  },
  {
    rule: 'application-nao-depende-de-infra-ou-api',
    file: `${root}/features/alpha/application/leak.ts`,
    content: `import { fileRepository } from '../infrastructure/repository.js';\nexport const leak = fileRepository;\n`,
  },
  {
    rule: 'application-so-conhece-domain',
    file: `${root}/features/alpha/application/leak.ts`,
    content: `import { readFileSync } from 'node:fs';\nexport const leak = readFileSync;\n`,
  },
  {
    rule: 'api-nao-depende-de-infrastructure',
    file: `${root}/features/alpha/api/leak.ts`,
    content: `import { fileRepository } from '../infrastructure/repository.js';\nexport const leak = fileRepository;\n`,
  },
  {
    rule: 'feature-nao-importa-internals-de-outra',
    file: `${root}/features/beta/infrastructure/leak.ts`,
    content: `import type { Entity } from '../../alpha/domain/entity.js';\nexport type Leak = Entity;\n`,
  },
  {
    rule: 'fora-das-features-so-index-publico',
    file: `${root}/leak.ts`,
    content: `import { fileRepository } from './features/alpha/infrastructure/repository.js';\nexport const leak = fileRepository;\n`,
  },
  {
    rule: 'shared-nao-importa-features',
    file: `${root}/shared/leak.ts`,
    content: `import { alpha } from '../features/alpha/index.js';\nexport const leak = alpha;\n`,
  },
  {
    rule: 'sem-ciclos',
    file: `${root}/shared/cycle-b.ts`,
    content: `import { a } from './cycle-a.js';\nexport const b = a;\n`,
  },
  {
    rule: 'sem-import-nao-resolvido',
    file: `${root}/shared/broken.ts`,
    content: `import { missing } from './does-not-exist.js';\nexport const broken = missing;\n`,
  },
];

export function writeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'argos-arch-'));
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}
