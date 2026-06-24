// Real ISTA SSP/FUB extractor (Task #151).
//
// Downloads the pre-extracted SQLite databases from Replit Object Storage,
// probes their schema at runtime (ISTA versions may vary column names),
// then uses SQLite's ATTACH DATABASE to join DiagDocDb against
// xmlvalueprimitive_ENUS entirely inside SQLite — no in-memory text lookup
// Map, no OOM risk on the 47 GB ENUS file. Results are processed in chunks
// (LIMIT/OFFSET) and upserted into ista_ssp_records / ista_fub_records.
//
// Bucket key convention (the SQLite files live under package-name prefixes):
//   BMW_ISPI_ISTA-DATA_GLOBAL_{version}/DiagDocDb.sqlite         (required)
//   BMW_ISPI_ISTA-DATA_GLOBAL_{version}/ConWoyDb.sqlite          (optional)
//   BMW_ISPI_ISTA-DATA_GLOBAL_{version}/streamdataprimitive_OTHER.sqlite (optional)
//   BMW_ISPI_ISTA-DATA_GLOBAL_{version}/xmlvalueprimitive_OTHER.sqlite  (optional)
//   BMW_ISPI_ISTA-DATA_en-US_{version}/xmlvalueprimitive_ENUS.sqlite    (required)
//   BMW_ISPI_ISTA-DATA_en-US_{version}/streamdataprimitive_ENUS.sqlite  (optional)

import path from "path";
import { mkdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { db } from "../storage";
import { sql } from "drizzle-orm";
import { downloadToFile, exists as bucketExists, listKeys } from "../backup/object-storage";
import type { SspFubExtractor, ExtractorContext, ExtractorResult } from "./extractor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRATCH_DIR = path.join(tmpdir(), "ista-sqlite");

// Rows fetched per LIMIT/OFFSET iteration from the joined SQLite query.
// Large enough to amortize query overhead, small enough to keep heap stable.
const QUERY_CHUNK = 10_000;

// Rows accumulated before flushing to PostgreSQL.
const PG_BATCH = 500;

// FUB document type codes in ISTA. Anything NOT in this set defaults to SSP.
const SSP_DOC_TYPE_CODES = new Set([
  "SSP", "SWP", "SERVICE_PROCEDURE", "SERV_PROC",
  "SDP", "DIAGNOSTIC_PROCEDURE", "DIAGNOSTIC",
]);

// ---------------------------------------------------------------------------
// Bucket key resolution — all six files
// ---------------------------------------------------------------------------

interface SqliteFileSet {
  // Required
  diagDocDb: string;
  xmlValueEnus: string;
  // Optional (logged but not fatal if absent)
  conWoyDb: string | null;
  streamDataOther: string | null;
  xmlValueOther: string | null;
  streamDataEnus: string | null;
}

function packagePrefix(packageSuffix: string, version: string): string {
  return `BMW_ISPI_ISTA-DATA_${packageSuffix}_${version}`;
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const key of candidates) {
    if (await bucketExists(key)) return key;
  }
  return null;
}

/**
 * Resolve all six SQLite file keys for a given ISTA version. Required files
 * must be present — throws a descriptive error otherwise.
 */
async function resolveFileSet(version: string, log: (m: string) => void): Promise<SqliteFileSet> {
  const gp = packagePrefix("GLOBAL", version);
  const ep = packagePrefix("en-US",  version);

  log(`[ISTA/Extractor] Probing object storage for version ${version} …`);

  // Resolve all six concurrently to minimise round-trips
  const [diagDocDb, conWoyDb, streamDataOther, xmlValueOther, xmlValueEnus, streamDataEnus] =
    await Promise.all([
      firstExisting([`${gp}/DiagDocDb.sqlite`, `${gp}/diagdocdb.sqlite`, `ista-sqlite/${version}/GLOBAL/DiagDocDb.sqlite`]),
      firstExisting([`${gp}/ConWoyDb.sqlite`,   `ista-sqlite/${version}/GLOBAL/ConWoyDb.sqlite`]),
      firstExisting([`${gp}/streamdataprimitive_OTHER.sqlite`, `ista-sqlite/${version}/GLOBAL/streamdataprimitive_OTHER.sqlite`]),
      firstExisting([`${gp}/xmlvalueprimitive_OTHER.sqlite`,   `ista-sqlite/${version}/GLOBAL/xmlvalueprimitive_OTHER.sqlite`]),
      firstExisting([`${ep}/xmlvalueprimitive_ENUS.sqlite`,    `${ep}/xmlvalueprimitive_enus.sqlite`, `ista-sqlite/${version}/en-US/xmlvalueprimitive_ENUS.sqlite`]),
      firstExisting([`${ep}/streamdataprimitive_ENUS.sqlite`,  `ista-sqlite/${version}/en-US/streamdataprimitive_ENUS.sqlite`]),
    ]);

  // Log all six findings (required or not)
  const report = [
    `DiagDocDb: ${diagDocDb ?? "MISSING (required)"}`,
    `ConWoyDb: ${conWoyDb ?? "not found (optional)"}`,
    `streamdataprimitive_OTHER: ${streamDataOther ?? "not found (optional)"}`,
    `xmlvalueprimitive_OTHER: ${xmlValueOther ?? "not found (optional)"}`,
    `xmlvalueprimitive_ENUS: ${xmlValueEnus ?? "MISSING (required)"}`,
    `streamdataprimitive_ENUS: ${streamDataEnus ?? "not found (optional)"}`,
  ];
  log(`[ISTA/Extractor] File resolution:\n  ${report.join("\n  ")}`);

  if (!diagDocDb) {
    // Provide diagnostic listing
    try {
      const keys = await listKeys(gp);
      log(`[ISTA/Extractor] Bucket listing under ${gp}: ${keys.slice(0, 15).join(", ") || "(empty)"}`);
    } catch { /* best-effort */ }
    throw new Error(
      `Required file DiagDocDb.sqlite not found in object storage for version ${version}. ` +
      `Expected: ${gp}/DiagDocDb.sqlite`
    );
  }

  if (!xmlValueEnus) {
    try {
      const keys = await listKeys(ep);
      log(`[ISTA/Extractor] Bucket listing under ${ep}: ${keys.slice(0, 15).join(", ") || "(empty)"}`);
    } catch { /* best-effort */ }
    throw new Error(
      `Required file xmlvalueprimitive_ENUS.sqlite not found in object storage for version ${version}. ` +
      `Expected: ${ep}/xmlvalueprimitive_ENUS.sqlite`
    );
  }

  return { diagDocDb, conWoyDb, streamDataOther, xmlValueOther, xmlValueEnus, streamDataEnus };
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

async function downloadSqliteFile(
  bucketKey: string,
  localName: string,
  log: (m: string) => void,
): Promise<string> {
  await mkdir(SCRATCH_DIR, { recursive: true });
  const localPath = path.join(SCRATCH_DIR, localName);
  log(`[ISTA/Extractor] Downloading ${bucketKey} → ${localPath} …`);
  await downloadToFile(bucketKey, localPath);
  log(`[ISTA/Extractor] Download complete: ${localName}`);
  return localPath;
}

async function safeUnlink(p: string | null): Promise<void> {
  if (!p) return;
  try { await unlink(p); } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Schema probe helpers
// ---------------------------------------------------------------------------

function getTableList(sqlDb: BetterSqlite3Database): string[] {
  return (sqlDb.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all() as { name: string }[]).map((r) => r.name);
}

function getColumns(sqlDb: BetterSqlite3Database, table: string): string[] {
  return (sqlDb.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[])
    .map((r) => r.name);
}

function findTable(tables: string[], candidates: string[]): string | null {
  const upper = tables.map((t) => t.toUpperCase());
  for (const c of candidates) {
    const idx = upper.indexOf(c.toUpperCase());
    if (idx !== -1) return tables[idx];
  }
  return null;
}

function findColumn(columns: string[], candidates: string[]): string | null {
  const upper = columns.map((c) => c.toUpperCase());
  for (const c of candidates) {
    const idx = upper.indexOf(c.toUpperCase());
    if (idx !== -1) return columns[idx];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Schema probe — DiagDocDb and xmlvalueprimitive
// ---------------------------------------------------------------------------

interface DiagDbSchema {
  docTable: string;
  idCol: string;
  typeCol: string | null;
  nameIdCol: string | null;
  descIdCol: string | null;
  processCol: string | null;
  nodeCol: string | null;
  vehicleTable: string | null;
  vDocIdCol: string | null;
  vChassisCol: string | null;
}

interface XmlDbSchema {
  table: string;
  idCol: string;
  valCol: string;
}

function probeDiagDb(diagDb: BetterSqlite3Database, log: (m: string) => void): DiagDbSchema | null {
  const tables = getTableList(diagDb);
  log(`[ISTA/Extractor] DiagDocDb tables (first 30): ${tables.slice(0, 30).join(", ")}`);

  const docTable = findTable(tables, [
    "DIAGDOCUMENT", "DIAG_DOCUMENT", "DIAGDOC",
    "DOCUMENT", "SSP", "FUB", "PROCEDURE",
    "DIAGDOCTYPE", "CONTENT",
  ]);

  if (!docTable) {
    log(`[ISTA/Extractor] WARNING: No document table found. All tables: ${tables.join(", ")}`);
    return null;
  }

  const docCols = getColumns(diagDb, docTable);
  log(`[ISTA/Extractor] Document table ${docTable} columns: ${docCols.join(", ")}`);

  const idCol = findColumn(docCols, ["ID", "DOCID", "DOC_ID", "IDENT", "DIAGDOCUMENTID"]);
  if (!idCol) {
    log(`[ISTA/Extractor] WARNING: Cannot identify PK column in ${docTable}`);
    return null;
  }

  const typeCol     = findColumn(docCols, ["DOCTYPCODE", "DOCTYPE_CODE", "DOCTYPE", "TYPECODE", "TYPE_CODE", "CATEGORY"]);
  const nameIdCol   = findColumn(docCols, ["NAME_ID", "NAMEID", "NAMEPRIMID", "NAME_PRIM_ID", "TITLEID", "TITLE_ID"]);
  const descIdCol   = findColumn(docCols, ["DESCRIPTION_ID", "DESCID", "DESC_ID", "DESCPRIMID"]);
  const processCol  = findColumn(docCols, ["PROCESSTYPE", "PROCESS_TYPE", "PROCESS", "PROCEDURE_TYPE"]);
  const nodeCol     = findColumn(docCols, ["NODEID", "NODE_ID", "CONTENTID", "CONTENT_ID"]);

  const vehicleTable = findTable(tables, [
    "VEHICLECHARACTERISTIC", "VEHICLE_CHARACTERISTIC",
    "VEHICLECONTEXT", "VEHICLE_CONTEXT",
    "VEHICLEGROUP", "VEHICLE_GROUP",
    "VEHICLEAPPLICABILITY", "VEHICLE_APPLICABILITY",
    "VEHICLEDOC", "VEHICLE_DOC",
    "DOCTOVEHICLE", "DOC_TO_VEHICLE",
  ]);

  let vDocIdCol: string | null = null;
  let vChassisCol: string | null = null;

  if (vehicleTable) {
    const vCols = getColumns(diagDb, vehicleTable);
    log(`[ISTA/Extractor] Vehicle table ${vehicleTable} columns: ${vCols.join(", ")}`);
    vDocIdCol   = findColumn(vCols, ["DIAGDOCUMENT_ID", "DOC_ID", "DOCID", "DOCUMENT_ID", "FK_DOC", "DIAGDOCUMENTID"]);
    vChassisCol = findColumn(vCols, ["CHASSIS", "CHASSISCODE", "CHASSIS_CODE", "VEHICLE", "BRANDID", "E_BEZEICHNUNG", "BAUREIHE"]);
    if (!vDocIdCol || !vChassisCol) {
      log(`[ISTA/Extractor] WARNING: Vehicle table lacks expected join columns; will fall back to document-only extraction`);
    }
  }

  return { docTable, idCol, typeCol, nameIdCol, descIdCol, processCol, nodeCol, vehicleTable, vDocIdCol, vChassisCol };
}

function probeXmlDb(xmlDb: BetterSqlite3Database, log: (m: string) => void): XmlDbSchema | null {
  const tables = getTableList(xmlDb);
  log(`[ISTA/Extractor] xmlvalueprimitive tables: ${tables.slice(0, 20).join(", ")}`);

  const table = findTable(tables, [
    "XMLVALUEPRIMITIVE", "XML_VALUE_PRIMITIVE", "XMLVALUE", "TEXTPRIMITIVE", "TEXTVALUE",
  ]);

  if (!table) {
    log(`[ISTA/Extractor] WARNING: No text lookup table found in xmlvalueprimitive_ENUS`);
    return null;
  }

  const columns = getColumns(xmlDb, table);
  log(`[ISTA/Extractor] ${table} columns: ${columns.join(", ")}`);

  const idCol  = findColumn(columns, ["ID", "PRIM_ID", "TEXTID", "TEXT_ID", "KEY"]);
  const valCol = findColumn(columns, ["VALUE", "TEXT", "TEXTVALUE", "CONTENT", "LABEL"]);

  if (!idCol || !valCol) {
    log(`[ISTA/Extractor] WARNING: Cannot identify ID/VALUE columns in ${table}`);
    return null;
  }

  return { table, idCol, valCol };
}

// ---------------------------------------------------------------------------
// SSP / FUB classification
// ---------------------------------------------------------------------------

function classifyDoc(docTypeCode: string | null, processType: string | null): "ssp" | "fub" {
  if (docTypeCode) {
    const code = docTypeCode.trim().toUpperCase();
    if (SSP_DOC_TYPE_CODES.has(code)) return "ssp";
    if (code.includes("FUB") || code.includes("UMBAU") || code.includes("CONVERSION") || code.includes("RETROFIT")) {
      return "fub";
    }
  }
  if (processType) {
    const pt = processType.toUpperCase();
    if (pt.includes("RETROFIT") || pt.includes("CONVERSION") || pt.includes("UMBAU")) return "fub";
  }
  return "ssp"; // default
}

// ---------------------------------------------------------------------------
// PostgreSQL upsert
// ---------------------------------------------------------------------------

type SspRow = { version: string; istaId: string; chassis: string; docTypeCode: string | null; titleEn: string | null; descriptionEn: string | null; keywords: string | null; rawNodeId: string | null };
type FubRow = { version: string; istaId: string; chassis: string; docTypeCode: string | null; titleEn: string | null; descriptionEn: string | null; processType: string | null; rawNodeId: string | null };

async function upsertSspBatch(rows: SspRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.execute(sql`
    INSERT INTO ista_ssp_records
      (version, ista_id, chassis, doc_type_code, title_en, description_en, keywords, raw_node_id, imported_at)
    VALUES
      ${sql.join(rows.map((r) => sql`(
        ${r.version}, ${r.istaId}, ${r.chassis}, ${r.docTypeCode},
        ${r.titleEn}, ${r.descriptionEn}, ${r.keywords}, ${r.rawNodeId}, NOW()
      )`), sql`, `)}
    ON CONFLICT (version, ista_id, chassis) DO UPDATE SET
      doc_type_code  = EXCLUDED.doc_type_code,
      title_en       = EXCLUDED.title_en,
      description_en = EXCLUDED.description_en,
      keywords       = EXCLUDED.keywords,
      raw_node_id    = EXCLUDED.raw_node_id,
      imported_at    = NOW()
  `);
}

async function upsertFubBatch(rows: FubRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.execute(sql`
    INSERT INTO ista_fub_records
      (version, ista_id, chassis, doc_type_code, title_en, description_en, process_type, raw_node_id, imported_at)
    VALUES
      ${sql.join(rows.map((r) => sql`(
        ${r.version}, ${r.istaId}, ${r.chassis}, ${r.docTypeCode},
        ${r.titleEn}, ${r.descriptionEn}, ${r.processType}, ${r.rawNodeId}, NOW()
      )`), sql`, `)}
    ON CONFLICT (version, ista_id, chassis) DO UPDATE SET
      doc_type_code  = EXCLUDED.doc_type_code,
      title_en       = EXCLUDED.title_en,
      description_en = EXCLUDED.description_en,
      process_type   = EXCLUDED.process_type,
      raw_node_id    = EXCLUDED.raw_node_id,
      imported_at    = NOW()
  `);
}

// ---------------------------------------------------------------------------
// Diff accounting — compare against the latest prior successful version only
// ---------------------------------------------------------------------------

/**
 * Find the most recently finished successful ingest version before the
 * current one. Returns null if this is the very first ingest.
 */
async function findPriorVersion(currentVersion: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT version FROM ista_ingest_runs
    WHERE status = 'succeeded' AND version <> ${currentVersion}
    ORDER BY finished_at DESC
    LIMIT 1
  `);
  const r = (rows.rows as { version: string }[])[0];
  return r ? r.version : null;
}

/**
 * Load the set of (ista_id|chassis) composite keys for a specific version
 * from the given table.
 */
async function loadVersionKeys(
  table: "ista_ssp_records" | "ista_fub_records",
  version: string,
): Promise<Set<string>> {
  const rows = await db.execute(sql`
    SELECT ista_id || '|' || chassis AS key
    FROM ${sql.raw(`"${table}"`)}
    WHERE version = ${version}
  `);
  return new Set((rows.rows as { key: string }[]).map((r) => r.key));
}

// ---------------------------------------------------------------------------
// Main extraction loop using ATTACH DATABASE
// ---------------------------------------------------------------------------

interface ExtractedRow {
  docId: string;
  docTypeCode: string | null;
  chassis: string;
  titleEn: string | null;
  descEn: string | null;
  processType: string | null;
  nodeId: string | null;
}

/** Shape returned by the paginated SQLite query. All fields are nullable at
 *  the DB level because schema-probe column choices may differ per ISTA version. */
interface SqliteDocRow {
  docId: string | number | null;
  docTypeCode: string | null;
  chassis: string | null;
  titleEn: string | null;
  descEn: string | null;
  processType: string | null;
  nodeId: string | null;
}

/** Shape returned by the row-count probe query. */
interface SqliteCountRow {
  n: number;
}

/**
 * Open DiagDocDb, ATTACH xmlvalueprimitive_ENUS, and extract all
 * (document × chassis) rows with resolved English text via SQLite joins.
 * Returns the total row count and invokes `onChunk` for each batch of rows
 * so callers can upsert without holding everything in memory at once.
 */
async function extractWithAttach(
  diagLocalPath: string,
  xmlLocalPath: string,
  diagSchema: DiagDbSchema,
  xmlSchema: XmlDbSchema | null,
  log: (m: string) => void,
  onChunk: (rows: ExtractedRow[]) => Promise<void>,
): Promise<number> {
  // Open DiagDocDb NOT in readonly mode so we can execute ATTACH.
  const diagDb = new Database(diagLocalPath, { fileMustExist: true });

  // Lock the database to prevent any accidental writes.
  diagDb.pragma("query_only = ON");

  let totalRows = 0;

  try {
    // ATTACH the xmlvalueprimitive database for in-SQLite joins.
    if (xmlSchema) {
      // Escape single quotes in path (shouldn't occur in /tmp paths, but defensive)
      const escapedPath = xmlLocalPath.replace(/'/g, "''");
      diagDb.prepare(`ATTACH DATABASE '${escapedPath}' AS enus`).run();
      log(`[ISTA/Extractor] ATTACH enus DB successful`);
    }

    const { docTable, idCol, typeCol, nameIdCol, descIdCol, processCol, nodeCol, vehicleTable, vDocIdCol, vChassisCol } = diagSchema;

    // Build the SELECT clause. If we have xmlSchema + ATTACH, resolve text via JOIN.
    const hasVehicle = vehicleTable && vDocIdCol && vChassisCol;
    const hasXml     = !!xmlSchema;

    let selectParts: string;
    let fromClause: string;

    const titleJoin = hasXml && nameIdCol
      ? `LEFT JOIN "enus"."${xmlSchema!.table}" _nt ON _nt."${xmlSchema!.idCol}" = d."${nameIdCol}"`
      : "";
    const descJoin = hasXml && descIdCol
      ? `LEFT JOIN "enus"."${xmlSchema!.table}" _dt ON _dt."${xmlSchema!.idCol}" = d."${descIdCol}"`
      : "";
    const titleSel  = hasXml && nameIdCol ? `_nt."${xmlSchema!.valCol}"` : `NULL`;
    const descSel   = hasXml && descIdCol ? `_dt."${xmlSchema!.valCol}"` : `NULL`;

    if (hasVehicle) {
      selectParts = [
        `d."${idCol}" AS docId`,
        typeCol    ? `d."${typeCol}" AS docTypeCode`    : `NULL AS docTypeCode`,
        `v."${vChassisCol}" AS chassis`,
        `${titleSel} AS titleEn`,
        `${descSel} AS descEn`,
        processCol ? `d."${processCol}" AS processType` : `NULL AS processType`,
        nodeCol    ? `d."${nodeCol}" AS nodeId`         : `NULL AS nodeId`,
      ].join(", ");

      fromClause = `
        FROM "${docTable}" d
        INNER JOIN "${vehicleTable}" v ON v."${vDocIdCol}" = d."${idCol}"
        ${titleJoin}
        ${descJoin}
        WHERE v."${vChassisCol}" IS NOT NULL
      `;
    } else {
      // No vehicle-context join: chassis will be set to "UNKNOWN"
      log(`[ISTA/Extractor] No usable vehicle-context table — extracting without chassis join`);
      selectParts = [
        `d."${idCol}" AS docId`,
        typeCol    ? `d."${typeCol}" AS docTypeCode`    : `NULL AS docTypeCode`,
        `'UNKNOWN' AS chassis`,
        `${titleSel} AS titleEn`,
        `${descSel} AS descEn`,
        processCol ? `d."${processCol}" AS processType` : `NULL AS processType`,
        nodeCol    ? `d."${nodeCol}" AS nodeId`         : `NULL AS nodeId`,
      ].join(", ");

      fromClause = `
        FROM "${docTable}" d
        ${titleJoin}
        ${descJoin}
      `;
    }

    // Count total for logging
    const countStmt = diagDb.prepare(`SELECT COUNT(*) AS n ${fromClause}`);
    const countRow = countStmt.get() as SqliteCountRow;
    log(`[ISTA/Extractor] Total rows to extract: ${(countRow?.n ?? 0).toLocaleString()}`);

    // ORDER BY makes LIMIT/OFFSET iteration deterministic: without a stable
    // sort, the SQLite query planner may return rows in different orders across
    // pages, causing duplicates or gaps. docId + chassis is the same composite
    // key used for the ON CONFLICT upsert, so it's always present.
    const orderClause = `ORDER BY docId, chassis`;

    // Paginate with LIMIT/OFFSET to keep memory usage constant
    let offset = 0;
    while (true) {
      const pageStmt = diagDb.prepare(
        `SELECT DISTINCT ${selectParts} ${fromClause} ${orderClause} LIMIT ${QUERY_CHUNK} OFFSET ${offset}`
      );
      const pageRows = pageStmt.all() as SqliteDocRow[];
      if (pageRows.length === 0) break;

      const chunk: ExtractedRow[] = pageRows.map((r) => ({
        docId:      String(r.docId ?? ""),
        docTypeCode: r.docTypeCode ? String(r.docTypeCode) : null,
        chassis:    r.chassis ? String(r.chassis).trim().toUpperCase() : "UNKNOWN",
        titleEn:    r.titleEn ? String(r.titleEn) : null,
        descEn:     r.descEn  ? String(r.descEn)  : null,
        processType: r.processType ? String(r.processType) : null,
        nodeId:     r.nodeId  ? String(r.nodeId)  : null,
      }));

      await onChunk(chunk);
      totalRows += chunk.length;
      offset    += chunk.length;

      if (pageRows.length < QUERY_CHUNK) break; // Last page
      if (offset % 100_000 === 0) {
        log(`[ISTA/Extractor] Processed ${offset.toLocaleString()} rows so far …`);
      }
    }
  } finally {
    diagDb.close();
  }

  return totalRows;
}

// ---------------------------------------------------------------------------
// Main extractor implementation
// ---------------------------------------------------------------------------

export class SqliteExtractor implements SspFubExtractor {
  async extract(ctx: ExtractorContext): Promise<ExtractorResult> {
    const { version, log } = ctx;
    const warnings: string[] = [];

    log(`[ISTA/Extractor] SqliteExtractor starting for version ${version}`);

    // Step 1: Resolve all six SQLite file keys
    const fileSet = await resolveFileSet(version, log);

    // Step 2: Download the two required files sequentially (47 GB + 11 GB)
    // Downloading them one at a time avoids double peak disk usage.
    const diagLocalPath = await downloadSqliteFile(fileSet.diagDocDb, `diagdocdb_${version}.sqlite`, log);
    let xmlLocalPath: string | null = null;

    try {
      xmlLocalPath = await downloadSqliteFile(fileSet.xmlValueEnus, `xmlvalue_enus_${version}.sqlite`, log);

      // Step 3: Probe schemas (lightweight — no data reads)
      log(`[ISTA/Extractor] Probing DiagDocDb schema …`);
      const diagDb0 = new Database(diagLocalPath, { readonly: true, fileMustExist: true });
      const diagSchema = probeDiagDb(diagDb0, log);
      diagDb0.close();

      if (!diagSchema) {
        throw new Error(
          "DiagDocDb.sqlite does not contain a recognisable document table. " +
          "The ISTA schema may have changed — check the probe log above."
        );
      }

      log(`[ISTA/Extractor] Probing xmlvalueprimitive_ENUS schema …`);
      const xmlDb0  = new Database(xmlLocalPath, { readonly: true, fileMustExist: true });
      const xmlSchema = probeXmlDb(xmlDb0, log);
      xmlDb0.close();

      if (!xmlSchema) {
        warnings.push(
          "xmlvalueprimitive_ENUS.sqlite has no recognisable text table. " +
          "Records will be stored with null title/description fields."
        );
      }

      // Step 4: Load the prior version's key sets for diff accounting
      const priorVersion = await findPriorVersion(version);
      log(`[ISTA/Extractor] Prior version for diff: ${priorVersion ?? "(none — first ingest)"}`);

      const prevSspKeys = priorVersion ? await loadVersionKeys("ista_ssp_records", priorVersion) : new Set<string>();
      const prevFubKeys = priorVersion ? await loadVersionKeys("ista_fub_records", priorVersion) : new Set<string>();

      // Track the keys we actually write in this run (for removed-count)
      const currSspKeys = new Set<string>();
      const currFubKeys = new Set<string>();

      // Step 5: Extract + upsert via ATTACH DATABASE chunked loop
      const sspPerChassis: Record<string, { added: number; changed: number; removed: number }> = {};
      const fubPerChassis: Record<string, { added: number; changed: number; removed: number }> = {};
      let sspTotal = 0;
      let fubTotal = 0;

      const sspBuf: SspRow[] = [];
      const fubBuf: FubRow[] = [];

      const flushSsp = async () => {
        if (sspBuf.length === 0) return;
        await upsertSspBatch([...sspBuf]);
        sspBuf.length = 0;
      };
      const flushFub = async () => {
        if (fubBuf.length === 0) return;
        await upsertFubBatch([...fubBuf]);
        fubBuf.length = 0;
      };

      await extractWithAttach(
        diagLocalPath,
        xmlLocalPath,
        diagSchema,
        xmlSchema,
        log,
        async (chunk) => {
          for (const row of chunk) {
            if (!row.docId) continue;

            const chassis = row.chassis || "UNKNOWN";
            const diffKey = `${row.docId}|${chassis}`;
            const kind    = classifyDoc(row.docTypeCode, row.processType);

            if (kind === "ssp") {
              sspTotal++;
              currSspKeys.add(diffKey);
              if (!sspPerChassis[chassis]) sspPerChassis[chassis] = { added: 0, changed: 0, removed: 0 };
              if (prevSspKeys.has(diffKey)) {
                sspPerChassis[chassis].changed++;
              } else {
                sspPerChassis[chassis].added++;
              }
              sspBuf.push({
                version, istaId: row.docId, chassis,
                docTypeCode: row.docTypeCode,
                titleEn: row.titleEn,
                descriptionEn: row.descEn,
                keywords: null,
                rawNodeId: row.nodeId,
              });
              if (sspBuf.length >= PG_BATCH) await flushSsp();
            } else {
              fubTotal++;
              currFubKeys.add(diffKey);
              if (!fubPerChassis[chassis]) fubPerChassis[chassis] = { added: 0, changed: 0, removed: 0 };
              if (prevFubKeys.has(diffKey)) {
                fubPerChassis[chassis].changed++;
              } else {
                fubPerChassis[chassis].added++;
              }
              fubBuf.push({
                version, istaId: row.docId, chassis,
                docTypeCode: row.docTypeCode,
                titleEn: row.titleEn,
                descriptionEn: row.descEn,
                processType: row.processType,
                rawNodeId: row.nodeId,
              });
              if (fubBuf.length >= PG_BATCH) await flushFub();
            }
          }
          await flushSsp();
          await flushFub();
        },
      );

      // Final flush
      await flushSsp();
      await flushFub();

      if (sspTotal === 0 && fubTotal === 0) {
        warnings.push(
          "Extraction yielded zero SSP and FUB rows. " +
          "The schema probe may not have matched any known table/column patterns."
        );
      }

      // Step 6: Compute removed counts per chassis — keys in prev that are
      // absent from the current extraction (record-key granularity).
      Array.from(prevSspKeys).forEach((key) => {
        if (!currSspKeys.has(key)) {
          const chassis = key.split("|")[1] ?? "UNKNOWN";
          if (!sspPerChassis[chassis]) sspPerChassis[chassis] = { added: 0, changed: 0, removed: 0 };
          sspPerChassis[chassis].removed++;
        }
      });
      Array.from(prevFubKeys).forEach((key) => {
        if (!currFubKeys.has(key)) {
          const chassis = key.split("|")[1] ?? "UNKNOWN";
          if (!fubPerChassis[chassis]) fubPerChassis[chassis] = { added: 0, changed: 0, removed: 0 };
          fubPerChassis[chassis].removed++;
        }
      });

      log(`[ISTA/Extractor] Complete — SSP: ${sspTotal.toLocaleString()}, FUB: ${fubTotal.toLocaleString()}`);

      return {
        ssp: { totalRows: sspTotal, perChassis: sspPerChassis },
        fub: { totalRows: fubTotal, perChassis: fubPerChassis },
        warnings,
      };
    } finally {
      // Clean up large scratch files immediately
      await safeUnlink(diagLocalPath);
      await safeUnlink(xmlLocalPath);
      log(`[ISTA/Extractor] Scratch files cleaned up`);
    }
  }
}
