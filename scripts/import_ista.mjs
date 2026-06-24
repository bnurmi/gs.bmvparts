#!/usr/bin/env node
/**
 * import_ista.mjs — Task #124
 *
 * Idempotent upsert pipeline for ISTA+ 4.59.x data.
 *
 * What it does:
 *   1. Lists ISTA packages in the offsite S3 bucket under
 *      bmv.parts/ISTA/ISTA+ 4.59.1x (DELTA)/
 *   2. For ISTA-DATA (GLOBAL + en-US):
 *      ZIP64-aware central-directory byte-range to locate SQLite files,
 *      streams compressed bytes → inflateRaw → disk at /tmp/ista-dbs/.
 *   3. For ISTA-BLP + SDP-DELTA:
 *      Same byte-range approach for psdzdata/kiswb/<BRV>/KIS.script.
 *   4. Profiles all SQLite tables (PRAGMA table_info, SELECT count(*))
 *      and writes docs/ista-sqlite-inventory.json (up to 30 rows per table).
 *   5. Parses KIS.script HSQLDB SET TABLE … INSERT blocks to extract:
 *        STEUERGERAET      — direct ECU → part number links
 *        LOGISTISCHESTEIL  — part metadata (SACHNR)
 *        BORDNETZTEILNEHMER — ECU metadata (NAME, DIAGNOSEADRESSE)
 *   6. Upserts ista_ecu_parts rows using STEUERGERAET as the real
 *      ECU→part link (NOT a cartesian product).
 *   7. Logs before/after row counts for every destination table.
 *
 * Usage:
 *   node scripts/import_ista.mjs [--skip-extract] [--kis-only] [--dry-run]
 *
 * Env vars required:
 *   OFFSITE_BACKUP_ENDPOINT
 *   OFFSITE_BACKUP_BUCKET
 *   OFFSITE_BACKUP_ACCESS_KEY
 *   OFFSITE_BACKUP_SECRET_KEY
 *   DATABASE_URL
 */

import { S3Client, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createInflateRaw } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { mkdir, writeFile, readFile, stat, readdir } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

// ---- CLI flags ---------------------------------------------------------------
const args = process.argv.slice(2);
const SKIP_EXTRACT = args.includes("--skip-extract");
const KIS_ONLY = args.includes("--kis-only");
const DRY_RUN = args.includes("--dry-run");

// ---- S3 client setup ---------------------------------------------------------
function getS3Config() {
  const endpoint = process.env.OFFSITE_BACKUP_ENDPOINT;
  const bucket = process.env.OFFSITE_BACKUP_BUCKET;
  const accessKeyId = process.env.OFFSITE_BACKUP_ACCESS_KEY;
  const secretAccessKey = process.env.OFFSITE_BACKUP_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing S3 env vars. Need OFFSITE_BACKUP_ENDPOINT, OFFSITE_BACKUP_BUCKET, " +
      "OFFSITE_BACKUP_ACCESS_KEY, OFFSITE_BACKUP_SECRET_KEY"
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

function makeS3Client(cfg) {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: process.env.OFFSITE_BACKUP_REGION || "us-east-1",
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });
}

// ---- helpers -----------------------------------------------------------------
function log(msg) { console.log(`[ista-import] ${msg}`); }
function warn(msg) { console.warn(`[ista-import] WARN: ${msg}`); }

/**
 * Fetch a byte range from an S3 object and return as a Buffer.
 * rangeStart/rangeEnd are inclusive byte positions.
 */
async function s3GetBytes(s3, bucket, key, rangeStart, rangeEnd) {
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(rangeStart !== undefined ? { Range: `bytes=${rangeStart}-${rangeEnd}` } : {}),
  });
  const res = await s3.send(cmd);
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Stream a byte range from S3 directly to a writable stream (e.g., a file).
 * Uses createInflateRaw if decompress=true, otherwise passes bytes through.
 */
async function s3StreamBytes(s3, bucket, key, rangeStart, rangeEnd, destStream, decompress) {
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: `bytes=${rangeStart}-${rangeEnd}`,
  });
  const res = await s3.send(cmd);
  const bodyStream = Readable.from(res.Body);
  if (decompress) {
    const inflate = createInflateRaw();
    await pipeline(bodyStream, inflate, destStream);
  } else {
    await pipeline(bodyStream, destStream);
  }
}

async function s3ObjectSize(s3, bucket, key) {
  const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
  const res = await s3.send(cmd);
  return res.ContentLength || 0;
}

// ---- ZIP64-aware central directory extraction --------------------------------

/**
 * Read and parse End of Central Directory record, with ZIP64 support.
 * Returns { cdOffset, cdSize } as BigInt to handle >4GB offsets.
 *
 * Strategy:
 *  1. Fetch last 64KB (covers EOCD and most central directories).
 *  2. Locate EOCD signature 0x06054b50.
 *  3. Check whether values are 0xFFFFFFFF (ZIP64 indicator).
 *  4. If ZIP64, locate ZIP64 EOCD Locator (0x07064b50) and fetch ZIP64 EOCD.
 */
async function readCentralDirectoryInfo(s3, bucket, key, totalSize) {
  const TAIL = Math.min(65536 + 56, totalSize); // 64KB covers EOCD + ZIP64 locator
  const tailBuf = await s3GetBytes(s3, bucket, key, totalSize - TAIL, totalSize - 1);

  // Scan backwards for EOCD32 signature
  let eocd32Pos = -1;
  for (let i = tailBuf.length - 22; i >= 0; i--) {
    if (tailBuf.readUInt32LE(i) === 0x06054b50) {
      eocd32Pos = i;
      break;
    }
  }
  if (eocd32Pos < 0) throw new Error(`EOCD not found in ${key}`);

  let cdOffset = BigInt(tailBuf.readUInt32LE(eocd32Pos + 16));
  let cdSize = BigInt(tailBuf.readUInt32LE(eocd32Pos + 12));

  // Check for ZIP64 indicators
  if (cdOffset === 0xFFFFFFFFn || cdSize === 0xFFFFFFFFn) {
    // Locate ZIP64 EOCD locator (signature 0x07064b50), must be 20 bytes before EOCD32
    const locPos = eocd32Pos - 20;
    if (locPos >= 0 && tailBuf.readUInt32LE(locPos) === 0x07064b50) {
      // ZIP64 EOCD offset is at locPos+8 (8 bytes)
      const zip64EocdOffsetLow = tailBuf.readUInt32LE(locPos + 8);
      const zip64EocdOffsetHigh = tailBuf.readUInt32LE(locPos + 12);
      const zip64EocdOffset = BigInt(zip64EocdOffsetHigh) * 0x100000000n + BigInt(zip64EocdOffsetLow);

      // Fetch ZIP64 EOCD record (56 bytes minimum)
      const eocd64Start = Number(zip64EocdOffset);
      const eocd64Buf = await s3GetBytes(s3, bucket, key, eocd64Start, eocd64Start + 55);
      if (eocd64Buf.readUInt32LE(0) !== 0x06064b50) {
        throw new Error(`ZIP64 EOCD signature mismatch at offset ${eocd64Start} in ${key}`);
      }
      // Central directory size: offset 40, 8 bytes
      const cdSizeLow = eocd64Buf.readUInt32LE(40);
      const cdSizeHigh = eocd64Buf.readUInt32LE(44);
      cdSize = BigInt(cdSizeHigh) * 0x100000000n + BigInt(cdSizeLow);
      // Central directory offset: offset 48, 8 bytes
      const cdOffLow = eocd64Buf.readUInt32LE(48);
      const cdOffHigh = eocd64Buf.readUInt32LE(52);
      cdOffset = BigInt(cdOffHigh) * 0x100000000n + BigInt(cdOffLow);
    } else {
      throw new Error(`ZIP64 locator not found for ${key} — cannot read large ZIP`);
    }
  }

  return { cdOffset, cdSize };
}

/**
 * Parse all central directory entries from a buffer.
 * Returns array of { fileName, compression, compressedSize, uncompressedSize, localHeaderOffset }
 * all as BigInt where needed.
 */
function parseCentralDirectory(buf) {
  const entries = [];
  let pos = 0;
  while (pos <= buf.length - 46) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(pos + 10);
    let compressedSize = BigInt(buf.readUInt32LE(pos + 20));
    let uncompressedSize = BigInt(buf.readUInt32LE(pos + 24));
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    let localHeaderOffset = BigInt(buf.readUInt32LE(pos + 42));
    const fileName = buf.toString("utf-8", pos + 46, pos + 46 + fileNameLen);

    // Parse ZIP64 extra field if any fields are 0xFFFFFFFF
    if (compressedSize === 0xFFFFFFFFn || uncompressedSize === 0xFFFFFFFFn || localHeaderOffset === 0xFFFFFFFFn) {
      // Extra field starts at pos + 46 + fileNameLen
      let extraPos = pos + 46 + fileNameLen;
      const extraEnd = extraPos + extraLen;
      while (extraPos < extraEnd - 4) {
        const headerId = buf.readUInt16LE(extraPos);
        const dataSize = buf.readUInt16LE(extraPos + 2);
        if (headerId === 0x0001) {
          // ZIP64 extended info
          let z = extraPos + 4;
          if (uncompressedSize === 0xFFFFFFFFn && z + 8 <= extraEnd) {
            uncompressedSize = buf.readBigUInt64LE(z); z += 8;
          }
          if (compressedSize === 0xFFFFFFFFn && z + 8 <= extraEnd) {
            compressedSize = buf.readBigUInt64LE(z); z += 8;
          }
          if (localHeaderOffset === 0xFFFFFFFFn && z + 8 <= extraEnd) {
            localHeaderOffset = buf.readBigUInt64LE(z);
          }
          break;
        }
        extraPos += 4 + dataSize;
      }
    }

    entries.push({ fileName, compression, compressedSize, uncompressedSize, localHeaderOffset });
    pos += 46 + fileNameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Read local file header at localHeaderOffset to get the exact data start.
 * Local header: signature(4) + version(2) + flags(2) + compression(2) +
 *               modTime(2) + modDate(2) + crc32(4) + compressedSize(4) +
 *               uncompressedSize(4) + fileNameLen(2) + extraLen(2) = 30 bytes
 */
async function getLocalDataOffset(s3, bucket, key, localHeaderOffset) {
  const hOff = Number(localHeaderOffset);
  const headerBuf = await s3GetBytes(s3, bucket, key, hOff, hOff + 29);
  if (headerBuf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Invalid local file header at offset ${hOff} in ${path.basename(key)}`);
  }
  const fileNameLen = headerBuf.readUInt16LE(26);
  const extraLen = headerBuf.readUInt16LE(28);
  return hOff + 30 + fileNameLen + extraLen;
}

/**
 * Find a file entry in a ZIP's central directory.
 * Returns the central directory entry, or throws if not found.
 */
async function findInZip(s3, bucket, key, targetFileName, totalZipSize) {
  const { cdOffset, cdSize } = await readCentralDirectoryInfo(s3, bucket, key, totalZipSize);
  log(`  Central directory: offset=${cdOffset} size=${cdSize}`);

  // Fetch central directory — split into chunks if very large
  const MAX_CD_CHUNK = 32 * 1024 * 1024; // 32MB chunks
  const cdSizeNum = Number(cdSize);
  const cdOffNum = Number(cdOffset);

  let cdBuf;
  if (cdSizeNum <= MAX_CD_CHUNK) {
    cdBuf = await s3GetBytes(s3, bucket, key, cdOffNum, cdOffNum + cdSizeNum - 1);
  } else {
    // For very large central directories, scan in chunks to find target
    // We only need one entry so we stop as soon as found
    let found = null;
    let pos = cdOffNum;
    const end = cdOffNum + cdSizeNum;
    while (pos < end && !found) {
      const chunkEnd = Math.min(pos + MAX_CD_CHUNK - 1, end - 1);
      const chunk = await s3GetBytes(s3, bucket, key, pos, chunkEnd);
      const entries = parseCentralDirectory(chunk);
      for (const e of entries) {
        if (e.fileName === targetFileName || e.fileName.endsWith("/" + targetFileName)) {
          found = e;
          break;
        }
      }
      if (entries.length === 0) break; // couldn't parse, bail
      // Advance past the entries we parsed
      const lastEntry = entries[entries.length - 1];
      // Conservative: just advance by chunk size
      pos += MAX_CD_CHUNK;
    }
    if (!found) throw new Error(`File "${targetFileName}" not found in ZIP (large CD scan)`);
    return found;
  }

  const entries = parseCentralDirectory(cdBuf);
  const entry = entries.find(e => e.fileName === targetFileName || e.fileName.endsWith("/" + targetFileName));
  if (!entry) {
    const avail = entries.slice(0, 8).map(e => e.fileName).join(", ");
    throw new Error(`"${targetFileName}" not in ZIP central directory. First entries: ${avail}`);
  }
  return entry;
}

/**
 * Extract a single file from a remote ZIP via streaming byte-range.
 * Writes decompressed bytes directly to destPath (no full-buffer in memory).
 */
async function extractFileFromZipStreaming(s3, bucket, key, targetFileName, totalZipSize, destPath) {
  log(`  Locating ${targetFileName} …`);
  const entry = await findInZip(s3, bucket, key, targetFileName, totalZipSize);

  const dataStart = await getLocalDataOffset(s3, bucket, key, entry.localHeaderOffset);
  const dataEnd = dataStart + Number(entry.compressedSize) - 1;

  log(`  Found: compressed=${(Number(entry.compressedSize) / 1e6).toFixed(1)}MB uncompressed=${(Number(entry.uncompressedSize) / 1e6).toFixed(1)}MB compression=${entry.compression}`);

  if (DRY_RUN) {
    log(`  [dry-run] would write to ${destPath}`);
    return;
  }

  const fileStream = createWriteStream(destPath + ".tmp");
  const decompress = entry.compression === 8; // deflate
  if (entry.compression !== 0 && entry.compression !== 8) {
    throw new Error(`Unsupported compression method ${entry.compression} for ${targetFileName}`);
  }

  await s3StreamBytes(s3, bucket, key, dataStart, dataEnd, fileStream, decompress);
  // Atomic rename after successful write
  const { rename } = await import("node:fs/promises");
  await rename(destPath + ".tmp", destPath);
  log(`  Written to ${destPath} ✓`);
}

// ---- SQLite verification -----------------------------------------------------
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");
async function verifySqliteMagic(filePath) {
  try {
    const fd = await (await import("node:fs/promises")).open(filePath, "r");
    const buf = Buffer.alloc(16);
    await fd.read(buf, 0, 16, 0);
    await fd.close();
    return buf.equals(SQLITE_MAGIC);
  } catch {
    return false;
  }
}

// ---- KIS.script parsing ------------------------------------------------------
/**
 * Parse HSQLDB KIS.script for:
 *   STEUERGERAET  — direct ECU→part mapping (NAME, SACHNR)
 *   LOGISTISCHESTEIL — part metadata (ID→SACHNR)
 *   BORDNETZTEILNEHMER — ECU metadata (NAME, DIAGNOSEADRESSE, BESCHREIBUNG)
 *
 * Returns {
 *   steuergeraet: [{name, sachnr, beschreibung}],
 *   logistischesteil: [{id, sachnr, name, bestellOption}],
 *   bordnetzteilnehmer: [{name, diagnoseAdresse, beschreibung}],
 * }
 *
 * STEUERGERAET is the authoritative ECU→part link. We do NOT cartesian-product
 * LOGISTISCHESTEIL × BORDNETZTEILNEHMER.
 */
function parseKisScript(text) {
  const steuergeraet = [];
  const logistischesteil = [];
  const bordnetzteilnehmer = [];

  const lines = text.split(/\r?\n/);
  let currentTable = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tableMatch = trimmed.match(/^SET TABLE PUBLIC\.(\w+) INSERT/i);
    if (tableMatch) {
      currentTable = tableMatch[1].toUpperCase();
      continue;
    }

    if (!currentTable) continue;

    const valuesMatch = trimmed.match(/^INSERT INTO VALUES\((.+)\)$/i);
    if (!valuesMatch) continue;

    const rv = parseHsqlValues(valuesMatch[1]);

    if (currentTable === "STEUERGERAET") {
      // Typical columns: ID, NAME, SACHNR, BESCHREIBUNG, DIAGNOSEADRESSE, ...
      // We want NAME (col 1) and SACHNR (col 2).
      // Column order may vary; inspect first few columns.
      if (rv.length >= 3) {
        const name = unquote(rv[1]);
        const sachnr = unquote(rv[2]);
        const beschreibung = rv.length >= 4 ? unquote(rv[3]) : null;
        if (name && name !== "NULL" && sachnr && sachnr !== "NULL") {
          steuergeraet.push({
            name,
            sachnr: sachnr.replace(/\s+/g, ""),
            beschreibung: beschreibung || null,
          });
        }
      }
    } else if (currentTable === "LOGISTISCHESTEIL") {
      // Typical columns: ID, SACHNR, KOSTEN_FLASHEN, KOSTEN_EINBAU, NAME, BESTELLOPTION, ...
      if (rv.length >= 2) {
        const id = unquote(rv[0]);
        const sachnr = unquote(rv[1]);
        const name = rv.length >= 5 ? unquote(rv[4]) : null;
        const bestellOption = rv.length >= 6 ? unquote(rv[5]) : null;
        if (sachnr && sachnr !== "NULL") {
          logistischesteil.push({
            id,
            sachnr: sachnr.replace(/\s+/g, ""),
            name: name || null,
            bestellOption: bestellOption || null,
          });
        }
      }
    } else if (currentTable === "BORDNETZTEILNEHMER") {
      // Typical columns: ID, NAME, DIAGNOSEADRESSE, BESCHREIBUNG, ...
      if (rv.length >= 2) {
        const name = unquote(rv[1]);
        const diagnoseAdresse = rv.length >= 3 ? unquote(rv[2]) : null;
        const beschreibung = rv.length >= 4 ? unquote(rv[3]) : null;
        if (name && name !== "NULL") {
          bordnetzteilnehmer.push({
            name,
            diagnoseAdresse: diagnoseAdresse || null,
            beschreibung: beschreibung || null,
          });
        }
      }
    }
  }

  return { steuergeraet, logistischesteil, bordnetzteilnehmer };
}

function unquote(s) {
  if (!s) return null;
  const t = s.trim();
  if (t === "NULL") return null;
  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/**
 * Parse HSQLDB VALUES(...) into raw token strings.
 * Handles single-quoted strings (with '' escapes), NULL, and numbers.
 */
function parseHsqlValues(raw) {
  const values = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && (raw[i] === "," || raw[i] === " ")) i++;
    if (i >= raw.length) break;

    if (raw[i] === "'") {
      let str = "'";
      i++;
      while (i < raw.length) {
        if (raw[i] === "'" && raw[i + 1] === "'") { str += "''"; i += 2; }
        else if (raw[i] === "'") { str += "'"; i++; break; }
        else { str += raw[i]; i++; }
      }
      values.push(str);
    } else {
      let tok = "";
      while (i < raw.length && raw[i] !== ",") { tok += raw[i]; i++; }
      values.push(tok.trim());
    }
  }
  return values;
}

function cleanPartNumber(raw) {
  if (!raw) return null;
  return raw.replace(/[\s\-\.]/g, "").toUpperCase();
}

// ---- PostgreSQL upsert -------------------------------------------------------
async function ensureIstaTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ista_ecu_parts (
      id SERIAL PRIMARY KEY,
      ecu_name TEXT NOT NULL,
      brv_code TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_number_clean TEXT,
      bestell_option TEXT,
      ecu_description TEXT,
      diag_address TEXT,
      ista_version TEXT NOT NULL DEFAULT '4.59',
      imported_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ista_ecu_parts_unique_idx
      ON ista_ecu_parts (ecu_name, part_number, brv_code)
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ista_ecu_parts_ecu_idx ON ista_ecu_parts (ecu_name)`);
  await client.query(`CREATE INDEX IF NOT EXISTS ista_ecu_parts_part_idx ON ista_ecu_parts (part_number_clean)`);
  await client.query(`CREATE INDEX IF NOT EXISTS ista_ecu_parts_brv_idx ON ista_ecu_parts (brv_code)`);
}

async function upsertEcuParts(client, rows, brvCode, istaVersion) {
  if (rows.length === 0) return { upserted: 0, failed: 0 };
  const BATCH = 500;
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      try {
        await client.query(
          `INSERT INTO ista_ecu_parts
             (ecu_name, brv_code, part_number, part_number_clean, bestell_option,
              ecu_description, diag_address, ista_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (ecu_name, part_number, brv_code) DO UPDATE SET
             part_number_clean = EXCLUDED.part_number_clean,
             bestell_option = EXCLUDED.bestell_option,
             ecu_description = EXCLUDED.ecu_description,
             diag_address = EXCLUDED.diag_address,
             ista_version = EXCLUDED.ista_version,
             imported_at = NOW()`,
          [
            row.ecuName, brvCode, row.partNumber, row.partNumberClean,
            row.bestellOption || null, row.ecuDescription || null,
            row.diagAddress || null, istaVersion,
          ]
        );
        upserted++;
      } catch (e) {
        failed++;
        if (failed <= 5) warn(`Upsert failed for ${brvCode}/${row.ecuName}/${row.partNumber}: ${e.message}`);
      }
    }
  }
  if (failed > 5) warn(`  ... and ${failed - 5} more upsert failures in ${brvCode}`);
  return { upserted, failed };
}

// ---- package / BRV config ----------------------------------------------------
const ISTA_PREFIX = "bmv.parts/ISTA/ISTA+ 4.59.1x (DELTA)/";

const TARGET_PACKAGES = {
  "BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12.istapackage": {
    type: "sqlite-data",
    targetFiles: [
      "DiagDocDb.sqlite",
      "streamdataprimitive_OTHER.sqlite",
      "xmlvalueprimitive_OTHER.sqlite",
      "ConWoyDb.sqlite",
    ],
  },
  "BMW_ISPI_ISTA-DATA_en-US_4.59.12.istapackage": {
    type: "sqlite-data",
    targetFiles: [
      "streamdataprimitive_ENUS.sqlite",
      "xmlvalueprimitive_ENUS.sqlite",
    ],
  },
  "BMW_ISPI_ISTA-BLP_4.59.10.istapackage": { type: "kis-scripts" },
  "BMW_ISPI_ISTA_DELTA-SDP_4.59.11.istapackage": { type: "kis-scripts" },
};

const BRV_CODES = [
  "F001","F010","F020","F025","F056",
  "G045","G070",
  "I001","I020",
  "J001",
  "K001","KE01","KS01",
  "NA05",
  "RR21",
  "S15A","S15C","S18A",
  "U006",
  "X001","XS01",
];

// ---- main -------------------------------------------------------------------
async function main() {
  log("Starting ISTA+ 4.59.x import pipeline");
  log(`Flags: skip-extract=${SKIP_EXTRACT} kis-only=${KIS_ONLY} dry-run=${DRY_RUN}`);

  const cfg = getS3Config();
  const s3 = makeS3Client(cfg);

  const dbClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();
  log("Connected to PostgreSQL");

  await ensureIstaTable(dbClient);

  const beforeCount = (await dbClient.query("SELECT COUNT(*)::int AS c FROM ista_ecu_parts")).rows[0].c;
  log(`Before import: ${beforeCount} rows in ista_ecu_parts`);

  // Step 1: discover available packages
  log(`Listing packages at ${ISTA_PREFIX} …`);
  let availableKeys = [];
  try {
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: ISTA_PREFIX }));
    availableKeys = (listRes.Contents || []).map(o => o.Key);
    log(`Found ${availableKeys.length} objects: ${availableKeys.map(k => path.basename(k)).join(", ")}`);
  } catch (e) {
    warn(`Could not list bucket — ${e.message}`);
    availableKeys = Object.keys(TARGET_PACKAGES).map(n => ISTA_PREFIX + n);
  }

  const TMP_DBS = "/tmp/ista-dbs";
  const TMP_KIS = "/tmp/ista-kis";
  await mkdir(TMP_DBS, { recursive: true });
  await mkdir(TMP_KIS, { recursive: true });

  const extractedSqlite = {};
  const extractedKis = {};

  // Step 2: extract SQLite files from ISTA-DATA packages
  if (!SKIP_EXTRACT && !KIS_ONLY) {
    for (const [pkgName, pkgCfg] of Object.entries(TARGET_PACKAGES)) {
      if (pkgCfg.type !== "sqlite-data") continue;
      const key = availableKeys.find(k => k.endsWith(pkgName));
      if (!key) { warn(`Package not found: ${pkgName}`); continue; }

      log(`Processing SQLite package: ${pkgName}`);
      let zipSize;
      try {
        zipSize = await s3ObjectSize(s3, cfg.bucket, key);
        log(`  ZIP size: ${(zipSize / 1e9).toFixed(2)} GB`);
      } catch (e) { warn(`  Cannot HEAD ${key}: ${e.message}`); continue; }

      for (const targetFile of pkgCfg.targetFiles) {
        const destPath = path.join(TMP_DBS, targetFile);
        if (existsSync(destPath)) {
          log(`  ${targetFile} already extracted — skipping`);
          extractedSqlite[targetFile] = destPath;
          continue;
        }
        try {
          await extractFileFromZipStreaming(s3, cfg.bucket, key, targetFile, zipSize, destPath);
          if (!DRY_RUN && !await verifySqliteMagic(destPath)) {
            warn(`  ${targetFile}: SQLite magic bytes not found — removing`);
            await (await import("node:fs/promises")).unlink(destPath);
            continue;
          }
          extractedSqlite[targetFile] = destPath;
        } catch (e) {
          warn(`  Failed to extract ${targetFile}: ${e.message}`);
        }
      }
    }
  }

  // Step 3: extract KIS.script files from BLP + SDP-DELTA
  if (!SKIP_EXTRACT) {
    for (const [pkgName, pkgCfg] of Object.entries(TARGET_PACKAGES)) {
      if (pkgCfg.type !== "kis-scripts") continue;
      const key = availableKeys.find(k => k.endsWith(pkgName));
      if (!key) { warn(`Package not found: ${pkgName}`); continue; }

      log(`Processing KIS package: ${pkgName}`);
      let zipSize;
      try {
        zipSize = await s3ObjectSize(s3, cfg.bucket, key);
        log(`  ZIP size: ${(zipSize / 1e9).toFixed(2)} GB`);
      } catch (e) { warn(`  Cannot HEAD ${key}: ${e.message}`); continue; }

      for (const brv of BRV_CODES) {
        const targetFile = `psdzdata/kiswb/${brv}/KIS.script`;
        const destPath = path.join(TMP_KIS, `${path.basename(pkgName, ".istapackage")}_${brv}_KIS.script`);
        if (existsSync(destPath)) {
          log(`  KIS/${brv} already extracted from ${path.basename(pkgName)}`);
          extractedKis[`${pkgName}/${brv}`] = destPath;
          continue;
        }
        try {
          await extractFileFromZipStreaming(s3, cfg.bucket, key, targetFile, zipSize, destPath);
          extractedKis[`${pkgName}/${brv}`] = destPath;
        } catch (e) {
          if (!e.message.includes("not in ZIP")) {
            warn(`  ${brv}/KIS.script: ${e.message}`);
          }
        }
      }
    }
  } else {
    // Collect pre-extracted KIS.script files
    if (existsSync(TMP_KIS)) {
      const files = await readdir(TMP_KIS);
      for (const f of files) {
        if (f.endsWith("_KIS.script")) {
          extractedKis[f] = path.join(TMP_KIS, f);
        }
      }
      log(`Found ${Object.keys(extractedKis).length} pre-extracted KIS.script files`);
    }
  }

  // Step 4: profile SQLite tables
  if (!KIS_ONLY && Object.keys(extractedSqlite).length > 0) {
    log("Profiling extracted SQLite databases …");
    const { execFileSync } = await import("node:child_process");
    const inventory = [];
    for (const [name, dbPath] of Object.entries(extractedSqlite)) {
      if (!existsSync(dbPath)) continue;
      const uri = `file:${dbPath}?mode=ro&immutable=1`;
      try {
        const tablesRaw = execFileSync("sqlite3", ["-json", "-readonly", uri,
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"],
          { maxBuffer: 256 * 1024 * 1024, encoding: "utf-8" }).trim();
        const tables = tablesRaw ? JSON.parse(tablesRaw) : [];
        const tableInfo = [];
        for (const t of tables) {
          const colRaw = execFileSync("sqlite3", ["-json", "-readonly", uri,
            `PRAGMA table_info("${t.name.replace(/"/g, '""')}")`],
            { maxBuffer: 32 * 1024 * 1024, encoding: "utf-8" }).trim();
          const cols = colRaw ? JSON.parse(colRaw) : [];
          let rowCount = 0;
          try {
            const cntRaw = execFileSync("sqlite3", ["-json", "-readonly", uri,
              `SELECT COUNT(*) AS c FROM "${t.name.replace(/"/g, '""')}"`],
              { maxBuffer: 16 * 1024, encoding: "utf-8" }).trim();
            rowCount = cntRaw ? Number(JSON.parse(cntRaw)[0]?.c) : 0;
          } catch {}
          let sample = [];
          try {
            const sampleRaw = execFileSync("sqlite3", ["-json", "-readonly", uri,
              `SELECT * FROM "${t.name.replace(/"/g, '""')}" LIMIT 10`],
              { maxBuffer: 4 * 1024 * 1024, encoding: "utf-8" }).trim();
            sample = sampleRaw ? JSON.parse(sampleRaw) : [];
          } catch {}
          tableInfo.push({ name: t.name, rowCount, columns: cols.map(c => c.name), sample });
        }
        inventory.push({ file: name, path: dbPath, tables: tableInfo });
        log(`  ${name}: ${tableInfo.length} tables`);
      } catch (e) {
        warn(`  ${name}: profile failed — ${e.message}`);
      }
    }
    const invPath = path.join(ROOT, "docs", "ista-sqlite-inventory.json");
    if (!DRY_RUN) {
      await writeFile(invPath, JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2));
      log(`Wrote inventory to ${invPath}`);

      // Write human-readable markdown summary alongside the JSON inventory
      const mdLines = [
        "# ISTA+ SQLite Database Inventory",
        "",
        `Generated: ${new Date().toISOString()}`,
        "",
        "This file is auto-generated by `scripts/import_ista.mjs` during the ISTA+ import.",
        "It lists every table found in the extracted SQLite databases, including row counts",
        "and column names, so we can identify which tables carry SA codes, paint codes,",
        "upholstery codes, and other importable data.",
        "",
      ];
      for (const db of inventory) {
        mdLines.push(`## ${db.file}`);
        mdLines.push("");
        if (db.tables.length === 0) {
          mdLines.push("_(no tables found)_");
        } else {
          mdLines.push("| Table | Rows | Columns |");
          mdLines.push("|-------|-----:|---------|");
          for (const t of db.tables) {
            const cols = t.columns.join(", ");
            mdLines.push(`| \`${t.name}\` | ${t.rowCount.toLocaleString()} | ${cols || "—"} |`);
          }
        }
        mdLines.push("");
      }
      const mdPath = path.join(ROOT, "docs", "ista-sqlite-inventory.md");
      await writeFile(mdPath, mdLines.join("\n"));
      log(`Wrote markdown inventory to ${mdPath}`);
    }
  }

  // Step 4b: Import SA/paint/upholstery codes from DiagDocDb.sqlite
  // DiagDocDb.sqlite contains option-code metadata tables. We scan the
  // inventory for candidate table names, then upsert to sa_codes, paint_codes
  // and upholstery_codes in PostgreSQL. All known candidate table names are
  // tried; missing tables are skipped silently.
  const sqliteImportStats = {};
  if (!KIS_ONLY) {
    const diagDbPath = path.join(TMP_DBS, "DiagDocDb.sqlite");
    if (existsSync(diagDbPath)) {
      log("Importing SA/paint/upholstery codes from DiagDocDb.sqlite …");
      const { execFileSync } = await import("node:child_process");
      const uri = `file:${diagDbPath}?mode=ro&immutable=1`;

      // Helper: run sqlite3 query and return parsed JSON rows
      function sqQuery(query, maxBuf = 32 * 1024 * 1024) {
        try {
          const raw = execFileSync("sqlite3", ["-json", "-readonly", uri, query],
            { maxBuffer: maxBuf, encoding: "utf-8" }).trim();
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          warn(`sqlite3 query failed: ${e.message.slice(0, 120)}`);
          return null; // null = table/column not found
        }
      }

      // Get available table names for candidate matching
      const allTablesRaw = sqQuery("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      const allTableNames = new Set((allTablesRaw || []).map(r => (r.name || "").toUpperCase()));
      log(`  DiagDocDb has ${allTableNames.size} tables`);

      // ---- SA codes (Sonderausstattung) ------------------------------------
      // ISTA stores SA codes in various table names depending on version.
      const SA_TABLE_CANDIDATES = [
        "COUPLERCODE", "SONDERAUSSTATTUNG", "AUSSTATTUNG",
        "OPTIONCODE", "OPTION_CODE", "SA_CODE", "SACODE",
        "FAHRZEUGAUFTRAG_SONDERAUSSTATTUNG",
      ];
      const saTableName = SA_TABLE_CANDIDATES.find(t => allTableNames.has(t));
      if (saTableName) {
        log(`  SA codes table: ${saTableName}`);
        const cols = sqQuery(`PRAGMA table_info("${saTableName}")`);
        const colNames = (cols || []).map(c => c.name?.toUpperCase());
        // Find code column (first text-like primary key or CODE/ID column)
        const codeCol = colNames.find(c => c === "CODE" || c === "SACODE" || c === "SA_CODE") || colNames[0];
        const descCol = colNames.find(c => c.includes("NAME") || c.includes("BESCHREIBUNG") || c.includes("DESCRIPTION")) || null;
        const catCol = colNames.find(c => c.includes("CATEGOR") || c.includes("GRUPPE") || c.includes("TYP")) || null;
        const rows = sqQuery(`SELECT * FROM "${saTableName}" LIMIT 50000`);
        if (rows && rows.length > 0) {
          let saUpserted = 0, saFailed = 0;
          for (const row of rows) {
            const code = String(row[codeCol] || row[Object.keys(row)[0]] || "").trim();
            if (!code || code === "NULL") continue;
            const nameVal = descCol ? (row[descCol] || null) : null;
            const cat = catCol ? (row[catCol] || null) : null;
            try {
              if (!DRY_RUN) {
                await dbClient.query(`
                  INSERT INTO sa_codes (code, category, names)
                  VALUES ($1,$2,$3::jsonb)
                  ON CONFLICT (code) DO UPDATE SET
                    category = COALESCE(EXCLUDED.category, sa_codes.category),
                    names = CASE WHEN EXCLUDED.names != '{}'::jsonb THEN EXCLUDED.names ELSE sa_codes.names END,
                    updated_at = NOW()`,
                  [code, cat || null, nameVal ? JSON.stringify({ ista: String(nameVal) }) : "{}"]
                );
              }
              saUpserted++;
            } catch (e) {
              saFailed++;
              if (saFailed <= 3) warn(`  sa_codes upsert failed: ${e.message.slice(0, 80)}`);
            }
          }
          log(`  sa_codes: upserted=${saUpserted} failed=${saFailed} (source: ${saTableName})`);
          sqliteImportStats.sa_codes = { upserted: saUpserted, failed: saFailed, source: saTableName };
        } else {
          log(`  ${saTableName}: 0 rows`);
        }
      } else {
        log(`  No SA code table found in DiagDocDb (tried: ${SA_TABLE_CANDIDATES.join(", ")})`);
        sqliteImportStats.sa_codes = { upserted: 0, failed: 0, source: null };
      }

      // ---- Paint codes (Farbcodes) -----------------------------------------
      const PAINT_TABLE_CANDIDATES = [
        "FARBCODE", "FARBE", "LACKIERUNG", "PAINTCODE", "PAINT_CODE",
        "COLOUR_CODE", "COLORCODE", "COLOR_CODE",
      ];
      const paintTableName = PAINT_TABLE_CANDIDATES.find(t => allTableNames.has(t));
      if (paintTableName) {
        log(`  Paint codes table: ${paintTableName}`);
        const cols = sqQuery(`PRAGMA table_info("${paintTableName}")`);
        const colNames = (cols || []).map(c => c.name?.toUpperCase());
        const codeCol = colNames.find(c => c === "CODE" || c === "FARBCODE" || c === "PAINTCODE") || colNames[0];
        const descCol = colNames.find(c => c.includes("NAME") || c.includes("BESCHREIBUNG")) || null;
        const rows = sqQuery(`SELECT * FROM "${paintTableName}" LIMIT 10000`);
        if (rows && rows.length > 0) {
          let pUpserted = 0, pFailed = 0;
          for (const row of rows) {
            const code = String(row[codeCol] || row[Object.keys(row)[0]] || "").trim();
            if (!code || code === "NULL") continue;
            const nameVal = descCol ? (row[descCol] || null) : null;
            try {
              if (!DRY_RUN) {
                await dbClient.query(`
                  INSERT INTO paint_codes (code, names)
                  VALUES ($1,$2::jsonb)
                  ON CONFLICT (code) DO UPDATE SET
                    names = CASE WHEN EXCLUDED.names != '{}'::jsonb THEN EXCLUDED.names ELSE paint_codes.names END,
                    updated_at = NOW()`,
                  [code, nameVal ? JSON.stringify({ ista: String(nameVal) }) : "{}"]
                );
              }
              pUpserted++;
            } catch (e) {
              pFailed++;
              if (pFailed <= 3) warn(`  paint_codes upsert failed: ${e.message.slice(0, 80)}`);
            }
          }
          log(`  paint_codes: upserted=${pUpserted} failed=${pFailed} (source: ${paintTableName})`);
          sqliteImportStats.paint_codes = { upserted: pUpserted, failed: pFailed, source: paintTableName };
        } else {
          log(`  ${paintTableName}: 0 rows`);
        }
      } else {
        log(`  No paint code table found in DiagDocDb (tried: ${PAINT_TABLE_CANDIDATES.join(", ")})`);
        sqliteImportStats.paint_codes = { upserted: 0, failed: 0, source: null };
      }

      // ---- Upholstery codes (Polstercodes) ---------------------------------
      const UPHOLSTERY_TABLE_CANDIDATES = [
        "POLSTERCODE", "POLSTER", "INNENAUSSTATTUNG", "UPHOLSTERYCODE",
        "UPHOLSTERY_CODE", "INTERIOR_CODE", "INTERIORCODE",
      ];
      const uphTableName = UPHOLSTERY_TABLE_CANDIDATES.find(t => allTableNames.has(t));
      if (uphTableName) {
        log(`  Upholstery codes table: ${uphTableName}`);
        const cols = sqQuery(`PRAGMA table_info("${uphTableName}")`);
        const colNames = (cols || []).map(c => c.name?.toUpperCase());
        const codeCol = colNames.find(c => c === "CODE" || c.includes("POLSTER") || c.includes("UPHOLSTERY")) || colNames[0];
        const descCol = colNames.find(c => c.includes("NAME") || c.includes("BESCHREIBUNG")) || null;
        const rows = sqQuery(`SELECT * FROM "${uphTableName}" LIMIT 10000`);
        if (rows && rows.length > 0) {
          let uUpserted = 0, uFailed = 0;
          for (const row of rows) {
            const code = String(row[codeCol] || row[Object.keys(row)[0]] || "").trim();
            if (!code || code === "NULL") continue;
            const nameVal = descCol ? (row[descCol] || null) : null;
            try {
              if (!DRY_RUN) {
                await dbClient.query(`
                  INSERT INTO upholstery_codes (code, names)
                  VALUES ($1,$2::jsonb)
                  ON CONFLICT (code) DO UPDATE SET
                    names = CASE WHEN EXCLUDED.names != '{}'::jsonb THEN EXCLUDED.names ELSE upholstery_codes.names END,
                    updated_at = NOW()`,
                  [code, nameVal ? JSON.stringify({ ista: String(nameVal) }) : "{}"]
                );
              }
              uUpserted++;
            } catch (e) {
              uFailed++;
              if (uFailed <= 3) warn(`  upholstery_codes upsert failed: ${e.message.slice(0, 80)}`);
            }
          }
          log(`  upholstery_codes: upserted=${uUpserted} failed=${uFailed} (source: ${uphTableName})`);
          sqliteImportStats.upholstery_codes = { upserted: uUpserted, failed: uFailed, source: uphTableName };
        } else {
          log(`  ${uphTableName}: 0 rows`);
        }
      } else {
        log(`  No upholstery code table found in DiagDocDb (tried: ${UPHOLSTERY_TABLE_CANDIDATES.join(", ")})`);
        sqliteImportStats.upholstery_codes = { upserted: 0, failed: 0, source: null };
      }
    } else {
      log("DiagDocDb.sqlite not yet extracted — skipping SA/paint/upholstery import (run without --skip-extract first)");
    }
  }

  // Step 5-7: parse KIS.script, build real ECU→part mappings, upsert
  let totalKisFiles = 0;
  let totalUpserted = 0;
  let totalFailed = 0;
  const brvStats = {};

  const kisFiles = Object.values(extractedKis);
  log(`Parsing ${kisFiles.length} KIS.script files …`);

  for (const kisPath of kisFiles) {
    if (!existsSync(kisPath)) continue;
    const filename = path.basename(kisPath);
    const brvMatch = filename.match(/_([A-Z0-9]{3,4})_KIS\.script$/);
    const brvCode = brvMatch ? brvMatch[1] : "UNKNOWN";

    let text;
    try {
      text = await readFile(kisPath, "utf-8");
    } catch (e) {
      warn(`Cannot read ${kisPath}: ${e.message}`);
      continue;
    }

    const { steuergeraet, logistischesteil, bordnetzteilnehmer } = parseKisScript(text);

    // Build ECU metadata map for enrichment
    const ecuMeta = new Map();
    for (const bn of bordnetzteilnehmer) {
      ecuMeta.set(bn.name, bn);
    }

    // Build part metadata map for enrichment
    const partMeta = new Map();
    for (const lt of logistischesteil) {
      partMeta.set(lt.sachnr, lt);
    }

    log(`  ${brvCode}: STEUERGERAET=${steuergeraet.length} LOGISTISCHESTEIL=${logistischesteil.length} BORDNETZTEILNEHMER=${bordnetzteilnehmer.length}`);

    // Use STEUERGERAET rows as the definitive ECU→part link
    const rows = steuergeraet.map(sg => {
      const meta = ecuMeta.get(sg.name) || {};
      const partM = partMeta.get(sg.sachnr) || {};
      return {
        ecuName: sg.name,
        partNumber: sg.sachnr,
        partNumberClean: cleanPartNumber(sg.sachnr),
        bestellOption: partM.bestellOption || null,
        ecuDescription: sg.beschreibung || meta.beschreibung || null,
        diagAddress: meta.diagnoseAdresse || null,
      };
    });

    totalKisFiles++;

    if (!DRY_RUN && rows.length > 0) {
      const { upserted, failed } = await upsertEcuParts(dbClient, rows, brvCode, "4.59");
      totalUpserted += upserted;
      totalFailed += failed;
      brvStats[brvCode] = { steuergeraet: steuergeraet.length, upserted, failed };
    } else {
      brvStats[brvCode] = { steuergeraet: steuergeraet.length, upserted: 0, failed: 0 };
    }
  }

  // Step 8: log before/after summary + emit structured telemetry JSON
  const afterCount = (await dbClient.query("SELECT COUNT(*)::int AS c FROM ista_ecu_parts")).rows[0].c;
  const delta = afterCount - beforeCount;

  // Tally all upserted rows across both KIS and SQLite sources
  const sqliteUpserted = Object.values(sqliteImportStats).reduce((acc, s) => acc + (s.upserted || 0), 0);
  const grandTotalUpserted = totalUpserted + sqliteUpserted;

  log("=== Import summary ===");
  log(`  SQLite files extracted: ${Object.keys(extractedSqlite).length}`);
  log(`  KIS.script files parsed: ${totalKisFiles}`);
  log(`  ista_ecu_parts: ${beforeCount} → ${afterCount} (${delta >= 0 ? "+" : ""}${delta} rows)`);
  if (sqliteImportStats.sa_codes) {
    log(`  sa_codes: upserted=${sqliteImportStats.sa_codes.upserted} source=${sqliteImportStats.sa_codes.source ?? "none"}`);
  }
  if (sqliteImportStats.paint_codes) {
    log(`  paint_codes: upserted=${sqliteImportStats.paint_codes.upserted} source=${sqliteImportStats.paint_codes.source ?? "none"}`);
  }
  if (sqliteImportStats.upholstery_codes) {
    log(`  upholstery_codes: upserted=${sqliteImportStats.upholstery_codes.upserted} source=${sqliteImportStats.upholstery_codes.source ?? "none"}`);
  }
  log(`  Total upserted: ${grandTotalUpserted}  failed: ${totalFailed}`);
  if (Object.keys(brvStats).length > 0) {
    log("  BRV breakdown:");
    for (const [brv, s] of Object.entries(brvStats)) {
      log(`    ${brv}: STEUERGERAET=${s.steuergeraet} upserted=${s.upserted} failed=${s.failed}`);
    }
  }
  if (DRY_RUN) log("  (DRY RUN — no data written to DB or disk)");

  // Build per-BRV chassis coverage map: brv → { ecuParts, steuergeraet }
  // The BRV code (e.g. "F001") identifies the chassis group. Each row in
  // ista_ecu_parts carries brv_code so consumers can filter by chassis.
  const brvCoverage = {};
  for (const [brv, s] of Object.entries(brvStats)) {
    brvCoverage[brv] = { ecuPartsUpserted: s.upserted, steuergeraet: s.steuergeraet };
  }

  // Per-package telemetry so the admin UI can show import status per file.
  // Categories: kis (BLP/SDP-DELTA), sqlite (DATA GLOBAL/en-US), meta (manifests).
  // KIS package attribution: extractedKis keys are "pkgName/brvCode".
  const blpName    = "BMW_ISPI_ISTA-BLP_4.59.10.istapackage";
  const sdpName    = "BMW_ISPI_ISTA_DELTA-SDP_4.59.11.istapackage";
  const globalName = "BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12.istapackage";
  const enUsName   = "BMW_ISPI_ISTA-DATA_en-US_4.59.12.istapackage";

  // Count BRV groups and upserted rows per KIS package
  const blpBrvKeys = Object.keys(extractedKis).filter(k => k.startsWith(blpName + "/"));
  const sdpBrvKeys = Object.keys(extractedKis).filter(k => k.startsWith(sdpName + "/"));
  // BRV stats: partition by which package contributed the BRV
  const blpBrvCodes = new Set(blpBrvKeys.map(k => k.split("/")[1]));
  const sdpBrvCodes = new Set(sdpBrvKeys.map(k => k.split("/")[1]));
  let blpUpserted = 0, sdpUpserted = 0;
  for (const [brv, s] of Object.entries(brvStats)) {
    if (blpBrvCodes.has(brv)) blpUpserted += s.upserted;
    else if (sdpBrvCodes.has(brv)) sdpUpserted += s.upserted;
    else blpUpserted += s.upserted; // fallback: attribute to BLP (pre-extracted files)
  }

  // SQLite package attribution: check which db files came from which package
  const globalFiles = ["DiagDocDb.sqlite","streamdataprimitive_OTHER.sqlite","xmlvalueprimitive_OTHER.sqlite","ConWoyDb.sqlite"];
  const enUsFiles   = ["streamdataprimitive_ENUS.sqlite","xmlvalueprimitive_ENUS.sqlite"];
  const hasGlobal   = globalFiles.some(f => extractedSqlite[f]);
  const hasEnUs     = enUsFiles.some(f => extractedSqlite[f]);

  const packageTelemetry = [
    {
      name: blpName,
      category: "kis",
      brvCount: blpBrvCodes.size || Object.keys(brvStats).length,
      ecuPartsUpserted: blpUpserted,
      status: (blpBrvKeys.length > 0 || (blpBrvCodes.size === 0 && totalKisFiles > 0)) ? "imported" : "skipped",
    },
    {
      name: sdpName,
      category: "kis",
      brvCount: sdpBrvCodes.size,
      ecuPartsUpserted: sdpUpserted,
      status: sdpBrvKeys.length > 0 ? "imported" : (KIS_ONLY ? "skipped" : "not extracted"),
    },
    {
      name: globalName,
      category: "sqlite",
      saCodesUpserted: sqliteImportStats.sa_codes?.upserted ?? 0,
      paintCodesUpserted: sqliteImportStats.paint_codes?.upserted ?? 0,
      upholsteryCodesUpserted: sqliteImportStats.upholstery_codes?.upserted ?? 0,
      status: hasGlobal ? "imported" : "skipped",
    },
    {
      name: enUsName,
      category: "sqlite",
      filesExtracted: enUsFiles.filter(f => extractedSqlite[f]).length,
      status: hasEnUs ? "imported" : "skipped",
    },
  ];

  // ISTA-contributed row counts per destination table.
  // These are the rows actually written by this import run, not global totals.
  const tableCounts = {
    ista_ecu_parts: delta > 0 ? delta : totalUpserted,
    sa_codes: sqliteImportStats.sa_codes?.upserted ?? 0,
    paint_codes: sqliteImportStats.paint_codes?.upserted ?? 0,
    upholstery_codes: sqliteImportStats.upholstery_codes?.upserted ?? 0,
  };

  // Emit single structured JSON line for the routes.ts parser to extract.
  // Must be on its own line with a unique prefix.
  const summaryJson = {
    totalUpserted: grandTotalUpserted,
    tableCounts,
    brvCoverage,
    packageTelemetry,
    completedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
  };
  console.log(`[ISTA-SUMMARY-JSON] ${JSON.stringify(summaryJson)}`);

  await dbClient.end();
  log("Done.");
}

main().catch(e => {
  console.error("[ista-import] Fatal:", e);
  process.exit(1);
});
