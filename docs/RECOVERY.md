# Recuperação do banco de dados

Cópia de segurança e restauração do PostgreSQL do CraftStock.

| Script | O que faz |
| --- | --- |
| [scripts/backup/db-dump.sh](../scripts/backup/db-dump.sh) | Gera um arquivo de cópia do banco |
| [scripts/backup/db-restore.sh](../scripts/backup/db-restore.sh) | Restaura um arquivo de cópia em um banco |

Nenhum dos dois contém credencial: ambos leem `DATABASE_URL`, do ambiente ou do `.env`.
A senha viaja como `PGPASSWORD`, nunca na linha de comando.

**O arquivo de cópia é dado sensível:** contém hash de senha e refresh token de todos os
usuários. `backups/` está no `.gitignore`. Nunca versione, nunca anexe em ticket, nunca
deixe em pasta compartilhada aberta.

---

## Pré-requisitos

- Banco no ar: `docker compose up -d`.
- Shell POSIX. No Windows, **Git Bash** — não o `bash.exe` do WSL, que enxerga outro
  sistema de arquivos e outro Docker.
- Cliente do PostgreSQL. Não precisa estar instalado na máquina: por padrão os scripts
  usam o do container do compose, que roda a mesma major do banco gerenciado (18). O
  `pg_restore` não lê arquivo gerado por versão mais nova que a dele, então restaurar o
  arquivo de produção (gerado pelo `pg_dump` 18.6) exige cliente 18 ou superior.
- `PG_CLIENT_MODE` escolhe de onde vêm os binários: `auto` (padrão — host quando há
  cliente, container quando não), `local` ou `docker`.

---

## 1. Gerar uma cópia

```bash
bash scripts/backup/db-dump.sh                            # ./backups/<banco>-<data>.dump
bash scripts/backup/db-dump.sh -o /caminho/arquivo.dump   # destino explícito
bash scripts/backup/db-dump.sh -d outro_banco             # outro banco
```

O diretório padrão é `BACKUP_DIR`, que vale `./backups` quando não definido.

O script valida o que gerou: renomeia o `.partial` só depois de o `pg_dump` sair limpo,
recusa arquivo vazio e relê o índice para provar que não está truncado.

**Guarde a contagem de linhas que ele imprime ao final** — é com ela que a restauração é
conferida.

---

## 2. Restaurar

```bash
# ensaio: banco novo, sem encostar no de desenvolvimento
bash scripts/backup/db-restore.sh ARQUIVO.dump --database craftstock_restore_test

# recuperação real: substitui o banco existente
bash scripts/backup/db-restore.sh ARQUIVO.dump --drop
```

Sem `--drop`, um banco que já existe não é tocado. Com `--drop`, o script pede o nome do
banco digitado; `--yes` pula a pergunta e é obrigatório quando não há terminal. O arquivo
é validado **antes** de qualquer `DROP`, e a restauração roda em transação única: ou o
arquivo inteiro entra, ou nada entra.

Depois de restaurar, confira duas coisas: que a contagem impressa pelo script bate com a
da geração da cópia, e que o histórico de migrations veio junto.

```bash
DATABASE_URL="postgresql://craftstock:craftstock@localhost:5432/craftstock?schema=public" \
  npx prisma migrate status      # esperado: Database schema is up to date!
```

Não rode `prisma migrate dev` nem `prisma db push` em banco recém-restaurado antes disso:
o schema já está aplicado e o histórico veio dentro da cópia.

---

## 3. Restaurar a partir do backup automático

O arquivo do agendamento está cifrado, e abrir exige a `BACKUP_ENCRYPTION_KEY` — que não
está neste repositório e não é legível pelo `gh`.

```bash
# 1. achar a execução e baixar o artefato
gh run list --workflow=backup.yml --limit 5
gh run download <RUN_ID> --dir ./backups

# 2. decifrar (o gpg pergunta a chave no terminal, então ela não vai para o histórico)
gpg --output backups/craftstock-<carimbo>.dump \
    --decrypt backups/craftstock-<carimbo>.dump.gpg

# 3. conferir que o arquivo é legível antes de encostar em banco
pg_restore --list backups/craftstock-<carimbo>.dump > /dev/null && echo ok

# 4. restaurar em banco limpo
bash scripts/backup/db-restore.sh backups/craftstock-<carimbo>.dump \
  --database craftstock_restore_test

# 5. conferir migrations
DATABASE_URL="postgresql://craftstock:craftstock@localhost:5432/craftstock_restore_test?schema=public" \
  npx prisma migrate status
```

No passo 4, compare a contagem com a impressa no log do passo **Dump database** da
execução. Chave errada para em `decryption failed: Bad session key`, sem escrever nada.

**Ao terminar, apague o banco de ensaio e o `.dump` decifrado** — ele é a cópia em claro
do banco inteiro.

Para recuperação real no banco gerenciado, restaure em banco ou branch novo e só então
aponte a aplicação. O `--drop` derruba e recria o banco conectando-se ao `postgres` do
servidor, o que num provedor gerenciado é o caminho mais destrutivo.

---

## Agendamento

Workflow: [.github/workflows/backup.yml](../.github/workflows/backup.yml)

| Item | Valor |
| --- | --- |
| Quando | diário, 06:00 UTC = **03:00 em Porto Alegre** (expressão `0 6 * * *`) |
| Disparo manual | `workflow_dispatch`, na aba **Actions** |
| Origem | secret `DATABASE_URL` |
| Cliente | instalado no runner, major fixada em `PG_CLIENT_MAJOR_VERSION` (hoje `18`; servidor 18.6) |
| Cifragem | `gpg` simétrico AES-256, secret `BACKUP_ENCRYPTION_KEY` |
| Destino | artefato da própria execução, somente o `.dump.gpg` |
| Retenção | 30 dias |

O cron do Actions é **sempre UTC**: mudar o horário local exige mudar a expressão e esta
tabela. O repositório é público e o artefato herda essa visibilidade — é a cifragem que
torna esse destino defensável, e por isso o arquivo em claro nunca sai do runner.

Falha de execução agendada gera e-mail do GitHub, e é esse o alerta. O workflow não tem
verificação própria: aproveita as do `db-dump.sh`, e qualquer uma delas derruba a
execução.

**O GitHub desativa workflow agendado após 60 dias sem atividade no repositório.** A
reativação é o disparo manual. Ao voltar a mexer no projeto, confira em **Actions** se o
agendamento continua ativo.

---

## O que a cópia não cobre

- **Imagens enviadas.** Em produção vão para o S3, com versionamento e ciclo próprios do
  bucket. O banco guarda só a referência: restaurar o banco sem as imagens devolve
  registros cujas imagens não abrem.
- **O `.env`.** `JWT_SECRET`, credenciais de SMTP e chaves de S3. Sem eles a aplicação
  não sobe, e um `JWT_SECRET` diferente invalida todo access token em circulação.
- **A chave de cifragem.** Sem ela o artefato do agendamento não abre.

---

## Verificação executada

Procedimento descrito e nunca executado é suposição, não garantia.

| Ciclo | Data | Resultado |
| --- | --- | --- |
| Local, na máquina | 28/09/2026 | 2.845 linhas em 16 tabelas; contagem idêntica; conteúdo com MD5 idêntico ao da origem; `migrate status` em dia. Guardas do `db-restore.sh` recusaram: sem `--drop`, arquivo truncado, `--drop` sem `--yes`, `DATABASE_URL` ausente e `PG_CLIENT_MODE` inválido |
| Local, atravessando a troca de major 16.15 para 18.6 | 04/10/2026 | Dump na 16, restauração na 18.6, as mesmas 2.845 linhas, `migrate status` em dia, e2e com 96 testes passando |
| Artefato do Actions, ponta a ponta | 04/10/2026 | Baixado de execução agendada, decifrado, restaurado em banco limpo; contagem igual à do log da execução (16 tabelas em 0, 11 migrations); `migrate status` em dia; chave errada recusada com `Bad session key` |

**Ressalva.** O banco gerenciado está hoje vazio de dado de negócio, então o ciclo pelo
artefato prova o mecanismo — dump, cifragem, upload, decifragem, restauração — e não a
sobrevivência de um volume de dados. Essa parte fica coberta pelo ciclo local.

**Reexecutar é obrigatório** quando mudar a versão do PostgreSQL ou um dos scripts (ciclo
local), ou a major do servidor gerenciado, o `PG_CLIENT_MAJOR_VERSION`, a forma de cifrar
ou o destino (ciclo do artefato).

---

## Pendências

- **Destino e retenção de longo prazo.** Hoje a cópia fica no mesmo provedor do código e
  por 30 dias. A definir, quando houver produção real: o destino (bucket próprio), uma
  credencial de escrita sem permissão de apagar, e as janelas de retenção.
- **Custódia da chave de cifragem.** Existe em dois lugares: o secret do repositório e
  onde você a guardou. A definir: onde fica para sobreviver à perda da máquina, com que
  frequência é trocada, e como os artefatos gerados com a chave antiga continuam
  abríveis depois da troca.
- **Periodicidade do ensaio.** Os três ciclos acima foram executados; falta definir de
  quanto em quanto tempo se repetem, contra qual ambiente e quem executa.
