const FEATURE = 'src/features/[^/]+';
const LAYER = '(domain|application|infrastructure|api)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-nao-depende-de-camadas-externas',
      comment: 'domain não importa application, infrastructure nem api.',
      severity: 'error',
      from: { path: `^${FEATURE}/domain/` },
      to: { path: `^${FEATURE}/(application|infrastructure|api)/` },
    },
    {
      name: 'domain-autocontido',
      comment: 'domain só importa arquivos do próprio domain: nada de pacotes npm, módulos do Node ou outras features.',
      severity: 'error',
      from: { path: `^(${FEATURE})/domain/` },
      to: { pathNot: [`^$1/domain/`, `^${FEATURE}/(application|infrastructure|api)/`] },
    },
    {
      name: 'application-nao-depende-de-infra-ou-api',
      comment: 'application não importa infrastructure nem api.',
      severity: 'error',
      from: { path: `^${FEATURE}/application/` },
      to: { path: `^${FEATURE}/(infrastructure|api)/` },
    },
    {
      name: 'application-so-conhece-domain',
      comment: 'application só importa o domain e a própria application da mesma feature; SDKs ficam na infrastructure.',
      severity: 'error',
      from: { path: `^(${FEATURE})/application/` },
      to: {
        pathNot: [`^$1/(domain|application)/`, `^${FEATURE}/(infrastructure|api)/`],
      },
    },
    {
      name: 'api-nao-depende-de-infrastructure',
      comment: 'api só chama casos de uso; a montagem com adapters concretos fica no feature.ts.',
      severity: 'error',
      from: { path: `^${FEATURE}/api/` },
      to: { path: `^${FEATURE}/infrastructure/` },
    },
    {
      name: 'feature-nao-importa-internals-de-outra',
      comment: 'uma feature só enxerga outra pelo index.ts público.',
      severity: 'error',
      from: { path: '^(src/features)/([^/]+)/' },
      to: { path: `^$1/[^/]+/${LAYER}/`, pathNot: '^$1/$2/' },
    },
    {
      name: 'fora-das-features-so-index-publico',
      comment: 'bootstrap e main.ts importam features apenas pelo index.ts.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/features/' },
      to: { path: `^${FEATURE}/(${LAYER}/|feature\\.ts$)` },
    },
    {
      name: 'shared-nao-importa-features',
      comment: 'src/shared é o núcleo comum das features e não conhece nenhuma delas.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sem-import-nao-resolvido',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)node_modules/|^dist/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
