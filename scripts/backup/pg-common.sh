#!/usr/bin/env bash
#
# Shared plumbing for db-dump.sh and db-restore.sh. Sourced, never executed.
#
# Three jobs:
#   1. load .env without overriding anything already exported;
#   2. parse DATABASE_URL into connection parts, so no credential is ever
#      written down in this repository;
#   3. decide how psql/pg_dump/pg_restore are reached — a client installed on
#      the host, or the one that already ships inside the compose container.
#
# Nothing here prints a password, and no password is ever passed as a command
# line argument: it travels as the PGPASSWORD environment variable, which is
# not visible in the process list of other users.

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

log() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

# Loads KEY=VALUE pairs from .env. Variables already present in the environment
# win, so `DATABASE_URL=... ./db-dump.sh` targets another database without
# editing any file.
load_env_file() {
  local env_file="$1"

  [ -f "$env_file" ] || return 0

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac

    line="${line#export }"

    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"

    # Trim surrounding whitespace and the optional quotes around the value.
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    case "$value" in
      \"*\") value="${value:1:${#value}-2}" ;;
      \'*\') value="${value:1:${#value}-2}" ;;
    esac

    [ -n "$key" ] || continue
    [ -z "${!key+set}" ] || continue

    export "$key=$value"
  done < "$env_file"
}

# ---------------------------------------------------------------------------
# DATABASE_URL
# ---------------------------------------------------------------------------

urldecode() {
  local value="${1//+/ }"
  printf '%b' "${value//%/\x}"
}

# Splits DATABASE_URL into PG_CONN_* and exports PGPASSWORD.
parse_database_url() {
  local url="${DATABASE_URL:-}"

  [ -n "$url" ] || die "DATABASE_URL is not set. Copy .env.example to .env, or export it for this call."

  local pattern='^postgres(ql)?://([^:/?#@]+)(:([^@]*))?@([^:/?#]+)(:([0-9]+))?/([^?#]+)'
  [[ "$url" =~ $pattern ]] || die "DATABASE_URL is not a connection string this script understands."

  PG_CONN_USER="$(urldecode "${BASH_REMATCH[2]}")"
  PG_CONN_HOST="${BASH_REMATCH[5]}"
  PG_CONN_PORT="${BASH_REMATCH[7]:-5432}"
  PG_CONN_DB="$(urldecode "${BASH_REMATCH[8]}")"

  PGPASSWORD="$(urldecode "${BASH_REMATCH[4]}")"
  export PGPASSWORD
}

# ---------------------------------------------------------------------------
# Client mode
# ---------------------------------------------------------------------------

# PG_CLIENT_MODE picks where the PostgreSQL client binaries come from:
#
#   local   the host has psql/pg_dump/pg_restore on PATH
#   docker  run them inside the compose service (the container already has a
#           client of exactly the server's version)
#   auto    local when available, docker otherwise
#
# The client must not be older than the server: pg_dump refuses to dump a
# newer server outright. `docker` sidesteps the whole question, which is why
# it is the fallback rather than an error.
resolve_client_mode() {
  local mode="${PG_CLIENT_MODE:-auto}"

  case "$mode" in
    local)
      command -v pg_dump >/dev/null 2>&1 || die "PG_CLIENT_MODE=local, but pg_dump is not on PATH."
      ;;
    docker)
      command -v docker >/dev/null 2>&1 || die "PG_CLIENT_MODE=docker, but docker is not on PATH."
      ;;
    auto)
      if command -v pg_dump >/dev/null 2>&1 && command -v pg_restore >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
        mode=local
      elif command -v docker >/dev/null 2>&1; then
        mode=docker
      else
        die "No PostgreSQL client on PATH and no docker to borrow one from."
      fi
      ;;
    *)
      die "PG_CLIENT_MODE must be auto, local or docker (got \"$mode\")."
      ;;
  esac

  PG_CLIENT_MODE="$mode"

  if [ "$PG_CLIENT_MODE" = docker ]; then
    BACKUP_DOCKER_SERVICE="${BACKUP_DOCKER_SERVICE:-postgres}"

    docker compose ps --status running --services 2>/dev/null | grep -qx "$BACKUP_DOCKER_SERVICE" \
      || die "The compose service \"$BACKUP_DOCKER_SERVICE\" is not running. Start it with: docker compose up -d"

    # Inside the container the server answers on its own localhost:5432,
    # whatever host port docker-compose published it on.
    PG_CONN_HOST=localhost
    PG_CONN_PORT=5432
  fi
}

# Runs a PostgreSQL client program against the resolved connection. stdin and
# stdout pass straight through, so the dump file never has to exist inside the
# container.
pg_run() {
  local program="$1"
  shift

  case "$PG_CLIENT_MODE" in
    local)
      "$program" -h "$PG_CONN_HOST" -p "$PG_CONN_PORT" -U "$PG_CONN_USER" "$@"
      ;;
    docker)
      # `-e PGPASSWORD` with no value copies it from this shell's environment,
      # which keeps it out of the argument list.
      docker compose exec -T -e PGPASSWORD "$BACKUP_DOCKER_SERVICE" \
        "$program" -h "$PG_CONN_HOST" -p "$PG_CONN_PORT" -U "$PG_CONN_USER" "$@"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Shared queries
# ---------------------------------------------------------------------------

database_exists() {
  local name="$1"
  local found

  found="$(pg_run psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'")"
  [ "$found" = "1" ]
}

# Exact row count of every table in the public schema. pg_stat_user_tables is
# an estimate refreshed by autovacuum, so it is useless as evidence that a
# restore brought the data back; this counts for real.
print_row_counts() {
  local database="$1"

  pg_run psql -d "$database" -tA -F'|' <<'SQL' |
SELECT table_name,
       (xpath('/row/count/text()', table_count))[1]::text::bigint AS row_count
FROM (
  SELECT table_name,
         query_to_xml(
           format('SELECT count(*) AS count FROM %I.%I', table_schema, table_name),
           false, true, ''
         ) AS table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
) AS counted
ORDER BY table_name;
SQL
    awk -F'|' '{ printf "  %-24s %10s\n", $1, $2; total += $2 }
               END { printf "  %-24s %10s\n", "TOTAL", total }'
}
