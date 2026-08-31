-- ================================================================
--  Migration: add IMEI number to repair_orders
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has this column for fresh installs)
-- ================================================================

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS imei_number VARCHAR(20);
