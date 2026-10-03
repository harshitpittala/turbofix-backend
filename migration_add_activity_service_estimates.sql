-- ================================================================
--  Migration: per-service price quotes on reminders / leads
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has this for fresh installs)
--
--  Context: while a lead is still undecided, the telecaller quotes a
--  price for each problem (e.g. display 17500, ear speaker 3500).
--  service_estimates stores that breakdown; `service` keeps a plain
--  comma-separated summary for search and older displays.
-- ================================================================

ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS service_estimates JSONB DEFAULT '[]';
