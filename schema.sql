-- ================================================================
--  TurboFix Database Schema
--  MySQL 8.0+ / PlanetScale / Supabase (MySQL-compatible)
--  Run: mysql -u root -p turbofix_db < schema.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS turbofix_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE turbofix_db;

-- ── Admins ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            INT            PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(100)   NOT NULL,
  email         VARCHAR(100)   UNIQUE NOT NULL,
  password_hash VARCHAR(255)   NOT NULL,
  role          ENUM('super_admin','admin') DEFAULT 'admin',
  is_active     BOOLEAN        DEFAULT TRUE,
  last_login    TIMESTAMP      NULL,
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Technicians ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technicians (
  id            INT            PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(100)   NOT NULL,
  email         VARCHAR(100)   UNIQUE NOT NULL,
  phone         VARCHAR(20)    NOT NULL,
  password_hash VARCHAR(255)   NOT NULL,
  specialty     VARCHAR(150),
  experience_yrs TINYINT       DEFAULT 0,
  is_active     BOOLEAN        DEFAULT TRUE,
  avatar_color  VARCHAR(7)     DEFAULT '#00AAFF',
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Customers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            INT            PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(100)   NOT NULL,
  email         VARCHAR(100),
  phone         VARCHAR(20)    NOT NULL,
  address       TEXT,
  total_orders  INT            DEFAULT 0,
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_email (email)
);

-- ── Repair Orders ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repair_orders (
  id              INT            PRIMARY KEY AUTO_INCREMENT,
  order_id        VARCHAR(20)    UNIQUE NOT NULL,   -- TFX-XXXXXX
  customer_id     INT            NOT NULL,
  technician_id   INT            NULL,
  device_brand    VARCHAR(60)    NOT NULL,
  device_model    VARCHAR(120)   NOT NULL,
  services        JSON           NOT NULL,           -- ["screen","battery",...]
  issue_description TEXT,
  service_type    ENUM('walk-in','pickup')  NOT NULL,
  pickup_address  TEXT,
  scheduled_date  DATE,
  scheduled_time  VARCHAR(20),
  status          ENUM(
                    'pending',
                    'pickup_assigned',
                    'picked_up',
                    'under_diagnosis',
                    'repairing',
                    'ready',
                    'delivered',
                    'cancelled'
                  )              DEFAULT 'pending',
  priority        ENUM('normal','high','urgent') DEFAULT 'normal',
  estimated_cost  DECIMAL(10,2)  NULL,
  actual_cost     DECIMAL(10,2)  NULL,
  admin_notes     TEXT,
  technician_notes TEXT,
  warranty_months TINYINT        DEFAULT 6,
  created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)   REFERENCES customers(id)    ON DELETE RESTRICT,
  FOREIGN KEY (technician_id) REFERENCES technicians(id)  ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_order_id (order_id)
);

-- ── Order Images ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_images (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  order_id    INT          NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  url         VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES repair_orders(id) ON DELETE CASCADE
);

-- ── Order Status History ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id             INT         PRIMARY KEY AUTO_INCREMENT,
  order_id       INT         NOT NULL,
  from_status    VARCHAR(50),
  to_status      VARCHAR(50) NOT NULL,
  updated_by_type ENUM('admin','technician') NOT NULL,
  updated_by_id  INT         NOT NULL,
  updated_by_name VARCHAR(100),
  notes          TEXT,
  created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES repair_orders(id) ON DELETE CASCADE,
  INDEX idx_order (order_id)
);

-- ── Payments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             INT            PRIMARY KEY AUTO_INCREMENT,
  order_id       INT            NOT NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  method         ENUM('cash','upi','card','bank_transfer','other') NOT NULL,
  status         ENUM('pending','paid','partial','refunded') DEFAULT 'pending',
  transaction_id VARCHAR(150),
  paid_at        TIMESTAMP      NULL,
  notes          TEXT,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES repair_orders(id) ON DELETE RESTRICT,
  INDEX idx_order (order_id)
);

-- ── Seed: Default Super Admin ─────────────────────────────────────
-- Password: Admin@TurboFix2024  (change immediately after first login)
INSERT INTO admins (name, email, password_hash, role) VALUES
(
  'TurboFix Admin',
  'admin@turbofix.in',
  '$2a$12$k8Y5vZuGqFSQ9G5Kz0K1iOe8wRLFq0k8dBFzJ3mN9rT5pY7jH4uWS',
  'super_admin'
)
ON DUPLICATE KEY UPDATE id = id;

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
ON DUPLICATE KEY UPDATE id = id;
