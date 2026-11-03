#!/usr/bin/env bash
# Teste schema.sql et les règles RLS sur un PostgreSQL local jetable.
# Usage : PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c 'drop database if exists doomee_test' -c 'create database doomee_test'
P="$P -d doomee_test"
$P -f tests/stub_supabase.sql
$P -f schema.sql 2>&1 | grep -v NOTICE || true
$P -f tests/rls_test.sql 2>&1 | grep -E 'PASS|FAIL|ERROR' | tee /dev/stderr | { ! grep -q -E 'FAIL|ERROR'; }
