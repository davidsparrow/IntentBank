#!/usr/bin/env bash
# Runs Supabase CLI commands against the hosted project using SUPABASE_DB_URL from .env.local
# (session pooler, port 5432). Keeps the connection string out of shell history and logs.
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(grep -E '^SUPABASE_DB_URL=' .env.local | cut -d= -f2-)
[ -n "$url" ] || { echo "SUPABASE_DB_URL missing from .env.local" >&2; exit 1; }
case "${1:-}" in
  push)  shift; supabase db push --db-url "$url" "$@" ;;
  types) supabase gen types typescript --db-url "$url" --schema public > src/lib/database.types.ts ;;
  *)     echo "usage: scripts/db.sh push [--dry-run] | types" >&2; exit 1 ;;
esac
