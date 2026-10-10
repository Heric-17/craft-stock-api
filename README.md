# CraftStock API

Gestão de estoque fracionado, precificação e projeção de capacidade de produção.

## Requisitos

- Node.js 22+ (o Prisma 7 exige 20.19+)
- Docker (para o PostgreSQL de desenvolvimento e para os testes e2e via Testcontainers)

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

A resposta traz `accessToken` (15 min), sua validade em segundos e o usuário. **O refresh
token não vem no corpo**: ele é gravado num cookie `HttpOnly` que o JavaScript da página
não consegue ler, restrito ao path das rotas de auth, com 30 dias de validade e
rotacionado a cada `POST /auth/refresh`. Por isso o `curl` acima precisa de `-c` para
guardar o cookie se você quiser testar o refresh na mão:

```bash
curl -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@craftstock.dev","password":"senha-forte-123"}'

curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/auth/refresh
```

Rotas de negócio continuam usando o access token, e **não dependem de cookie**:

```bash
curl http://localhost:3000/materials -H "Authorization: Bearer <accessToken>"
```

O contrato completo da sessão — atributos do cookie, por que cada instalação exige
domínio próprio, e por que não há token anti-CSRF — está em
[docs/auth-contract.md](docs/auth-contract.md). A forma das respostas de erro e a tabela
de códigos estão em [docs/api-contract.md](docs/api-contract.md).

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
| `npm run test:e2e` | Testes e2e. Sobe e migra um Postgres descartável via Testcontainers (exige Docker rodando) — não depende do `docker compose up` acima |
| `npm run test:e2e:cov` | Testes e2e com cobertura |
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

**Cliente de navegador (SPA)**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `CORS_ORIGINS` | **em produção** | vazia | Origens do frontend, separadas por vírgula. Curinga é recusado. Vazia em desenvolvimento cai no servidor do Vite |
| `PUBLIC_BASE_URL` | **em produção** | vazia | Base absoluta desta API; é contra ela que a URL de imagem local é montada. Vazia em desenvolvimento cai em `http://localhost:<PORT>` |

As duas **impedem a inicialização** se faltarem em produção. É proposital: uma API sem
`CORS_ORIGINS` responde a `curl` e falha em todo navegador, sem nada no log do servidor
explicando. Ver [docs/DEPLOY.md](docs/DEPLOY.md).

**Autenticação**

| Variável | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- |
| `JWT_SECRET` | sim | — | Chave HMAC dos JWT de sessão, mínimo 32 caracteres |
| `JWT_EXPIRES_IN_SECONDS` | não | `900` | Validade do access token |
| `REFRESH_TOKEN_EXPIRES_IN_SECONDS` | não | `2592000` | Validade do refresh token (30 dias), e `Max-Age` do cookie |
| `AUTH_COOKIE_SECURE` | não | `true` | `Secure` no cookie de sessão. `false` só em desenvolvimento — o Safari descarta cookie `Secure` em `http://localhost`. Recusado em produção |
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
| `S3_PUBLIC_BASE_URL` | só com `S3` | — | Base pública de leitura do bucket. Nunca montada em código: a instalação pode estar atrás de CDN ou domínio próprio |
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

## Implantação

Processo de publicação independente de provedor: funciona do mesmo jeito num VPS com
`docker run`, em `docker compose`, ou em qualquer plataforma de contêiner gerenciada —
sem nenhum arquivo de configuração específico de provedor neste repositório.

Esta seção cobre o contêiner, as migrations e a verificação. O que só aparece quando um
navegador passa a consumir a API — domínio, CORS, e a política do bucket de imagens —
está em [docs/DEPLOY.md](docs/DEPLOY.md).

### Pré-requisitos

- Sem contêiner: Node.js 22+ (ver [package.json](package.json), `engines.node`).
- Com contêiner (recomendado): só o Docker — a imagem já traz o Node correto.
- PostgreSQL acessível, mesma major usada em desenvolvimento (18) — ver
  [docker-compose.yml](docker-compose.yml).
- Todas as variáveis de ambiente obrigatórias da seção [Ambiente](#ambiente)
  definidas para a instalação. Só `DATABASE_URL` e `JWT_SECRET` não têm padrão —
  nenhum dos dois pode vir com valor de desenvolvimento.

### Build e execução

Sem contêiner:

```bash
npm ci
npm run build
npm run prisma:deploy   # ver a regra de ordem na próxima seção — isto tem que
                         # rodar e terminar com sucesso ANTES da linha abaixo
npm run start:prod      # node dist/main.js
```

Com contêiner — build reprodutível, independente da máquina que constrói:

```bash
docker build -t craftstock-api .
docker run -d --name craftstock-api \
  --env-file .env \
  -p 3000:3000 \
  craftstock-api
```

O [Dockerfile](Dockerfile) é multi-estágio (instala e gera o client Prisma, compila,
e só então monta a imagem final), roda como usuário não privilegiado (`node`, do
próprio runtime oficial) e não assume nenhum provedor.

### Migrations: quando e como são aplicadas

Regra inegociável: **o esquema é atualizado antes do código novo entrar em serviço,
nunca depois.** Esquema atrasado atrás de código novo faz a falha aparecer como erro
de consulta em tempo de execução, não como falha de publicação — exatamente o problema
que este processo existe para fechar.

Três opções foram avaliadas:

- **Comando manual documentado, sem automação** — descartada como único mecanismo:
  é a lacuna que motivou esta tarefa. Depende de alguém lembrar de rodar o comando a
  cada publicação, e o esquecimento só aparece depois, como erro de consulta.
- **Etapa separada de publicação** (um job/"release command" que a plataforma dispara
  antes de trocar o contêiner) — descartada como mecanismo PRINCIPAL porque depende de
  um recurso que varia por provedor, o acoplamento que este documento evita (seção
  "Fora de escopo" do planejamento desta tarefa). Continua disponível como alternativa
  manual, abaixo, para quem preferir inspecionar a migration antes de deixá-la rodar.
- **Escolhida: migration dentro do próprio entrypoint do contêiner**, executada antes
  do processo da API assumir a porta. Funciona identicamente em qualquer plataforma
  capaz de rodar a imagem, não depende de nenhum recurso específico de provedor, e é
  impossível esquecer — acontece em toda subida de contêiner, sempre.

Na prática: o `ENTRYPOINT` do [Dockerfile](Dockerfile) roda `npm run prisma:deploy`
(`prisma migrate deploy` — só aplica migrations já versionadas, nunca cria uma) e,
SOMENTE se ela terminar com sucesso, troca para o processo da API
(`exec node dist/main.js`).

Alternativa manual, fora do caminho automático, para quem quiser aplicar e inspecionar
antes de trocar o contêiner em execução:

```bash
docker run --rm --env-file .env craftstock-api npm run prisma:deploy
# só então reinicie/troque o contêiner da API
```

**Se a migration falhar**, o script do entrypoint usa `set -e`: a execução para antes
de iniciar a API, o contêiner termina com código de saída diferente de zero, e nenhuma
instância nova entra em serviço com esquema desatualizado ou parcialmente aplicado.
Verificado: uma credencial de banco inválida interrompe o contêiner nesse ponto, sem
nenhuma linha de log de inicialização da API.

**Se a migration tiver sucesso e o processo Node falhar ao iniciar depois** (bug na
aplicação, variável de ambiente ausente etc.): o esquema já avançou, mas a nova versão
do código não chegou a assumir tráfego. Como esta instalação é de contêiner único (seção
1 do CLAUDE.md — sem réplicas), o resultado é indisponibilidade até a causa ser
corrigida e uma imagem que funcione subir no lugar; não existe "voltar" o código sem
antes avaliar se o esquema já aplicado é compatível com a versão anterior (ver
Reversão, abaixo). Por isso toda migration deste projeto deve, quando possível, ser
aditiva — tolerável pela versão de código anterior durante a troca.

### Verificação após subir

```bash
curl -i http://SEU_HOST:3000/health
```

`GET /health` é checagem de vida (liveness), DELIBERADAMENTE sem tocar o banco — ver
[health.controller.ts](src/modules/health/presentation/health.controller.ts). Um `200`
prova que o processo Node está de pé, NÃO que o banco está acessível nem que o esquema
está em dia. A imagem também declara essa rota como `HEALTHCHECK` do Docker, então
`docker ps` já mostra `(healthy)`/`(unhealthy)` sem precisar do curl acima — mas, de
novo, só para o processo, não para o banco.

Para o esquema, confira separadamente, de onde `DATABASE_URL` da instalação for
alcançável:

```bash
npx prisma migrate status    # esperado: "Database schema is up to date!"
```

Como o entrypoint já faz a migration falhar a subida do contêiner (seção acima), um
contêiner em execução já é indício forte de que a migration passou — mas `migrate
status` é a única confirmação direta do estado do esquema.

### Reversão

Voltar o CÓDIGO é trocar o contêiner pela imagem da versão anterior (mantenha a tag
anterior disponível, ou reconstrua a partir do commit/tag anterior do git):

```bash
docker run -d --name craftstock-api --env-file .env -p 3000:3000 craftstock-api:<tag-anterior>
```

**Migration não se reverte sozinha.** `prisma migrate deploy` só aplica para frente;
voltar o código não desfaz nenhuma mudança de esquema já aplicada — o Prisma não tem
"migration de volta" automática. Se a migration que motivou o rollback for destrutiva
(`DROP COLUMN`, `DROP TABLE`, `NOT NULL` sem default em tabela populada, renomear
coluna), o código anterior pode já não ser compatível com o esquema atual: ele espera
uma coluna ou tabela que não existe mais.

Por isso, antes de aplicar uma migration destrutiva: gerar uma cópia de segurança
([scripts/backup/db-dump.sh](scripts/backup/db-dump.sh), procedimento completo em
[docs/RECOVERY.md](docs/RECOVERY.md)) e já ter decidido o caminho de volta — uma
migration nova que desfaça a mudança, ou restaurar a cópia feita antes da destrutiva.

### Nota operacional

Planos gratuitos de plataformas gerenciadas costumam hibernar o contêiner após
inatividade, o que atrasa a primeira requisição depois de um período ocioso.

## Estrutura

```
Dockerfile                      imagem de produção (multi-estágio, usuário não root,
                                entrypoint aplica a migration e só então inicia a API)
docs/api-contract.md            forma das respostas de erro, códigos e rotas de sessão
docs/auth-contract.md           transporte da sessão, cookie e decisões de segurança
docs/DEPLOY.md                  domínio, CORS e política do bucket de imagens
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
