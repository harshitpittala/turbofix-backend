-- ================================================================
--  Migration: per-service cost breakdown behind a phone quote
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has this for fresh installs)
--
--  Context: when a telecaller quotes a customer for multiple issues on
--  one device (e.g. screen + battery), estimated_cost alone doesn't show
--  how that total was built up. service_estimates stores the breakdown;
--  estimated_cost stays the authoritative total for existing displays.
-- ================================================================

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS service_estimates JSONB DEFAULT '[]';
