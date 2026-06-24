#!/usr/bin/env node
// Custom parser for BMW ETK .jetarch (JETstream) format.
// Block format (big-endian):
//   RLFF<u32>                       archive header (each .partN starts with this)
//   FILE<u16 nameLen><name><u64 size>  file metadata
//   CHNK<u64 size><bytes>           data chunk
//   CONT                            continue marker
//   SIGN<u32 sigLen><sig>           signature
//
// Usage: node jet_parse.js <baseFile> <outDir> [--list] [--small-only] [--max-mb N]

const fs = require('fs');
const path = require('path');

const ID_RLFF = Buffer.from('RLFF');
const ID_FILE = Buffer.from('FILE');
const ID_CHNK = Buffer.from('CHNK');
const ID_CONT = Buffer.from('CONT');
const ID_SIGN = Buffer.from('SIGN');

const argv = process.argv.slice(2);
const baseArg = argv[0];
const outDir = argv[1];
const listOnly = argv.includes('--list');
const smallOnly = argv.includes('--small-only');
const maxMbIdx = argv.indexOf('--max-mb');
const SMALL_THRESHOLD = (maxMbIdx >= 0 ? parseInt(argv[maxMbIdx + 1]) : 50) * 1024 * 1024;

if (!baseArg || !outDir) {
  console.error('Usage: node jet_parse.js <baseFile> <outDir> [--list] [--small-only] [--max-mb N]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

// Discover parts: <base>, <base>.part1, <base>.part2, ...
const baseDir = path.dirname(baseArg);
const baseName = path.basename(baseArg);
const parts = [baseArg];
for (let i = 1; ; i++) {
  const p = path.join(baseDir, baseName + '.part' + i);
  if (!fs.existsSync(p)) break;
  parts.push(p);
}
console.log(`Found ${parts.length} parts:`);
for (const p of parts) console.log(`  ${path.basename(p)} (${(fs.statSync(p).size/1048576).toFixed(0)} MB)`);

// Reader: provides read(n) and readId() across multiple part files
class MultiPartReader {
  constructor(parts) {
    this.parts = parts;
    this.idx = 0;
    this.fd = fs.openSync(parts[0], 'r');
    this.totalConsumed = 0;
  }
  _openNext() {
    fs.closeSync(this.fd);
    this.idx++;
    if (this.idx >= this.parts.length) { this.fd = -1; return false; }
    this.fd = fs.openSync(this.parts[this.idx], 'r');
    console.log(`  >>> advanced to ${path.basename(this.parts[this.idx])}`);
    return true;
  }
  read(n) {
    const out = Buffer.allocUnsafe(n);
    let written = 0;
    while (written < n) {
      const want = n - written;
      const tmp = Buffer.allocUnsafe(want);
      const got = fs.readSync(this.fd, tmp, 0, want, null);
      if (got === 0) {
        if (!this._openNext()) break;
        continue;
      }
      tmp.copy(out, written, 0, got);
      written += got;
      this.totalConsumed += got;
    }
    return out.subarray(0, written);
  }
  readDiscard(n) {
    let remaining = n;
    const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
    while (remaining > 0) {
      const want = Math.min(buf.length, remaining);
      const got = fs.readSync(this.fd, buf, 0, want, null);
      if (got === 0) {
        if (!this._openNext()) return n - remaining;
        continue;
      }
      remaining -= got;
      this.totalConsumed += got;
    }
    return n;
  }
  readToFd(n, outFd) {
    let remaining = n;
    const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
    while (remaining > 0) {
      const want = Math.min(buf.length, remaining);
      const got = fs.readSync(this.fd, buf, 0, want, null);
      if (got === 0) {
        if (!this._openNext()) return n - remaining;
        continue;
      }
      fs.writeSync(outFd, buf, 0, got);
      remaining -= got;
      this.totalConsumed += got;
    }
    return n;
  }
}

const r = new MultiPartReader(parts);

// Initial RLFF + version
const magic = r.read(4);
if (!magic.equals(ID_RLFF)) {
  console.error(`!! Not a jetarch (got magic ${magic.toString('hex')})`);
  process.exit(1);
}
const ver = r.read(4).readUInt32BE(0);
console.log(`RLFF v=0x${ver.toString(16)}`);

let nFiles = 0, nChunks = 0, nConts = 0, nSigns = 0, nRlffs = 1;
const filesIndex = []; // {name, size, written, outpath}
let cur = null;
const t0 = Date.now();

while (true) {
  const id = r.read(4);
  if (id.length < 4) { console.log('(EOF)'); break; }

  if (id.equals(ID_FILE)) {
    const nameLen = r.read(2).readUInt16BE(0);
    const name = r.read(nameLen).toString('latin1');
    const size = Number(r.read(8).readBigUInt64BE(0));
    nFiles++;
    if (cur && cur.fd >= 0) { fs.closeSync(cur.fd); cur.fd = -1; }
    const isDir = name.endsWith('/') || name.endsWith('\\');
    const isSmall = size <= SMALL_THRESHOLD;
    const shouldExtract = !listOnly && !isDir && (isSmall || !smallOnly);
    cur = { name, size, written: 0, fd: -1 };
    if (shouldExtract) {
      const safe = name.replace(/\\/g, '/').replace(/^\/+/, '');
      let outp = path.join(outDir, safe);
      fs.mkdirSync(path.dirname(outp), { recursive: true });
      let dup = 2;
      while (fs.existsSync(outp)) {
        outp = path.join(outDir, `${safe}.dup${dup++}`);
      }
      cur.fd = fs.openSync(outp, 'w');
      cur.outpath = outp;
    }
    filesIndex.push({ name, size, extracted: shouldExtract });
    console.log(`FILE [${nFiles}] ${JSON.stringify(name)} size=${size} small=${isSmall} extract=${shouldExtract}`);
  }
  else if (id.equals(ID_CHNK)) {
    const csz = Number(r.read(8).readBigUInt64BE(0));
    nChunks++;
    let consumed;
    if (cur && cur.fd >= 0) {
      consumed = r.readToFd(csz, cur.fd);
      cur.written += consumed;
    } else {
      consumed = r.readDiscard(csz);
    }
    if (consumed !== csz) console.log(`  ! short CHNK: ${consumed}/${csz}`);
    if (nChunks % 100 === 0) {
      const gb = r.totalConsumed / 1073741824;
      console.log(`  ... CHNK#${nChunks}, ${gb.toFixed(2)} GB read, ${((Date.now()-t0)/1000).toFixed(1)}s`);
    }
  }
  else if (id.equals(ID_CONT)) {
    nConts++;
    // Just a marker, no payload
  }
  else if (id.equals(ID_SIGN)) {
    const sl = r.read(4).readUInt32BE(0);
    r.readDiscard(sl);
    nSigns++;
  }
  else if (id.equals(ID_RLFF)) {
    const v = r.read(4).readUInt32BE(0);
    nRlffs++;
    console.log(`  (new RLFF v=0x${v.toString(16)} — part header)`);
  }
  else {
    console.log(`!! Unknown block id ${JSON.stringify(id.toString('latin1'))} = ${id.toString('hex')}`);
    // Try to scan ahead for a known marker
    break;
  }
}

if (cur && cur.fd >= 0) fs.closeSync(cur.fd);
console.log(`\n=== SUMMARY ===`);
console.log(`Files: ${nFiles}, CHNK: ${nChunks}, CONT: ${nConts}, SIGN: ${nSigns}, RLFF: ${nRlffs}`);
console.log(`Total bytes consumed: ${(r.totalConsumed/1073741824).toFixed(3)} GB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log(`\n=== UNIQUE FILE INDEX ===`);
const byName = new Map();
for (const f of filesIndex) {
  if (!byName.has(f.name)) byName.set(f.name, { sizes: [], extracted: f.extracted });
  byName.get(f.name).sizes.push(f.size);
}
for (const [name, info] of byName) {
  const ssum = info.sizes.reduce((a,b)=>a+b, 0);
  console.log(`  size=${info.sizes[0]}  occurrences=${info.sizes.length}  totalDeclared=${ssum}  ${name}`);
}
