import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;
import java.util.*;

public class JetExtractAll {
    public static void main(String[] args) throws Exception {
        File baseDir = new File(args[0]);
        String prefix = args[1]; // e.g. "ETK-Data_3.220.006.jetarch"
        File outDir = new File(args[2]);
        outDir.mkdirs();

        // Order: base file first, then .part1 .. .partN
        List<File> parts = new ArrayList<>();
        parts.add(new File(baseDir, prefix));
        for (int i = 1; ; i++) {
            File p = new File(baseDir, prefix + ".part" + i);
            if (!p.exists()) break;
            parts.add(p);
        }
        System.out.printf("Found %d archive files to process%n", parts.size());

        long t0 = System.currentTimeMillis();
        long grandTotalBytes = 0;
        int grandTotalFiles = 0;
        byte[] buf = new byte[1 << 20];

        // Concatenate rfile chunks: open one stream per unique source path
        Map<String, FileOutputStream> appenders = new HashMap<>();

        for (int pIdx = 0; pIdx < parts.size(); pIdx++) {
            File pf = parts.get(pIdx);
            System.out.printf("%n===== Processing part %d/%d: %s (%d MB) =====%n",
                pIdx, parts.size() - 1, pf.getName(), pf.length() / 1048576);
            System.out.flush();

            JetarchInputStream in = null;
            try {
                in = new JetarchInputStream(pf);
                JetarchEntry e;
                int entryIdx = 0;
                while (true) {
                    try {
                        e = in.getNextEntry();
                    } catch (Exception ex) {
                        System.out.printf("  ! getNextEntry threw: %s — stopping this part%n", ex.getMessage());
                        break;
                    }
                    if (e == null) break;
                    entryIdx++;
                    grandTotalFiles++;
                    String path = e.getSourcePath().replace('\\', '/');
                    while (path.startsWith("/")) path = path.substring(1);
                    long size = e.getFilesize();
                    boolean isDir = e.isDir();
                    System.out.printf("  [%d.%d] %s  size=%d  dir=%s%n", pIdx, entryIdx, path, size, isDir);
                    System.out.flush();

                    if (isDir) continue;

                    // Decide destination strategy
                    // For metadata files (small, duplicated): write under part dir for inspection
                    // For rfile*.000 chunks: APPEND to single concatenated file
                    boolean isRomFile = path.startsWith("files/rfile") && path.endsWith(".000");
                    File outFile;
                    boolean append;
                    if (isRomFile) {
                        outFile = new File(outDir, path); // single concatenated path
                        append = appenders.containsKey(path); // append after first
                    } else {
                        outFile = new File(outDir, "part" + pIdx + "/" + path);
                        append = false;
                    }
                    File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists()) parent.mkdirs();

                    FileOutputStream fos;
                    if (isRomFile) {
                        fos = appenders.get(path);
                        if (fos == null) {
                            fos = new FileOutputStream(outFile, false);
                            appenders.put(path, fos);
                        }
                    } else {
                        fos = new FileOutputStream(outFile, false);
                    }

                    long written = 0;
                    int n;
                    try {
                        while (written < size) {
                            int toRead = (int) Math.min(buf.length, size - written);
                            n = in.read(buf, 0, toRead);
                            if (n <= 0) break;
                            fos.write(buf, 0, n);
                            written += n;
                        }
                    } catch (Exception ex) {
                        System.out.printf("    ! read error after %d bytes: %s%n", written, ex.getMessage());
                    }
                    if (!isRomFile) fos.close();
                    grandTotalBytes += written;
                    if (written != size) {
                        System.out.printf("    ! short read: wrote %d / %d bytes (%.1f%%)%n",
                            written, size, 100.0 * written / Math.max(1, size));
                    }
                }
            } finally {
                if (in != null) try { in.close(); } catch (Exception ignored) {}
            }
            System.out.printf("  -- part %d done. Total so far: %d files, %.1f GB, %.1fs%n",
                pIdx, grandTotalFiles, grandTotalBytes / 1073741824.0,
                (System.currentTimeMillis() - t0) / 1000.0);
            System.out.flush();
        }
        for (FileOutputStream fos : appenders.values()) fos.close();
        System.out.printf("%nDONE: %d total entries, %.2f GB written across all parts in %.1fs%n",
            grandTotalFiles, grandTotalBytes / 1073741824.0, (System.currentTimeMillis() - t0) / 1000.0);
    }
}
