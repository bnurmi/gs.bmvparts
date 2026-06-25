-- Migration: rego_vin_cache
-- Stores rego -> VIN lookups from the BMW Australia recall site.
-- Unique on (rego, state) -- one canonical VIN per plate per state.

CREATE TABLE IF NOT EXISTS rego_vin_cache (
  id            SERIAL PRIMARY KEY,
  rego          TEXT NOT NULL,
  state         TEXT NOT NULL,
  vin           TEXT NOT NULL,
  model         TEXT,
  year          INTEGER,
  colour        TEXT,
  looked_up_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  source        TEXT NOT NULL DEFAULT 'bmw_recall',
  CONSTRAINT rego_vin_cache_rego_state_unique UNIQUE (rego, state)
);

CREATE INDEX IF NOT EXISTS idx_rego_vin_cache_rego ON rego_vin_cache (rego);
CREATE INDEX IF NOT EXISTS idx_rego_vin_cache_vin  ON rego_vin_cache (vin);
