# Recuperação do banco de dados

Procedimento de cópia de segurança e de restauração do PostgreSQL do CraftStock.

Duas ferramentas, ambas versionadas no repositório:

| Script | O que faz |
| --- | --- |
| [scripts/backup/db-dump.sh](../scripts/backup/db-dump.sh) | Gera um arquivo de cópia do banco |
| [scripts/backup/db-restore.sh](../scripts/backup/db-restore.sh) | Restaura um arquivo de cópia em um banco |

Nenhum dos dois contém credencial. Os dois leem `DATABASE_URL` — do ambiente, ou do
`.env`, que está fora do git. A senha nunca vai para a linha de comando: viaja como
variável de ambiente `PGPASSWORD`, invisível na lista de processos dos outros usuários.

---

## O que está coberto e o que não está

**Coberto.** Tudo que vive no banco PostgreSQL: schema, dados, índices, constraints,
sequências e o histórico de migrations do Prisma (`_prisma_migrations`). Restaurar o
arquivo em um banco vazio devolve a instalação inteira do ponto de vista da aplicação.

**Não coberto, e cada um com seu próprio ciclo:**

- **Imagens enviadas** (`Material` e `CompositeProduct`). Em desenvolvimento ficam em
  `./uploads` (`STORAGE_PROVIDER=LOCAL_DISK`); em produção vão para armazenamento de
  objetos (`STORAGE_PROVIDER=S3`), que tem versionamento e ciclo de vida próprios,
  configurados no bucket e não aqui. O banco guarda só a referência: restaurar o banco
  sem restaurar as imagens devolve registros cujas imagens não abrem.
- **O arquivo `.env`.** `JWT_SECRET`, credenciais de SMTP e chaves de S3 não estão no
  banco e não estão no repositório. Sem eles a aplicação não sobe, e um `JWT_SECRET`
  diferente invalida todo access token em circulação.
- **O log estruturado** emitido pelo processo. `ErrorLog` e `RequestLog` estão no banco
  e entram na cópia; a saída de log em si é do ambiente de execução.

**O arquivo de cópia é dado sensível.** Ele contém hash de senha e refresh token de
todos os usuários. Trate-o com o mesmo cuidado do `.env`: nunca versionado, nunca
anexado a ticket, nunca em pasta compartilhada aberta. `backups/` está no `.gitignore`. A cópia gerada pelo agendamento fica em artefato do
GitHub Actions, que herda a visibilidade do repositório — a ressalva está registrada na
seção do agendamento.

---

## Pré-requisitos

- O banco no ar (`docker compose up -d`).
- Um shell POSIX. No Windows, o **Git Bash** — não o `bash.exe` do WSL, que enxerga
  outro sistema de arquivos e outro Docker.
- Cliente do PostgreSQL. Não precisa estar instalado na máquina: por padrão os scripts
  usam o que já existe dentro do container do compose.

### `PG_CLIENT_MODE`

| Valor | Comportamento |
| --- | --- |
| `auto` (padrão) | Usa `psql`/`pg_dump`/`pg_restore` do host quando existem; cai para o container do compose quando não |
| `local` | Força o cliente do host |
| `docker` | Força o cliente do container |

O cliente não pode ser mais antigo que o servidor: `pg_dump` se recusa a copiar um
servidor mais novo que ele. É por isso que o padrão prefere o container quando não há
cliente no host — lá o cliente é exatamente da versão do servidor.

---

## Gerar uma cópia

```bash
bash scripts/backup/db-dump.sh
```

Escreve em `${BACKUP_DIR:-./backups}/<banco>-<AAAAMMDD-HHMMSS>.dump`. Opções:

```bash
bash scripts/backup/db-dump.sh -o /caminho/craftstock.dump   # destino explícito
bash scripts/backup/db-dump.sh -d outro_banco                # outro banco
bash scripts/backup/db-dump.sh --quiet                       # sem a contagem de linhas
```

O formato é o `custom` do `pg_dump` (`-Fc`): comprimido, e o único que o `pg_restore`
restaura seletivamente.

Duas garantias embutidas no script:

- o arquivo é escrito com sufixo `.partial` e só é renomeado depois que o `pg_dump`
  termina limpo. Uma cópia interrompida não deixa para trás um arquivo com cara de
  cópia boa — arquivo que só se descobre inútil no dia em que é necessário;
- o índice do arquivo é lido de volta (`pg_restore --list`) antes do término, o que
  prova que ele não está truncado.

Ao final o script imprime a contagem exata de linhas de cada tabela da origem. **Guarde
essa saída**: é com ela que a restauração é conferida.

---

## Agendamento automático (GitHub Actions)

Workflow: [.github/workflows/backup.yml](../.github/workflows/backup.yml)

| Item | Valor |
| --- | --- |
| Periodicidade | diária |
| Horário | **03:00 em Porto Alegre** = **06:00 UTC** (`cron: '0 6 * * *'`) |
| Gatilho manual | `workflow_dispatch`, na aba **Actions** do repositório |
| Origem | `DATABASE_URL`, secret do repositório |
| Cliente PostgreSQL | instalado no runner a partir do repositório apt do próprio PostgreSQL, major fixado em `17` |
| Destino | artefato da própria execução |
| Retenção do artefato | 30 dias |

**Por que no GitHub Actions.** O banco está na Neon e a aplicação na Render; não existe
VPS onde pendurar um cron de sistema operacional. O Actions fornece as duas coisas que
faltavam: a máquina temporária que roda o dump e o gatilho de horário. A alternativa
registrada antes — disparar de dentro do processo da aplicação, com o
`@nestjs/schedule` que o canário e a poda já usam — continua descartada pela mesma
razão: processo caído é dia sem cópia, justamente no dia em que ela importa.

**O cron é sempre em UTC.** O Actions não conhece fuso local e não aplica nenhum. A
expressão `'0 6 * * *'` lê-se como 06:00 e dispara às 03:00 em Porto Alegre, porque o
fuso é UTC-3 durante todo o ano (o Brasil encerrou o horário de verão em 2019). Mudar o
horário local significa mudar a expressão no workflow **e** esta tabela.

**Credenciais.** `DATABASE_URL` vem exclusivamente de secret do repositório, nunca de
arquivo versionado e nunca do código:

```bash
gh secret set DATABASE_URL          # cola a URL de conexão da Neon quando perguntar
```

Equivale a **Settings > Secrets and variables > Actions > New repository secret**. O
workflow falha com mensagem explícita quando o secret não existe, em vez de tentar
conectar sem credencial. A conexão sai do runner com `PGSSLMODE=require`: ela atravessa
a internet pública, e os scripts descartam a query string da URL ao parseá-la — um
`sslmode` escrito lá seria perdido.

**`PG_CLIENT_MODE=local` é obrigatório aqui.** Em `auto`, os scripts caem para o cliente
de dentro do container do compose, que não existe no runner. O workflow define a
variável que os scripts já leem; nenhuma linha de script foi alterada para isto.

**Falha visível.** O workflow não tem verificação própria de integridade: ele aproveita
as que o `db-dump.sh` já faz — arquivo `.partial` renomeado só após saída limpa, recusa
de dump vazio, e leitura do índice do arquivo para provar que não está truncado.
Qualquer uma delas sai com status diferente de zero, o que derruba o passo e a execução.
O upload ainda usa `if-no-files-found: error`, para que um dump que tenha "dado certo"
sem produzir arquivo não gere artefato vazio com cara de cópia. O GitHub notifica por
e-mail a falha de execução agendada, o que cobre o alerta sem ferramenta adicional:
cópia que para de rodar em silêncio é pior que cópia nenhuma, porque cria falsa sensação
de proteção.

**Limitação dos 60 dias.** O GitHub desativa automaticamente workflows agendados após 60
dias sem atividade no repositório. Um projeto que fica parado depois da entrega cai
exatamente nesse caso. A reativação é o disparo manual pelo `workflow_dispatch` — é para
isso que ele existe aqui, e não só por conveniência. Ao voltar a mexer no repositório,
confira em **Actions** se o agendamento está ativo.

### Destino: artefato da execução — decisão deliberada

O arquivo fica no artefato da própria execução (`actions/upload-artifact`), com retenção
declarada explicitamente no workflow. **É escolha consciente, com duas limitações
conhecidas:**

- **retenção limitada** — 30 dias, contra o artefato ser apagado pelo GitHub depois
  disso. Não há cópia mensal nem anual;
- **mesma casa do código** — a cópia fica hospedada no mesmo provedor do repositório,
  então uma única conta comprometida alcança os dois.

É destino adequado ao ciclo de vida deste projeto, que é trabalho acadêmico com
demonstração pontual, e não instalação em produção contínua. Migrar para armazenamento
de objetos externo é **troca de destino, não mudança de rotina**: o gatilho, a instalação
do cliente e o dump seguem iguais, e só o passo final do workflow muda.

**O artefato é dado sensível.** O dump contém hash de senha e refresh token de todos os
usuários, e **o artefato herda a visibilidade do repositório**: quem consegue ler o
repositório consegue baixar a cópia. Isso é tolerável com dados de desenvolvimento e de
demonstração, e **precisa ser reavaliado antes de qualquer uso com dados reais de
produção** — junto com cifragem em repouso e credencial de escrita sem permissão de
apagar, que estão nas pendências ao final deste documento.

### Baixar o artefato

Pela interface: **Actions > Database backup >** a execução desejada **> Artifacts >**
`craftstock-db-<AAAAMMDD-HHMMSSZ>`. O navegador baixa um `.zip` com o `.dump` dentro.

Pela linha de comando, que já descompacta:

```bash
gh run list --workflow=backup.yml --limit 5
gh run download <RUN_ID> --name craftstock-db-<AAAAMMDD-HHMMSSZ> --dir ./backups
```

O carimbo no nome é em **UTC**, e é o mesmo do arquivo — por isso execuções diferentes
nunca se sobrepõem.

### Restaurar a partir do artefato

O passo a passo abaixo é o ensaio completo. As opções e as garantias do
`db-restore.sh` — validação antes do `DROP`, transação única, confirmação digitada —
estão descritas na seção [Restaurar](#restaurar), adiante.

```bash
# 1. baixar (acima) — o arquivo cai em ./backups, que está no .gitignore
gh run download <RUN_ID> --name craftstock-db-20260929-060014Z --dir ./backups

# 2. conferir que o arquivo é legível antes de qualquer coisa
pg_restore --list backups/craftstock-20260929-060014Z.dump > /dev/null && echo ok

# 3. restaurar em banco limpo, sem encostar no banco de desenvolvimento
bash scripts/backup/db-restore.sh backups/craftstock-20260929-060014Z.dump \
  --database craftstock_restore_test

# 4. conferir o histórico de migrations do banco restaurado
DATABASE_URL="postgresql://craftstock:craftstock@localhost:5432/craftstock_restore_test?schema=public" \
  npx prisma migrate status
```

No passo 3, compare a contagem de linhas impressa pelo script com a que o próprio
workflow imprimiu: ela está no log do passo **Dump database** da execução, e sobrevive
enquanto o log da execução existir. Ao final, apague o banco de ensaio e o arquivo
baixado — ele é dado sensível como qualquer outra cópia.

Para **recuperação real** no banco gerenciado, e não ensaio, a diferença é apontar
`DATABASE_URL` para ele e usar `--drop`, com a ressalva de que o `db-restore.sh` derruba
e recria o banco conectando-se ao banco `postgres` do servidor; num provedor gerenciado,
restaurar em um banco ou branch novo e só então apontar a aplicação é o caminho menos
destrutivo. Esse caminho ainda não foi exercitado (ver a seção de verificação).

---

## Restaurar

```bash
bash scripts/backup/db-restore.sh backups/craftstock-20260928-231010.dump
```

Por padrão restaura no banco de `DATABASE_URL`, e **só se ele não existir**. Um banco
existente não é tocado sem `--drop`:

```bash
# ensaio: restaura em um banco novo, sem encostar no de desenvolvimento
bash scripts/backup/db-restore.sh ARQUIVO.dump --database craftstock_restore_test

# recuperação real: substitui o banco existente
bash scripts/backup/db-restore.sh ARQUIVO.dump --drop
```

`--drop` pede confirmação digitada do nome do banco. `--yes` pula a pergunta, e é
obrigatório quando não há terminal (script, CI).

Ordem deliberada das operações: o arquivo é validado **antes** de qualquer `DROP`.
Descobrir que a cópia está corrompida depois de destruir o banco de destino é o único
desfecho que este script não pode produzir.

A restauração roda em transação única (`--single-transaction`): ou o arquivo inteiro
entra, ou nada entra. Banco restaurado pela metade é pior que banco nenhum, porque
parece ter funcionado.

Ao final o script imprime a contagem de linhas do banco restaurado. Compare com a
contagem impressa na geração da cópia.

### Depois de restaurar

```bash
# o histórico de migrations veio junto e bate com prisma/migrations
DATABASE_URL="postgresql://craftstock:craftstock@localhost:5432/craftstock?schema=public" \
  npx prisma migrate status
```

Não rode `prisma migrate dev` nem `prisma db push` num banco recém-restaurado antes de
conferir isso: o schema já está aplicado, e o histórico veio dentro da cópia.

---

## Verificação executada

Procedimento de recuperação apenas descrito, e nunca executado, não é garantia de
continuidade: é suposição. O ciclo local completo foi executado; o disparo pelo GitHub
Actions ainda não.

### Ciclo local (dump e restauração na máquina)

**Data:** 28/09/2026

**Ambiente:** Windows 11, Git Bash, Docker Desktop 28.5.1, container
`craftstock-postgres` (`postgres:16-alpine`, servidor 16.15), cliente 16.15 vindo do
próprio container (`PG_CLIENT_MODE=auto` resolveu para `docker`).

**Origem:** banco `craftstock` de desenvolvimento, com dados reais de uso — 2.845 linhas
em 16 tabelas, incluindo 2.110 de `AuditLog`, 665 de `RequestLog`, 28 de `PurchaseItem`,
7 de `Material` e as 11 migrations em `_prisma_migrations`.

| Passo | Resultado |
| --- | --- |
| `db-dump.sh` sobre o banco com dados | `craftstock-20260928-231010.dump`, 292 KB, 86 entradas no índice |
| `db-restore.sh` em banco limpo (`craftstock_restore_test`, criado na hora) | Restauração concluída em transação única, sem erro |
| Contagem de linhas, tabela a tabela | Idêntica à origem nas 16 tabelas, total 2.845 |
| Comparação de conteúdo: `pg_dump --format=plain` da origem e do restaurado | **MD5 idêntico.** A única diferença bruta entre os dois arquivos eram as linhas `\restrict`/`\unrestrict`, que carregam um nonce sorteado a cada execução do `pg_dump`, e um bloco de comentário sobre o schema `public` |
| `prisma migrate status` contra o banco restaurado | `11 migrations found` / `Database schema is up to date!` |

Guardas do `db-restore.sh` exercitadas no mesmo ciclo, todas com saída 1 e sem efeito
colateral:

| Situação | Resultado |
| --- | --- |
| Restaurar sobre banco existente sem `--drop` | Recusado; o banco de destino permaneceu intacto (2.110 linhas em `AuditLog` conferidas depois) |
| Arquivo truncado com `--drop --yes` | Recusado na validação, **antes** de o banco ser derrubado |
| `--drop` sem `--yes` e sem terminal | Recusado, exigindo `--yes` explícito |
| `DATABASE_URL` ausente | Recusado com mensagem apontando o `.env` |
| `PG_CLIENT_MODE` inválido | Recusado |

O banco `craftstock_restore_test` foi removido ao final. O ensaio não alterou nada no
banco de desenvolvimento: a origem é lida, nunca escrita.

**Reexecutar este ciclo é obrigatório** sempre que mudar a versão do PostgreSQL, a forma
de rodar o banco, ou um dos dois scripts.

### Ciclo pelo GitHub Actions

**Status: pendente de execução.** O workflow está escrito e o YAML válido, mas o disparo
manual depende de dois passos que exigem a conta do repositório e a credencial do banco
gerenciado, nenhum dos dois disponível de dentro deste repositório:

1. o secret `DATABASE_URL` precisa existir (`gh secret set DATABASE_URL`, com a URL de
   conexão da Neon);
2. o `backup.yml` precisa estar no branch padrão — `workflow_dispatch` só é oferecido
   para workflows presentes em `master`.

Feito isso, o ciclo a executar e registrar aqui, com data, é o abaixo. **Enquanto esta
tabela estiver em branco, o agendamento está implementado e não verificado**, e a
distinção é a mesma que motivou o ciclo local: procedimento descrito e nunca executado é
suposição, não garantia.

Verificado localmente, até onde é possível sem o secret: o YAML é válido, o passo de dump
falha com mensagem explícita quando `DATABASE_URL` está vazio, e a chamada do
`db-dump.sh` com `--output` gera arquivo íntegro (292 KB, 86 entradas) contra o banco de
desenvolvimento. O que só o runner exerce — instalação do cliente por apt,
`PG_CLIENT_MODE=local`, conexão com o banco gerenciado e upload do artefato — é o que a
tabela abaixo cobre.

**Data:** _a preencher_

| Passo | Resultado |
| --- | --- |
| Disparo manual (`gh workflow run backup.yml`) conclui com sucesso | _a preencher_ |
| Versão do cliente no log do passo `Report client version`, contra a versão do servidor | _a preencher_ |
| Artefato `craftstock-db-<carimbo>` presente na execução, com tamanho plausível | _a preencher_ |
| Arquivo baixado restaura em banco limpo pelo `db-restore.sh` | _a preencher_ |
| Contagem de linhas do restaurado igual à impressa no log do passo `Dump database` | _a preencher_ |
| `prisma migrate status` contra o banco restaurado | _a preencher_ |
| Falha proposital (secret ausente ou URL inválida) derruba a execução e gera e-mail | _a preencher_ |

---

## Fora do escopo desta etapa

O agendamento saiu desta lista: está implementado, e a seção
[Agendamento automático](#agendamento-automático-github-actions) diz o que ele cobre. As
três decisões abaixo continuam abertas, e só fazem sentido quando existir uso em produção
real. Estão aqui como pendência explícita, não como esquecimento.

### 1. Destino remoto fora do GitHub e retenção de longo prazo

Pendência **reduzida, não resolvida**. Hoje há rotina diária e cópia guardada fora do
disco do banco, mas no mesmo provedor do código e por 30 dias.

A definir, quando houver produção real:

- **o destino** — bucket de objetos é o candidato óbvio, já que o projeto usa S3 para
  imagens em produção; muda apenas o passo final do workflow;
- **credencial de escrita separada** da credencial da aplicação, de preferência sem
  permissão de apagar, para que um comprometimento da aplicação não alcance as cópias;
- **cifragem em repouso**, porque o arquivo contém hash de senha e refresh token;
- **as janelas de retenção** — quantas cópias diárias, semanais e mensais manter, e quem
  apaga as vencidas. O projeto já tem retenção configurável para `AuditLog` e
  `RequestLog` (`AUDIT_LOG_RETENTION_DAYS`, `REQUEST_LOG_RETENTION_DAYS`); a das cópias
  precisa da mesma decisão, com um detalhe a mais: a janela tem que ser maior que o tempo
  que se leva para perceber um problema, senão a única cópia sobrevivente já vem com o
  problema dentro. Os 30 dias atuais são folga confortável para este projeto e curtos
  para um sistema em operação.

### 2. Reavaliação do artefato antes de dados reais

Enquanto o destino for o artefato da execução, a cópia herda a visibilidade do
repositório e fica acessível a quem lê o código. Antes do primeiro uso com dados reais de
usuários, isso precisa de decisão consciente: ou o destino muda, ou o repositório e o
acesso a ele passam a ser tratados com o mesmo cuidado que os dados.

### 3. Ensaio periódico

Restauração que ninguém executa não está verificada. O ciclo local já foi executado uma
vez, e o ciclo pelo Actions está pendente. A definir: com que frequência o ciclo é
repetido depois disso, contra qual ambiente, e onde o resultado fica registrado — este
documento é o lugar natural.
