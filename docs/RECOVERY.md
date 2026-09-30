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
anexado a ticket, nunca em pasta compartilhada aberta. `backups/` está no `.gitignore`.

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
continuidade: é suposição. O ciclo completo foi executado.

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

---

## Fora do escopo desta etapa

Quatro decisões que só fazem sentido quando existir servidor de produção. Estão aqui
como pendência explícita, não como esquecimento.

### 1. Agendamento

Hoje a cópia é manual. A aplicação já tem `@nestjs/schedule` no processo, usado pelo
canário da NFC-e e pela poda de `AuditLog`/`RequestLog` — mas cópia de segurança
disparada de dentro do processo que ela protege é frágil: se o processo estiver caído,
não há cópia justamente no dia em que ela importa.

A definir: cron do sistema operacional ou serviço gerenciado do provedor; frequência
(diária é o piso razoável para um sistema com entrada de notas fiscais); janela de
execução; e como a falha do agendamento é notificada — o `NotificationSender` já existe
e é o caminho natural.

### 2. Destino remoto

Cópia guardada no mesmo disco do banco não protege contra perda do disco, que é
exatamente o cenário que motiva a cópia.

A definir: o destino (bucket de objetos é o candidato óbvio, já que o projeto usa S3
para imagens em produção); credenciais de escrita separadas das da aplicação, de
preferência sem permissão de apagar; e cifragem em repouso — o arquivo contém hash de
senha e refresh token.

### 3. Retenção

A definir: quantas cópias diárias, semanais e mensais manter, e quem apaga as vencidas.
O projeto já tem retenção configurável para `AuditLog` e `RequestLog`
(`AUDIT_LOG_RETENTION_DAYS`, `REQUEST_LOG_RETENTION_DAYS`); a das cópias precisa da
mesma decisão, com um detalhe a mais: a janela de retenção tem que ser maior que o tempo
que se leva para perceber um problema, senão a única cópia sobrevivente já vem com o
problema dentro.

### 4. Ensaio periódico

Restauração que ninguém executa não está verificada. A definir: com que frequência o
ciclo acima é repetido em produção, contra qual ambiente, e onde o resultado fica
registrado.
