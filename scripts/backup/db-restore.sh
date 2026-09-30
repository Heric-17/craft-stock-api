#!/usr/bin/env bash
#
# Restores an archive produced by db-dump.sh into a database.
#
#   scripts/backup/db-restore.sh ARCHIVE [-d DATABASE] [--drop] [--yes]
#
# The target database is created empty and restored in a single transaction:
# either the whole archive lands, or nothing does. A half-restored database is
# worse than no database, because it looks like it worked.
#
# Credentials come from DATABASE_URL (see .env), never from this file.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

# shellcheck source=scripts/backup/pg-common.sh
. "$script_dir/pg-common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/backup/db-restore.sh ARCHIVE [options]

Arguments:
  ARCHIVE               Archive written by db-dump.sh.

Options:
  -d, --database NAME   Database to restore into. Default: the one in
                        DATABASE_URL. It is created when it does not exist.
      --drop            Allow dropping the database when it already exists.
                        Without it, an existing database is left untouched.
  -y, --yes             Do not ask for confirmation before dropping.
  -h, --help            This text.

Environment:
  DATABASE_URL          Required. Connection string, credentials included.
  PG_CLIENT_MODE        auto (default) | local | docker
USAGE
}

archive=""
database_override=""
allow_drop=0
assume_yes=0

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--database) database_override="${2:-}"; [ -n "$database_override" ] || die "--database needs a name."; shift 2 ;;
    --drop) allow_drop=1; shift ;;
    -y|--yes) assume_yes=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) usage >&2; die "unknown option \"$1\"." ;;
    *)
      [ -z "$archive" ] || die "only one archive can be restored at a time."
      archive="$1"
      shift
      ;;
  esac
done

[ -n "$archive" ] || { usage >&2; die "no archive given."; }
[ -f "$archive" ] || die "archive \"$archive\" does not exist."

load_env_file "$project_root/.env"
parse_database_url
resolve_client_mode

database="${database_override:-$PG_CONN_DB}"

log "Archive:  $archive"
log "Target:   $database on $PG_CONN_HOST:$PG_CONN_PORT as $PG_CONN_USER (client: $PG_CLIENT_MODE)"

# Checked before anything is dropped: discovering a corrupt archive after the
# target has been destroyed is the one outcome this script must never produce.
pg_run pg_restore --list < "$archive" > /dev/null \
  || die "\"$archive\" is not a readable custom-format archive."

if database_exists "$database"; then
  if [ "$allow_drop" -eq 0 ]; then
    die "database \"$database\" already exists. Restore into another one with --database, or pass --drop to replace it."
  fi

  if [ "$assume_yes" -eq 0 ]; then
    if [ ! -t 0 ]; then
      die "dropping \"$database\" needs confirmation, and there is no terminal to ask on. Pass --yes if that is intended."
    fi

    log ""
    log "This DROPS the database \"$database\" and everything in it."
    printf 'Type the database name to confirm: ' >&2
    read -r confirmation
    [ "$confirmation" = "$database" ] || die "confirmation did not match; nothing was changed."
  fi

  log "Dropping \"$database\"..."
  # WITH (FORCE) closes the sessions still holding the database open — an API
  # left running is the normal case during a recovery drill.
  pg_run psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$database\" WITH (FORCE)" > /dev/null
fi

log "Creating \"$database\"..."
# template0 rather than the default template1: a template carrying local
# objects would collide with the archive's own.
pg_run psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$database\" TEMPLATE template0" > /dev/null

log "Restoring..."
pg_run pg_restore \
  --dbname="$database" \
  --single-transaction \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  < "$archive"

log ""
log "Restored row counts:"
print_row_counts "$database" >&2
log ""
log "Done. Compare the counts above with the ones reported when the archive was taken."
