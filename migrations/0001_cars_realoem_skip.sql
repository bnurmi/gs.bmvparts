-- Task #165: add realoem_skip flag to cars table.
-- Marks chassis that have no usable RealOEM data so the chain watcher
-- skips them in future passes instead of burning proxy budget on them.
-- Safe to run multiple times (IF NOT EXISTS / DEFAULT guard).
ALTER TABLE cars ADD COLUMN IF NOT EXISTS realoem_skip boolean NOT NULL DEFAULT false;
