-- ================================================================
--  TurboFix Database Schema — PostgreSQL / Supabase
--  Paste into Supabase SQL Editor and click Run
-- ================================================================

-- ── Auto-updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Admins ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL        PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(100)  UNIQUE NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          VARCHAR(20)   NOT NULL DEFAULT 'admin'
                              CHECK (role IN ('super_admin', 'admin')),
  is_active     BOOLEAN       DEFAULT TRUE,
  last_login    TIMESTAMPTZ   NULL,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TRIGGER admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Technicians ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technicians (
  id             SERIAL       PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(100) UNIQUE NOT NULL,
  phone          VARCHAR(20)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  specialty      VARCHAR(150),
  experience_yrs SMALLINT     DEFAULT 0,
  is_active      BOOLEAN      DEFAULT TRUE,
  avatar_color   VARCHAR(7)   DEFAULT '#00AAFF',
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TRIGGER technicians_updated_at
  BEFORE UPDATE ON technicians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Customers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           SERIAL        PRIMARY KEY,
  name         VARCHAR(100)  NOT NULL,
  email        VARCHAR(100),
  phone        VARCHAR(20)   NOT NULL,
  address      TEXT,
  total_orders INTEGER       DEFAULT 0,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Repair Orders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repair_orders (
  id               SERIAL        PRIMARY KEY,
  order_id         VARCHAR(20)   UNIQUE NOT NULL,
  customer_id      INTEGER       NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  technician_id    INTEGER       NULL    REFERENCES technicians(id) ON DELETE SET NULL,
  device_brand     VARCHAR(60)   NOT NULL,
  device_model     VARCHAR(120)  NOT NULL,
  services         JSONB         NOT NULL DEFAULT '[]',
  issue_description TEXT,
  service_type     VARCHAR(10)   NOT NULL CHECK (service_type IN ('walk-in', 'pickup')),
  pickup_address   TEXT,
  scheduled_date   DATE,
  scheduled_time   VARCHAR(20),
  status           VARCHAR(25)   NOT NULL DEFAULT 'pending'
                                 CHECK (status IN (
                                   'pending', 'pickup_assigned', 'picked_up',
                                   'under_diagnosis', 'repairing', 'ready',
                                   'delivered', 'cancelled'
                                 )),
  priority         VARCHAR(10)   NOT NULL DEFAULT 'normal'
                                 CHECK (priority IN ('normal', 'high', 'urgent')),
  estimated_cost   DECIMAL(10,2) NULL,
  actual_cost      DECIMAL(10,2) NULL,
  admin_notes      TEXT,
  technician_notes TEXT,
  warranty_months  SMALLINT      DEFAULT 6,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_orders_status     ON repair_orders (status);
CREATE INDEX IF NOT EXISTS idx_repair_orders_created_at ON repair_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_repair_orders_order_id   ON repair_orders (order_id);

CREATE TRIGGER repair_orders_updated_at
  BEFORE UPDATE ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Order Images ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_images (
  id          SERIAL       PRIMARY KEY,
  order_id    INTEGER      NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  filename    VARCHAR(255) NOT NULL,
  url         VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Order Status History ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id              SERIAL      PRIMARY KEY,
  order_id        INTEGER     NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  from_status     VARCHAR(25),
  to_status       VARCHAR(25) NOT NULL,
  updated_by_type VARCHAR(20) NOT NULL CHECK (updated_by_type IN ('admin', 'technician')),
  updated_by_id   INTEGER     NOT NULL,
  updated_by_name VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history (order_id);

-- ── Payments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             SERIAL        PRIMARY KEY,
  order_id       INTEGER       NOT NULL REFERENCES repair_orders(id) ON DELETE RESTRICT,
  amount         DECIMAL(10,2) NOT NULL,
  method         VARCHAR(20)   NOT NULL
                               CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  status         VARCHAR(10)   NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'paid', 'partial', 'refunded')),
  transaction_id VARCHAR(150),
  paid_at        TIMESTAMPTZ   NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seed: Default Super Admin ─────────────────────────────────────
-- Password: Admin@TurboFix2024  (change immediately after first login)
INSERT INTO admins (name, email, password_hash, role) VALUES
(
  'TurboFix Admin',
  'admin@turbofix.in',
  '$2a$12$k8Y5vZuGqFSQ9G5Kz0K1iOe8wRLFq0k8dBFzJ3mN9rT5pY7jH4uWS',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

-- ── Seed: Sample Technician ───────────────────────────────────────
-- Password: Tech@2024
INSERT INTO technicians (name, email, phone, password_hash, specialty, experience_yrs) VALUES
(
  'Vikram Rao',
  'vikram@turbofix.in',
  '+919876500001',
  '$2a$12$uK9bSvM6sQ3eT2kF4lO1dOGHVnIm5pE1bX4rN7yJ3wT6oL9kZ2uAS',
  'iPhone & Samsung Expert',
  12
)
ON CONFLICT (email) DO NOTHING;
