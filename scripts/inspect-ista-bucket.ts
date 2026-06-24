import { downloadBytes, listKeys } from "../server/backup/object-storage";

async function main() {
  const all = await listKeys("");
  const ista = all.filter(k => k.toLowerCase().includes("ista"));
  console.log("=== ISTA keys in bucket ===");
  ista.forEach(k => console.log(" ", k));

  for (const key of ["BMW_ISPI_ISTA-META_4.59.14.xml", "BMW_ISPI_ISTA-META_SDP_4.59.10.xml"]) {
    try {
      const buf = await downloadBytes(key);
      console.log(`\n=== ${key} (${buf.length} bytes) ===`);
      console.log(buf.toString("utf8", 0, 8000));
    } catch (e: any) {
      console.log(`\n=== ${key} ERROR: ${e.message} ===`);
    }
  }

  // .istapackage — just check size + magic bytes; it could be huge
  const pkgKey = "BMW_ISPI_ISTA-BLP_4.59.10.istapackage";
  try {
    const pkg = await downloadBytes(pkgKey);
    console.log(`\n=== ${pkgKey} ===`);
    console.log(`Size: ${(pkg.length / 1024 / 1024).toFixed(1)} MB`);
    console.log(`First 16 bytes hex: ${pkg.slice(0, 16).toString("hex")}`);
    console.log(`First 4 bytes ascii: "${pkg.slice(0, 4).toString("ascii")}"`);
    // Try reading as zip (istapackage is typically a renamed zip)
    // Check for PK zip magic: 50 4b 03 04
    if (pkg[0] === 0x50 && pkg[1] === 0x4b) {
      console.log("Format: ZIP/PKZIP (magic 50 4B)");
    } else {
      console.log("Format: not a standard ZIP — raw hex:", pkg.slice(0, 64).toString("hex"));
    }
  } catch (e: any) {
    console.log(`\n=== ${pkgKey} ERROR: ${e.message} ===`);
  }
}

main().catch(console.error);
