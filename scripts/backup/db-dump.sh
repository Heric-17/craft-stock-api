#!/usr/bin/env bash
#
# Takes a full backup of the PostgreSQL database named by DATABASE_URL.
#
#   scripts/backup/db-dump.sh [-o FILE] [-d DATABASE] [--quiet]
#
# The output is a custom-format archive (pg_dump -Fc): compressed, and the only
# format pg_restore can restore selectively. Restore it with db-restore.sh.
#
# Credentials come from DATABASE_URL (see .env), never from this file.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/../.." && pwd)"

# shellcheck source=scripts/backup/pg-common.sh
. "$script_dir/pg-common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/backup/db-dump.sh [options]

Options:
  -o, --output FILE     Where to write the archive.
                        Default: $BACKUP_DIR/<database>-<timestamp>.dump
  -d, --database NAME   Database to dump. Default: the one in DATABASE_URL.
  -q, --quiet           Skip the row-count summary of the source database.
  -h, --help            This text.

Environment:
  DATABASE_URL          Required. Connection string, credentials included.
  BACKUP_DIR            Default output directory. Default: ./backups
  PG_CLIENT_MODE        auto (default) | local | docker
USAGE
}

output_file=""
database_override=""
quiet=0

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output) output_file="${2:-}"; [ -n "$output_file" ] || die "--output needs a path."; shift 2 ;;
    -d|--database) database_override="${2:-}"; [ -n "$database_override" ] || die "--database needs a name."; shift 2 ;;
    -q|--quiet) quiet=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument \"$1\"." ;;
  esac
done

load_env_file "$project_root/.env"
parse_database_url
resolve_client_mode

database="${database_override:-$PG_CONN_DB}"

if [ -z "$output_file" ]; then
  backup_dir="${BACKUP_DIR:-$project_root/backups}"
  output_file="$backup_dir/${database}-$(date +%Y%m%d-%H%M%S).dump"
fi

mkdir -p "$(dirname "$output_file")"

log "Source:   $database on $PG_CONN_HOST:$PG_CONN_PORT as $PG_CONN_USER (client: $PG_CLIENT_MODE)"
log "Target:   $output_file"

database_exists "$database" || die "database \"$database\" does not exist."

# Written to a temporary name and moved into place only after pg_dump exits
# clean. An interrupted dump must not leave behind a file that looks like a
# backup — that file would only be discovered to be useless on the day it is
# needed.
partial_file="$output_file.partial"
trap 'rm -f "$partial_file"' EXIT

# --no-owner/--no-privileges: the archive restores into whatever role runs the
# restore, so a recovery does not depend on recreating the original role first.
pg_run pg_dump \
  --dbname="$database" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  > "$partial_file"

[ -s "$partial_file" ] || die "pg_dump produced an empty file."

# Reading the table of contents back proves the archive is not truncated, and
# costs a fraction of a second.
entries="$(pg_run pg_restore --list < "$partial_file" | grep -cv '^;' || true)"
[ "${entries:-0}" -gt 0 ] || die "the archive has no restorable entries."

mv "$partial_file" "$output_file"
trap - EXIT

size="$(du -h "$output_file" | cut -f1)"
log ""
log "Done: $output_file ($size, $entries entries)"

if [ "$quiet" -eq 0 ]; then
  log ""
  log "Source row counts (compare against the restore):"
  print_row_counts "$database" >&2
fi
