# CraftStock API

Gestão de estoque fracionado, precificação e projeção de capacidade de produção.

## Requisitos

- Node.js 22+ (o Prisma 7 exige 20.19+)
- Docker (para o PostgreSQL de desenvolvimento)

## Começando

```bash
cp .env.example .env      # antes do install: o postinstall roda `prisma generate`,
                          # que precisa de DATABASE_URL
docker compose up -d      # sobe o PostgreSQL com volume persistente
npm install                 # instala e roda `prisma generate`
npm run prisma:migrate      # aplica as migrations e semeia o usuário padrão
npm run start:dev
```

Rodar `prisma:migrate` de novo não duplica o usuário semeado. Para só semear, sem tocar
migrations: `npm run prisma:seed`.

A API sobe em `http://localhost:3000`:

```bash
curl -i http://localhost:3000/health
```

## Autenticação

Toda rota é protegida por padrão, exceto `POST /auth/login`, `POST /auth/refresh`,
`POST /auth/logout` e `GET /health`. Não há cadastro público: qualquer usuário
autenticado cria outro (`POST /users`); a primeira conta vem do seed.

| Campo | Valor |
| --- | --- |
| E-mail | `admin@craftstock.dev` |
| Senha | `senha-forte-123` |

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@craftstock.dev","password":"senha-forte-123"}'
```

A resposta traz `accessToken` (15 min) e `refreshToken` (30 dias, rotacionado a cada uso
em `POST /auth/refresh`). Rotas de negócio usam o access token:

```bash
curl http://localhost:3000/materials -H "Authorization: Bearer <accessToken>"
```

Para mudar as credenciais do seed: `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`,
`SEED_USER_NAME`, antes de `prisma:migrate` ou `prisma:seed`.

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
| `npm run prisma:deploy` | Aplica as migrations já versionadas, sem criar nenhuma (CI e produção) |
| `npm run prisma:seed` | Roda só o seed, sem mexer em migrations |

## Ambiente

O schema em [src/config/env.schema.ts](src/config/env.schema.ts) é validado no bootstrap;
variável obrigatória ausente ou inválida aborta a inicialização. Só `DATABASE_URL` e
`JWT_SECRET` não têm padrão. As demais têm padrão, ou passam a ser exigidas quando a
opção que depende delas é escolhida.

**Aplicação e banco**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `DATABASE_URL` | sim | — | Connection string do PostgreSQL (`postgresql://...`) |
| `NODE_ENV` | não | `development` | `development` \| `test` \| `production` |
| `PORT` | não | `3000` | Porta HTTP |
| `LOG_LEVEL` | não | `info` | `error` \| `warn` \| `info` \| `debug` \| `verbose` |
| `POSTGRES_PORT` | não | `5432` | Porta publicada pelo docker-compose. Só o compose lê |

**Autenticação**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `JWT_SECRET` | sim | — | Chave HMAC dos JWT de sessão, mínimo 32 caracteres |
| `JWT_EXPIRES_IN_SECONDS` | não | `900` | Validade do access token |
| `REFRESH_TOKEN_EXPIRES_IN_SECONDS` | não | `2592000` | Validade do refresh token (30 dias) |
| `ARGON2_TIME_COST` | não | `3` | Iterações do argon2, de 1 a 10 |

**Importação de NFC-e**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `NFCE_PROVIDER` | não | `AUTO` | `AUTO` (escolhe o provider pela UF da captura) \| `OFFICIAL_WEBSERVICE` |
| `NFCE_IMPORT_MAX_ATTEMPTS` | não | `3` | Tentativas por captura, de 1 a 10 |
| `NFCE_IMPORT_RETRY_DELAY_MS` | não | `1000` | Base da espera progressiva entre tentativas |
| `NFCE_CANARY_URLS` | não | vazia | URLs das notas de referência do canário (seção abaixo). Vazia desliga |

**Armazenamento de imagens**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `STORAGE_PROVIDER` | não | `LOCAL_DISK` | `LOCAL_DISK` \| `S3` |
| `UPLOADS_DIR` | não | `./uploads` | Raiz do disco local; sem efeito com `S3` |
| `MAX_IMAGE_UPLOAD_SIZE_BYTES` | não | `5242880` | Teto do upload em bytes |
| `S3_BUCKET_NAME` | só com `S3` | — | Bucket |
| `S3_REGION` | não | `us-east-1` | Região do bucket |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | só com `S3` | — | Lidas pela cadeia padrão do SDK da AWS, não pelo `EnvService` |

**Observabilidade e retenção**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `AUDIT_LOG_RETENTION_DAYS` | não | `180` | Janela de `AuditLog` |
| `REQUEST_LOG_RETENTION_DAYS` | não | `30` | Janela de `RequestLog`, e com ela os campos de falha |
| `NOTIFICATION_SENDER` | não | `CONSOLE` | `CONSOLE` (log) \| `SMTP` (e-mail) |
| `ERROR_ALERT_THROTTLE_SECONDS` | não | `300` | Silêncio por tipo de erro após um alerta; `0` desliga |
| `SMTP_HOST` | só com `SMTP` | — | Servidor SMTP |
| `SMTP_PORT` | não | `587` | Porta SMTP |
| `SMTP_SECURE` | não | `false` | `true` \| `false` |
| `SMTP_USER` / `SMTP_PASSWORD` | não | — | Credenciais, quando o servidor exige |
| `ALERT_EMAIL_FROM` | só com `SMTP` | — | Remetente |
| `ALERT_EMAIL_TO` | só com `SMTP` | — | Destinatário(s), separados por vírgula |

As variáveis de cópia de segurança (`BACKUP_DIR`, `PG_CLIENT_MODE`) são lidas pelos
scripts, não pela aplicação — ver [docs/RECOVERY.md](docs/RECOVERY.md).

## Estrutura

```
docs/RECOVERY.md                cópia de segurança e restauração do banco
scripts/backup/                scripts de dump e restore do PostgreSQL
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

- A connection string não está no schema: vive em [prisma.config.ts](prisma.config.ts)
  (CLI). Em runtime, quem lê `DATABASE_URL` é o `EnvService`.
- O client é gerado em `src/shared/infrastructure/prisma/generated/`, não em
  `node_modules` — fora do git, recriado pelo `postinstall`.
- O client exige um driver adapter, montado pelo `PrismaService`.

O driver `pg` abre conexão sob demanda: `$connect()` resolve mesmo sem banco do outro
lado. Por isso o `PrismaService` roda um `SELECT 1` no `onModuleInit`, e o healthcheck do
`docker-compose.yml` executa uma query em vez de `pg_isready`.

## Cópia de segurança

```bash
bash scripts/backup/db-dump.sh                                  # gera ./backups/<banco>-<data>.dump
bash scripts/backup/db-restore.sh backups/<arquivo>.dump --drop # restaura
```

Sem credencial nos scripts — ambos leem `DATABASE_URL`. Em produção a cópia roda sozinha
todo dia pelo [.github/workflows/backup.yml](.github/workflows/backup.yml), cifrada.
Procedimento completo, agendamento e o que não está coberto: [docs/RECOVERY.md](docs/RECOVERY.md).

## Dependências fixadas por override

| Pacote | Por quê |
| --- | --- |
| `multer` | O `@nestjs/platform-express` fixa a 2.2.0, que tem quatro advisories de DoS |
| `mysql2` | Vem no CLI do Prisma (adapters de todos os bancos); este projeto usa Postgres |
| `deepmerge-ts` | Transitiva do `@prisma/config`, que ainda pede a major 7 |

Removíveis conforme os pacotes de origem atualizarem.

## Observabilidade

Log estruturado em JSON (`timestamp`, `level`, `message`, `context`, `correlationId`),
sem senha, hash, token ou CPF. O correlation id vem do header `x-correlation-id` ou é
gerado; volta no header da resposta e no corpo de erro.

### Registro de falha

Não há tabela separada de erro: `RequestLog` (uma linha por requisição mutante) guarda o
motivo, preenchido só quando houve falha:

| Campo | Conteúdo |
| --- | --- |
| `errorType` | classe da exceção |
| `errorMessage` | mensagem, redigida |
| `stackTrace` | rastro técnico, redigido |
| `errorContext` | propriedades escalares da exceção e violações de validação |

Mesma retenção de `RequestLog` (`REQUEST_LOG_RETENTION_DAYS`). Duas limitações
conhecidas: só requisição mutante grava linha (um 500 em `GET` só existe no log
estruturado); e o throttle de alerta (`ERROR_ALERT_THROTTLE_SECONDS`) vive em memória do
processo, zerando a cada restart.

### Investigação

```
GET /audit-log/investigate?errorId=<errorId>
```

Aceita também `correlationId` ou `transactionId`. Devolve a linha de `RequestLog` e, em
ordem, toda escrita feita pela mesma requisição.

### Alertas operacionais

Erro não tratado dispara alerta por `NotificationSender` (`CONSOLE` ou `SMTP`), limitado
por tipo de erro — variáveis na tabela de Ambiente, acima.

### Canário da extração de NFC-e

Job diário relê notas de referência fixadas em
[pinned-reference-invoices.ts](src/modules/invoices/domain/canary/pinned-reference-invoices.ts)
e compara nome do estabelecimento, total e quantidade de itens, para detectar quebra do
scraping por mudança no portal da SEFAZ. URLs em `NFCE_CANARY_URLS`; vazio desliga.

Alerta só dispara quando **todas** as notas de referência falham — por isso configure
duas ou três, de datas diferentes.
