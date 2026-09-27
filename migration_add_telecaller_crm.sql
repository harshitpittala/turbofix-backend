-- ================================================================
--  Migration: telecaller RBAC + Customer Care attribution + schedules
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has these for fresh installs)
-- ================================================================

-- ── Allow the new restricted 'telecaller' role on admins ──────────
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('super_admin', 'admin', 'telecaller'));

-- ── Order attribution: who created it, who "owns" it for follow-up ─
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS created_by_id    INTEGER NULL REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS customer_care_id INTEGER NULL REFERENCES admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_repair_orders_created_by    ON repair_orders (created_by_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_customer_care ON repair_orders (customer_care_id);

-- ── Schedules & follow-ups ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_activities (
  id              SERIAL        PRIMARY KEY,
  order_id        INTEGER       NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  type            VARCHAR(30)   NOT NULL
                                CHECK (type IN (
                                  'callback', 'repair_appointment', 'follow_up',
                                  'pickup_delivery', 'post_repair_follow_up'
                                )),
  scheduled_at    TIMESTAMPTZ   NOT NULL,
  notes           TEXT,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'done', 'cancelled')),
  assigned_to_id  INTEGER       NULL REFERENCES admins(id) ON DELETE SET NULL,
  created_by_id   INTEGER       NULL REFERENCES admins(id) ON DELETE SET NULL,
  created_by_name VARCHAR(100),
  completed_at    TIMESTAMPTZ   NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_activities_order      ON order_activities (order_id);
CREATE INDEX IF NOT EXISTS idx_order_activities_scheduled  ON order_activities (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_order_activities_status     ON order_activities (status);
CREATE INDEX IF NOT EXISTS idx_order_activities_assigned   ON order_activities (assigned_to_id);

DROP TRIGGER IF EXISTS order_activities_updated_at ON order_activities;
CREATE TRIGGER order_activities_updated_at
  BEFORE UPDATE ON order_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Activity audit trail (created / rescheduled / status changes) ──
CREATE TABLE IF NOT EXISTS order_activity_history (
  id                 SERIAL      PRIMARY KEY,
  activity_id        INTEGER     NOT NULL REFERENCES order_activities(id) ON DELETE CASCADE,
  action             VARCHAR(20) NOT NULL CHECK (action IN ('created', 'rescheduled', 'status_changed', 'updated')),
  from_status        VARCHAR(20),
  to_status          VARCHAR(20),
  from_scheduled_at  TIMESTAMPTZ,
  to_scheduled_at    TIMESTAMPTZ,
  notes              TEXT,
  changed_by_id      INTEGER     NOT NULL,
  changed_by_name    VARCHAR(100),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_activity_history_activity ON order_activity_history (activity_id);

-- ── Manual step: provision your first telecaller login ─────────────
-- Password below is a placeholder — hash your own with:
--   node -e "console.log(require('bcryptjs').hashSync('YourPasswordHere', 12))"
-- INSERT INTO admins (name, email, password_hash, role) VALUES
--   ('Telecaller Name', 'telecaller@turbofix.in', '<bcrypt hash>', 'telecaller');
