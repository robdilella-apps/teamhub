#!/usr/bin/env bash
# Applies the migration + seed to a throwaway PostgreSQL database (with Supabase stubs)
# and runs RLS/behaviour assertions. Needs `psql` and a reachable server (PGHOST etc.).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-teamhub_test}
dropdb --if-exists "$DB" && createdb "$DB"
export PGOPTIONS="-c client_min_messages=warning"
P="psql -v ON_ERROR_STOP=1 -q -t -d $DB"
$P -f tests/supabase-stubs.sql
for f in supabase/migrations/*.sql; do $P -f "$f"; done
$P -f supabase/seed.sql
$P -f supabase/seed.sql   # seed must be idempotent
$P -f tests/db-assertions.sql
