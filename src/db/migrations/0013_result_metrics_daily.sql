-- ===========================================================================
-- 0013 — result_metrics_daily
--
-- The Results module and the dashboards ask the same question constantly:
-- "this metric, for this client or project, over this period". Answering it
-- from result_metrics means scanning every measurement every time; at the
-- twelve-month volumetry (ADR-022) that is hundreds of thousands of rows for a
-- chart nobody waited for.
--
-- A materialised view, not a table maintained by triggers: the aggregate is
-- DERIVED, and derived data that is written by hand is derived data that drifts.
-- Refreshed by a job (src/db/refresh-views.ts), never inside a request.
--
-- Note it carries organization_id and is queried through it — but a
-- materialised view cannot have row level security. It is therefore NOT granted
-- to app_user: only the migrator reads it, and the application reads the base
-- table. The view exists for reporting jobs (LOT 12), which run as the migrator
-- and pass the organisation explicitly.
-- ===========================================================================

CREATE MATERIALIZED VIEW result_metrics_daily AS
SELECT rm.organization_id,
       rm.metric_id,
       rm.recorded_for,
       rm.project_id,
       rm.client_id,
       rm.channel_id,
       rm.action_type_id,
       rm.currency,
       sum(rm.value)   AS total,
       avg(rm.value)   AS average,
       min(rm.value)   AS minimum,
       max(rm.value)   AS maximum,
       count(*)::int   AS samples
  FROM result_metrics rm
  JOIN results r ON r.id = rm.result_id AND r.deleted_at IS NULL
 GROUP BY rm.organization_id,
          rm.metric_id,
          rm.recorded_for,
          rm.project_id,
          rm.client_id,
          rm.channel_id,
          rm.action_type_id,
          rm.currency;
--> statement-breakpoint

-- REFRESH ... CONCURRENTLY needs a unique index over PLAIN COLUMNS: PostgreSQL
-- refuses an index built on expressions ("cannot refresh materialized view
-- concurrently / Create a unique index with no WHERE clause on one or more
-- COLUMNS"). An earlier version of this migration wrapped every nullable
-- dimension in coalesce() to fake a non-null key; the refresh then fell back to
-- the blocking path on every single run, which is precisely what the view
-- exists to avoid.
--
-- NULLS NOT DISTINCT (PostgreSQL 15+) makes the index ENFORCE what the GROUP BY
-- already guarantees: one row per dimension combination, a missing dimension
-- counting as one value rather than as infinitely many.
--
-- Currency is part of the key: two currencies are never summed into one row
-- (ADR-024).
CREATE UNIQUE INDEX result_metrics_daily_key
  ON result_metrics_daily (
    organization_id,
    metric_id,
    recorded_for,
    project_id,
    client_id,
    channel_id,
    action_type_id,
    currency
  ) NULLS NOT DISTINCT;
--> statement-breakpoint

CREATE INDEX result_metrics_daily_org_client_idx
  ON result_metrics_daily (organization_id, client_id, metric_id, recorded_for);
