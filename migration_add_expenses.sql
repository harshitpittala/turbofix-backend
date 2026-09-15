-- ================================================================
--  Migration: add expenses table (Analysis page)
--  Run this once in the Supabase SQL Editor against the live DB
--  (supabase_schema.sql already has this table for fresh installs)
-- ================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id            SERIAL        PRIMARY KEY,
  amount        DECIMAL(10,2) NOT NULL,
  expense_date  DATE          NOT NULL,
  reason        VARCHAR(200)  NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (expense_date);

DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
