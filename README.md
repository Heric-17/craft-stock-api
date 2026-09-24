# CraftStock API

Gestão de estoque fracionado, precificação e projeção de capacidade de produção.

## Requisitos

- Node.js 22+ (o Prisma 7 exige 20.19+)
- Docker (para o PostgreSQL de desenvolvimento)

## Começando

```bash
cp .env.example .env      # PRIMEIRO passo: o npm install depende dele
docker compose up -d      # sobe o PostgreSQL com volume persistente
npm install                 # instala e roda `prisma generate`
npm run prisma:migrate      # aplica as migrations e semeia o usuário padrão
npm run start:dev
```

> O `cp` vem antes do `npm install` de propósito. O `postinstall` roda
> `prisma generate`, que carrega o `prisma.config.ts`, que resolve
> `env("DATABASE_URL")`. Sem `.env`, a instalação falha — de forma explícita, que é
> o comportamento que este projeto quer.

`prisma migrate dev` roda o seed (`prisma/seed.ts`) automaticamente depois de aplicar as
migrations — é o que cria o primeiro usuário. Rodar de novo não duplica nada: o seed só
cria a conta se o e-mail ainda não existir. Para semear sem mexer nas migrations, `npm run
prisma:seed`.

A API sobe em `http://localhost:3000`. Verificação rápida:

```bash
curl -i http://localhost:3000/health
```

## Autenticação

Toda rota é protegida por padrão — as únicas exceções são `POST /auth/login`,
`POST /auth/refresh`, `POST /auth/logout` e `GET /health`. Não existe cadastro público:
como não há papéis neste sistema, qualquer usuário autenticado pode criar outro
(`POST /users`), e a primeira conta de uma instalação nova vem do seed, não da API.

O seed cria, por padrão:

| Campo | Valor |
| --- | --- |
| E-mail | `admin@craftstock.dev` |
| Senha | `senha-forte-123` |

Login:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@craftstock.dev","password":"senha-forte-123"}'
```

A resposta traz `accessToken` (curto, 15 min por padrão) e `refreshToken` (30 dias,
rotacionado a cada uso em `POST /auth/refresh`). Rotas de negócio usam o access token:

```bash
curl http://localhost:3000/materials -H "Authorization: Bearer <accessToken>"
```

Para mudar as credenciais do seed, defina `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` e/ou
`SEED_USER_NAME` no ambiente antes de rodar `prisma:migrate` ou `prisma:seed`.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run start:dev` | API em watch mode |
| `npm run build` | Compila para `dist/` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint (inclui a regra que proíbe Prisma fora de `infrastructure/`) |
| `npm run format` | Prettier |
| `npm run test` | Testes unitários |
| `npm run test:cov` | Testes unitários com cobertura |
| `npm run test:e2e` | Testes e2e (exige o banco no ar) |
| `npm run prisma:validate` | Valida `prisma/schema.prisma` |
| `npm run prisma:generate` | Regera o Prisma Client |
| `npm run prisma:migrate` | Cria/aplica migration de desenvolvimento (e roda o seed) |
| `npm run prisma:seed` | Roda só o seed, sem mexer em migrations |

## Ambiente

A aplicação **não sobe degradada**: o schema em [src/config/env.schema.ts](src/config/env.schema.ts)
é validado no bootstrap e qualquer variável obrigatória ausente ou inválida aborta a
inicialização.

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `DATABASE_URL` | sim | — | Connection string do PostgreSQL |
| `NODE_ENV` | não | `development` | `development` \| `test` \| `production` |
| `PORT` | não | `3000` | Porta HTTP |
| `LOG_LEVEL` | não | `info` | `error` \| `warn` \| `info` \| `debug` \| `verbose` |

## Estrutura

```
prisma.config.ts                configuração do CLI do Prisma (inclui DATABASE_URL e o seed)
prisma/schema.prisma            datasource, generator e os models
prisma/seed.ts                  cria o usuário padrão; roda após `migrate dev`/`reset`
src/
  config/                       schema de ambiente e acesso tipado
  modules/                      módulos de negócio (ver src/modules/README.md)
    health/
  shared/
    domain/errors/              DomainError — base pura das violações de regra
    infrastructure/logging/     logger JSON e contexto de requisição
    infrastructure/prisma/      PrismaService e PrismaModule
      generated/                Prisma Client gerado (fora do git)
    presentation/filters/       filtro global de exceções
    presentation/middleware/    correlation id
```

## Prisma 7

O Prisma 7 mudou três coisas que afetam a forma deste projeto:

1. **A connection string saiu do schema.** `prisma/schema.prisma` declara só o
   `provider`; a URL vive em [prisma.config.ts](prisma.config.ts), que é configuração de
   build (CLI). Em tempo de execução quem lê `DATABASE_URL` é o `EnvService` validado.
2. **O client é gerado dentro da árvore do projeto**, não mais em `node_modules`. O
   destino é `src/shared/infrastructure/prisma/generated/` — escolhido de propósito:
   assim qualquer import dele de fora de `infrastructure/` cai no guard do ESLint, do
   mesmo jeito que um import de `@prisma/client` cairia. O diretório é gerado pelo
   `postinstall` e está no `.gitignore`.
3. **O client exige um driver adapter.** O `PrismaService` monta o `PrismaPg` com a URL
   vinda do `EnvService`. Nada disso atravessa a fronteira de `infrastructure/`.

Uma consequência do adapter merece atenção: o driver `pg` abre conexão sob demanda, então
`$connect()` resolve com sucesso mesmo sem banco nenhum do outro lado. Por isso o
`PrismaService` dispara um `SELECT 1` no `onModuleInit` — sem ele a API subiria degradada,
anunciando uma conexão que não existe. Pelo mesmo motivo o healthcheck do
`docker-compose.yml` executa uma query em vez de `pg_isready`, que reporta *healthy*
mesmo quando o role ou o banco não existem.

## Dependências fixadas por override

O `package.json` tem um bloco `overrides` com três entradas, todas para zerar advisories
de pacotes transitivos que não dependem de nós:

| Pacote | Por quê |
| --- | --- |
| `multer` | O `@nestjs/platform-express` fixa a 2.2.0, que tem quatro advisories de DoS |
| `mysql2` | Vem no CLI do Prisma (adapters de todos os bancos); este projeto usa Postgres |
| `deepmerge-ts` | Transitiva do `@prisma/config`, que ainda pede a major 7 |

Cada override foi verificado contra o caminho real: `prisma generate`, `prisma validate`,
`prisma migrate status`, build e suíte completa. Podem ser removidos conforme os pacotes
de origem atualizarem.

## Observabilidade

Toda linha de log é um JSON com `timestamp`, `level`, `message`, `context` e
`correlationId`. O correlation id vem do header `x-correlation-id` quando o cliente
envia, e é gerado quando não; ele volta no header da resposta e aparece no corpo de
qualquer erro.
