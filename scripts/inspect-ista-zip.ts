import { downloadBytes } from "../server/backup/object-storage";
import { createWriteStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, unlink } from "fs/promises";
import { spawnSync } from "child_process";

async function main() {
  console.log("Downloading BLP package (1.57 GB) to /tmp...");
  const scratchDir = join(tmpdir(), "ista-inspect");
  await mkdir(scratchDir, { recursive: true });
  const dest = join(scratchDir, "BMW_ISPI_ISTA-BLP_4.59.10.istapackage");
  
  // Download via object storage (uses streaming internally)
  const { downloadToFile } = await import("../server/backup/object-storage");
  await downloadToFile("BMW_ISPI_ISTA-BLP_4.59.10.istapackage", dest);
  console.log("Download complete. Listing ZIP contents...\n");
  
  // Use unzip -l to list contents without extracting
  const list = spawnSync("unzip", ["-l", dest], { maxBuffer: 50 * 1024 * 1024 });
  const output = list.stdout?.toString() || list.stderr?.toString() || "(no output)";
  console.log(output.slice(0, 20000));
}

main().catch(e => console.error("FATAL:", e));
