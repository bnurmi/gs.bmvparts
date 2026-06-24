#!/usr/bin/env node
// Walk every SQLite file under `data/ista/extracted/` and produce
// `data/ista/inventory/inventory.json` — a machine-readable record of:
//   - file path, size in bytes
//   - every table: name, column list (name + declared type + pk flag),
//     exact row count
//
// Uses the `sqlite3` CLI (installed via Nix) — no native node bindings
// required. Read-only; opens databases with `?mode=ro&immutable=1` so
// we never accidentally mutate the source files.
//
// Usage: node scripts/enumerate-ista-sqlite.mjs
import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "data", "ista", "extracted");
const OUT_DIR = path.join(ROOT, "data", "ista", "inventory");
const OUT_FILE = path.join(OUT_DIR, "inventory.json");

const SQLITE_EXT = new Set([".db", ".sqlite", ".sqlite3"]);

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (SQLITE_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

function sqliteJson(file, sql) {
  // Open read-only via URI so we never write a hot-journal file next
  // to the source. `-json` gives us back parseable JSON.
  const uri = `file:${file}?mode=ro&immutable=1`;
  const raw = execFileSync(
    "sqlite3",
    ["-json", "-readonly", uri, sql],
    { maxBuffer: 256 * 1024 * 1024, encoding: "utf-8" },
  ).trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { return { __error: e.message?.slice(0, 200) ?? String(e), ...(fallback || {}) }; }
}

async function inventoryFile(file) {
  const st = await stat(file);
  const rec = {
    path: path.relative(ROOT, file),
    sizeBytes: st.size,
    tables: [],
    error: null,
  };

  const tablesRaw = safe(
    () => sqliteJson(file, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
    [],
  );
  if (tablesRaw && tablesRaw.__error) {
    rec.error = `enumerate tables failed: ${tablesRaw.__error}`;
    return rec;
  }

  for (const t of tablesRaw) {
    const tableName = t.name;
    const cols = safe(
      () => sqliteJson(file, `PRAGMA table_info("${tableName.replace(/"/g, '""')}")`),
      [],
    );
    const colList = Array.isArray(cols)
      ? cols.map(c => ({ name: c.name, type: c.type || null, pk: !!c.pk, notnull: !!c.notnull }))
      : [];

    let rowCount = null;
    let rowCountError = null;
    try {
      const r = sqliteJson(file, `SELECT COUNT(*) AS c FROM "${tableName.replace(/"/g, '""')}"`);
      rowCount = Number(r?.[0]?.c ?? 0);
    } catch (e) {
      rowCountError = e.message?.slice(0, 200) ?? String(e);
    }

    rec.tables.push({ name: tableName, columns: colList, rowCount, rowCountError });
  }
  return rec;
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`[ista-enum] no extracted directory at ${SRC}`);
    console.error(`[ista-enum] run scripts/extract-ista-sqlite.sh first`);
    process.exit(2);
  }

  const files = await walk(SRC);
  console.log(`[ista-enum] found ${files.length} SQLite files`);
  if (files.length === 0) {
    console.error(`[ista-enum] no .db / .sqlite / .sqlite3 files under ${SRC}`);
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const inventory = { generatedAt: new Date().toISOString(), root: path.relative(ROOT, SRC), files: [] };
  for (const f of files) {
    process.stdout.write(`[ista-enum] ${path.basename(f)} ... `);
    const rec = await inventoryFile(f);
    const tbls = rec.tables.length;
    const rows = rec.tables.reduce((a, t) => a + (t.rowCount || 0), 0);
    console.log(`tables=${tbls} rows=${rows}${rec.error ? ` ERROR=${rec.error}` : ""}`);
    inventory.files.push(rec);
  }

  await writeFile(OUT_FILE, JSON.stringify(inventory, null, 2));
  console.log(`[ista-enum] wrote ${OUT_FILE}`);
  console.log(`[ista-enum] summary: ${inventory.files.length} files, `
    + `${inventory.files.reduce((a, f) => a + f.tables.length, 0)} tables, `
    + `${inventory.files.reduce((a, f) => a + f.tables.reduce((b, t) => b + (t.rowCount || 0), 0), 0)} total rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
