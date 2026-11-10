# argos-bff

Backend for Frontend do Argos. É a única porta de entrada do front: agrega dados de três fontes, repassa o CRUD aos microserviços e chama a Azure Function de pontuação de fraude.

Projeto da disciplina de Arquitetura de Software com Cloud (PUCPR).

## Equipe

- Arthur Sornas
- Eduardo Martins
- Guilherme Marafon
- Victor Ribeiro

## Tecnologias

- Node 22 e TypeScript
- Express 5 (API REST) e `fetch` nativo para chamar os destinos
- Swagger UI (OpenAPI 3) em `/docs`
- `cors` (CORS configurável por variável de ambiente)
- Vitest (testes unitários e de API, com servidores HTTP falsos reais) e dependency-cruiser (testes e checagem de arquitetura)
- Docker, com build em múltiplos estágios

## Destinos

| Destino | O que é | Porta local padrão |
|---|---|---|
| Microserviço de regras | CRUD de regras, MongoDB | 3001 |
| Microserviço de decisões | histórico de decisões e revisões, Azure SQL | 3002 |
| Azure Function de pontuação | `POST /fraud-score` (chave de função) e `GET /ready` | 7071 |

O BFF roda na porta 3000.

## Arquitetura

Clean Architecture com Vertical Slice: o código é dividido por feature, e cada feature tem as camadas `domain`, `application`, `infrastructure` e `api`.

```
src/
  main.ts                          inicialização do servidor
  bootstrap/
    config.ts                      leitura e validação das variáveis de ambiente
    app.ts                         monta as features a partir da configuração
    server.ts                      app Express, CORS, Swagger, 404 e tratamento de erros
    openapi.ts                     schemas comuns e junção dos paths das features
  shared/                          núcleo comum: cliente HTTP com timeout, helpers de resposta
  features/
    aggregated-data/               GET /aggregated-data
      domain/                      tipos do agregado e SourceFailure
      application/                 caso de uso e portas RulesGateway, DecisionsGateway, ScoringGateway
      infrastructure/              clientes HTTP dos três destinos (fetch)
      api/                         router e documentação OpenAPI
      feature.ts                   composição da feature
      index.ts                     API pública da feature
    rules-proxy/                   /rules e /rules/:id
    decisions-proxy/               /decisions, /decisions/metrics, /decisions/:id,
                                   /decisions/:id/reviews e /reviews/:id
    score-transaction/             POST /score
    health-check/                  GET /health
      (cada feature: domain/, application/, api/, feature.ts, index.ts e, quando chama algo fora, infrastructure/)
tests/                             espelha src/ e inclui tests/architecture
```

Regras de dependência, verificadas pelo dependency-cruiser (`.dependency-cruiser.cjs`):

- `domain` não importa nada fora do próprio `domain`.
- `application` importa só `domain` e a própria `application`; não conhece `fetch` nem Express.
- `api` não importa `infrastructure`; quem liga os adapters concretos é o `feature.ts`.
- Uma feature só enxerga outra pelo `index.ts`; `main.ts` e `bootstrap` entram nas features só pelo `index.ts`.
- `shared` não conhece nenhuma feature.
- Sem ciclos e sem imports não resolvidos.

Os testes em `tests/architecture` criam projetos de fixture com uma violação artificial por regra e conferem que `depcruise` falha apontando exatamente aquela regra.

## Endpoints

A documentação interativa, com exemplos, fica em `/docs` (JSON em `/docs/openapi.json`).

| Método e rota | O que faz |
|---|---|
| `GET /aggregated-data` | Regras, métricas e decisões recentes e prontidão da Function num único response |
| `GET /rules`, `POST /rules` | Lista (`enabled`, `type`, `page`) e cria regra |
| `GET /rules/:id`, `PUT /rules/:id`, `DELETE /rules/:id` | Busca, atualiza e remove regra |
| `GET /decisions` | Lista decisões (`status`, `from`, `to`, `minScore`, `maxScore`, `page`) |
| `GET /decisions/metrics` | Volume, taxas e total marcado como incorreto |
| `GET /decisions/:id` | Decisão com transação, vetor e vizinhos |
| `GET /decisions/:id/reviews`, `POST /decisions/:id/reviews` | Lista e cria revisões da decisão |
| `PUT /reviews/:id`, `DELETE /reviews/:id` | Altera e remove revisão |
| `POST /score` | Pontua uma transação na Function |
| `GET /health` | Liveness do BFF (não consulta os destinos) |

### `GET /aggregated-data`

Chama as três fontes em paralelo (`Promise.allSettled`), cada uma com timeout próprio (`UPSTREAM_TIMEOUT_MS`, via `AbortSignal`):

- regras: `GET /rules` e `GET /rules?enabled=true` (total, total de ativas e até 5 regras);
- decisões: `GET /decisions/metrics` e `GET /decisions` (métricas e até 5 decisões recentes);
- pontuação: só `GET /ready` da Function. A rota de pontuação não é chamada aqui, porque ela publica evento e grava decisão.

```json
{
  "generatedAt": "2026-11-09T14:30:00.123Z",
  "sources": {
    "rules": { "status": "ok", "latencyMs": 41 },
    "decisions": { "status": "error", "latencyMs": 5001, "error": "upstream_timeout" },
    "scoring": { "status": "ok", "latencyMs": 12 }
  },
  "rules": { "total": 4, "enabled": 3, "items": [] },
  "decisions": null,
  "scoring": { "status": "ready", "index": { "state": "ready", "vectorCount": 100000, "version": "v1", "loadedAt": "...", "loadDurationMs": 4210, "failureReason": null } }
}
```

- Responde `200` quando pelo menos uma fonte respondeu e `502` só quando todas falharam, com o mesmo formato de corpo.
- Uma fonte que falha tem `status: "error"` e o bloco dela vem `null`.
- Códigos de `error`: `upstream_unavailable`, `upstream_timeout`, `upstream_status_<código>`, `upstream_invalid_response`, `scoring_not_ready`.
- `scoring_not_ready`: a Function respondeu `503` no `/ready` (índice ainda carregando). Conta como erro da fonte, mas os dados do `/ready` vêm em `scoring`.

### Proxy

As rotas de regras, decisões e revisões repassam método, query e corpo JSON ao microserviço e devolvem o status e o corpo dele, incluindo `4xx` e `5xx`. Do cliente só seguem `content-type` e `accept`; `authorization`, cookies e demais headers não são repassados. Do destino voltam só `content-type`, `location` (reescrito para caminho relativo) e `retry-after`. Parâmetros `:id` aceitam apenas letras, números, `_` e `-`; outro formato devolve `400`.

Falhas ao chamar o destino:

| Situação | Resposta |
|---|---|
| Rede (conexão recusada, DNS) | `502 { "error": "upstream_unavailable", "upstream": "rules" \| "decisions" \| "scoring" }` |
| Timeout | `504 { "error": "upstream_timeout", "upstream": "..." }` |

### `POST /score`

Exige um objeto com `id` (texto) e `transaction`, `customer`, `merchant` e `terminal` (objetos); caso contrário responde `400` com `invalid_fields`. Em seguida repassa o corpo para `POST /fraud-score` da Function com o header `x-functions-key` vindo de `FUNCTION_KEY`, e devolve a resposta dela com o mesmo status (`200`, `400` da validação completa, `503` com `Retry-After` etc.). A chave nunca aparece em resposta, log ou Swagger, e não é enviada aos microserviços. Cada chamada gera um evento e grava uma decisão no histórico.

## Variáveis de ambiente

Modelo em `.env.example`. Nenhuma credencial é versionada; `.env` está no `.gitignore`. As URLs são obrigatórias: sem elas o serviço não sobe e informa quais faltam.

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3000` | porta do BFF |
| `RULES_SERVICE_URL` | obrigatória | URL base do microserviço de regras |
| `DECISIONS_SERVICE_URL` | obrigatória | URL base do microserviço de decisões |
| `FUNCTION_URL` | obrigatória | URL base da Function (sem prefixo `/api`, a Function usa `routePrefix` vazio) |
| `FUNCTION_KEY` | vazio | chave de função, enviada em `x-functions-key`. Sem valor, o header não é enviado (adequado só à Function local) |
| `UPSTREAM_TIMEOUT_MS` | `5000` | tempo limite por chamada a cada destino |
| `CORS_ORIGIN` | vazio | origens permitidas, separadas por vírgula. Sem valor, o CORS fica desligado |

## Como rodar

Pré-requisito: Node 22.12 ou superior.

```bash
npm install
cp .env.example .env      # ajuste as URLs e, se for o caso, a FUNCTION_KEY
npm run dev               # compila e sobe em http://localhost:3000
```

Swagger em `http://localhost:3000/docs`.

Scripts: `npm run build`, `npm start`, `npm test` (Vitest), `npm run check:arch` (dependency-cruiser), `npm run typecheck` e `npm run verify` (os três de verificação em sequência).

## Docker

```bash
docker build -t argos-bff .
docker run --rm -p 3000:3000 --env-file .env argos-bff
```

A imagem usa build em dois estágios, roda como usuário `node` e tem `HEALTHCHECK` em `GET /health`. Dentro de um contêiner, `localhost` aponta para o próprio contêiner: use os hostnames ou URLs reais dos destinos nas variáveis.

## Testes

```bash
npm test
```

- Casos de uso com fakes das portas (agregado com 0, 1, 2 e 3 fontes falhando, validação do `/score`).
- Clientes HTTP e API contra servidores HTTP falsos reais em porta efêmera: destino ok, 404, 500, lento (timeout) e fora do ar.
- Proxy: status, corpo, `Location`, query e ausência de headers sensíveis.
- A chave da Function chega só à Function e não vaza em respostas de erro nem no Swagger.
- Configuração das variáveis e CORS.
- Arquitetura: `tests/architecture` (dependency-cruiser).
