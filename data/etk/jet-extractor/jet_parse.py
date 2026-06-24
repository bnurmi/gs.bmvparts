#!/usr/bin/env python3
"""
Custom parser for BMW ETK .jetarch (JETstream) format.

Block structure (all integers big-endian):
  RLFF<u32 version>                            -- archive header (only at start of base file)
  FILE<u16 name-len><name><u64 file-size>      -- file metadata header
  CHNK<u64 chunk-size><bytes>                  -- a chunk of the current file's data
  CONT<...>                                    -- continue marker (file spans to next part)
  SIGN<u32 sig-len><sig-bytes>                 -- signature block

A logical file may have multiple CHNK blocks (especially if it spans .partN files).
"""
import os, sys, struct
from pathlib import Path

ID_RLFF = b"RLFF"
ID_FILE = b"FILE"
ID_CHNK = b"CHNK"
ID_CONT = b"CONT"
ID_SIGN = b"SIGN"

class JetReader:
    def __init__(self, base_path):
        self.base = Path(base_path)
        self.parts = [self.base]
        i = 1
        while True:
            p = self.base.parent / (self.base.name + f".part{i}")
            if not p.exists(): break
            self.parts.append(p)
            i += 1
        self.part_idx = 0
        self.fh = open(self.parts[0], "rb")
        self.total_consumed = 0  # bytes read across all parts

    def _open_next(self):
        self.fh.close()
        self.part_idx += 1
        if self.part_idx >= len(self.parts):
            return False
        self.fh = open(self.parts[self.part_idx], "rb")
        return True

    def read(self, n):
        out = b""
        while n > 0:
            chunk = self.fh.read(n)
            if not chunk:
                if not self._open_next():
                    break
                continue
            out += chunk
            n -= len(chunk)
            self.total_consumed += len(chunk)
        return out

    def peek4(self):
        pos = self.fh.tell()
        b = self.fh.read(4)
        if len(b) < 4:
            # try next part
            if self._open_next():
                self.fh.seek(0)
                b = self.fh.read(4)
            if len(b) < 4:
                return None
        else:
            self.fh.seek(pos)
            return b
        # if we crossed parts, don't seek back; just return
        self.fh.seek(self.fh.tell() - len(b))
        return b

    def at_end(self):
        # at end if all parts exhausted
        pos = self.fh.tell()
        b = self.fh.read(1)
        if not b:
            if not self._open_next():
                return True
            pos = self.fh.tell()
            b = self.fh.read(1)
            if not b:
                return True
        self.fh.seek(pos)
        return False

def main():
    base = sys.argv[1]
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    extract_small_only = "--small-only" in sys.argv
    list_only = "--list" in sys.argv
    SMALL_THRESHOLD = 50 * 1024 * 1024  # 50 MB

    r = JetReader(base)
    print(f"Found {len(r.parts)} parts:", *[p.name for p in r.parts], sep="\n  ")

    # First read RLFF magic
    magic = r.read(4)
    if magic != ID_RLFF:
        print(f"!! Not a jetarch (no RLFF magic, got {magic!r})")
        sys.exit(1)
    version = struct.unpack(">I", r.read(4))[0]
    print(f"RLFF archive, version field = 0x{version:08x}")

    # Walk blocks
    files_seen = []
    current_file = None  # dict: name, size, written, fh
    n_files = 0
    n_chunks = 0
    n_signs = 0
    n_conts = 0

    while True:
        bid = r.read(4)
        if len(bid) < 4:
            print("(eof)")
            break

        if bid == ID_FILE:
            name_len = struct.unpack(">H", r.read(2))[0]
            name = r.read(name_len).decode("latin-1")
            size = struct.unpack(">Q", r.read(8))[0]
            n_files += 1
            print(f"FILE [{n_files}] name={name!r} size={size}")
            # Close previous file if any
            if current_file and current_file.get("fh"):
                current_file["fh"].close()
            extract_this = (size <= SMALL_THRESHOLD or not extract_small_only) and not list_only
            current_file = {"name": name, "size": size, "written": 0, "fh": None, "extract": extract_this}
            files_seen.append((name, size))
            if extract_this:
                # Sanitize path
                safe = name.replace("\\", "/").lstrip("/")
                outp = out_dir / safe
                outp.parent.mkdir(parents=True, exist_ok=True)
                # If file already exists (rare), append a suffix
                if outp.exists():
                    suffix = 2
                    while (out_dir / f"{safe}.dup{suffix}").exists():
                        suffix += 1
                    outp = out_dir / f"{safe}.dup{suffix}"
                current_file["fh"] = open(outp, "wb")
                current_file["outpath"] = outp

        elif bid == ID_CHNK:
            chunk_size = struct.unpack(">Q", r.read(8))[0]
            n_chunks += 1
            # Read chunk data
            remaining = chunk_size
            buf_size = 4 * 1024 * 1024
            while remaining > 0:
                want = min(buf_size, remaining)
                data = r.read(want)
                if not data:
                    print(f"  !! short read in CHNK: missing {remaining} bytes")
                    break
                if current_file and current_file.get("fh"):
                    current_file["fh"].write(data)
                    current_file["written"] += len(data)
                remaining -= len(data)
            if current_file:
                pct = 100.0 * current_file["written"] / max(1, current_file["size"])
                if n_chunks % 50 == 0 or current_file["written"] >= current_file["size"]:
                    print(f"  CHNK #{n_chunks} +{chunk_size} -> {current_file['name']} ({current_file['written']}/{current_file['size']} = {pct:.1f}%)")

        elif bid == ID_CONT:
            n_conts += 1
            # CONT marker: just continues to next part. May have a length prefix?
            # Looking at the format, CONT seems to be a marker that the file continues.
            # No payload (the next CHNK in next part has the data).
            # But peek to see what follows.
            print(f"CONT #{n_conts}")

        elif bid == ID_SIGN:
            sig_len = struct.unpack(">I", r.read(4))[0]
            sig_data = r.read(sig_len)
            n_signs += 1
            if n_signs <= 3:
                print(f"SIGN #{n_signs} len={sig_len}")

        elif bid == ID_RLFF:
            # New part header (each .partN starts with RLFF<version>)
            ver = struct.unpack(">I", r.read(4))[0]
            print(f"  (new part RLFF, ver=0x{ver:08x})")

        else:
            print(f"!! Unknown block id at offset {r.fh.tell()-4}: {bid!r}")
            # Try to recover by scanning for next known block
            break

    if current_file and current_file.get("fh"):
        current_file["fh"].close()

    print(f"\n=== SUMMARY ===")
    print(f"FILE blocks: {n_files}, CHNK: {n_chunks}, CONT: {n_conts}, SIGN: {n_signs}")
    print(f"\nUnique logical files (with total size from FILE headers):")
    seen_names = {}
    for name, size in files_seen:
        if name in seen_names:
            seen_names[name].append(size)
        else:
            seen_names[name] = [size]
    for name, sizes in seen_names.items():
        if len(sizes) == 1:
            print(f"  {sizes[0]:>12d}  {name}")
        else:
            print(f"  {sizes[0]:>12d}  {name}   (header repeated {len(sizes)}x)")

if __name__ == "__main__":
    main()
