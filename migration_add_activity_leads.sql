-- ================================================================
--  Migration: let order_activities stand alone as lead/callback reminders
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has this for fresh installs)
--
--  Context: a telecaller often needs to log "call this person back
--  tomorrow" for a prospect who hasn't confirmed a repair yet — there is
--  no order to attach the reminder to. order_id becomes optional, and the
--  lead's own contact/device details are stored directly on the activity.
-- ================================================================

ALTER TABLE order_activities ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(100);
ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS phone          VARCHAR(20);
ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS device_brand   VARCHAR(60);
ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS device_model   VARCHAR(120);
ALTER TABLE order_activities ADD COLUMN IF NOT EXISTS service        VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_order_activities_phone ON order_activities (phone);
