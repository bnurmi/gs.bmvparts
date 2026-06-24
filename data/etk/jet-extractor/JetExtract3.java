import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;
import java.util.*;

/**
 * Walk the entire jetarch and extract small files only;
 * skip the payload of any file > SMALL_THRESHOLD bytes.
 * This lets us complete the parse within the 16GB cgroup limit.
 *
 * Usage: java JetExtract3 <archive> <outDir> [smallMb]
 */
public class JetExtract3 {
    public static void main(String[] args) throws Throwable {
        File arc = new File(args[0]);
        File outDir = new File(args[1]);
        long smallMb = args.length > 2 ? Long.parseLong(args[2]) : 50;
        long SMALL = smallMb * 1024L * 1024L;
        outDir.mkdirs();

        long t0 = System.currentTimeMillis();
        long totalSmallBytes = 0;
        long totalSkippedBytes = 0;
        int totalFiles = 0;
        int extractedFiles = 0;
        int skippedFiles = 0;
        byte[] buf = new byte[1 << 20];

        Map<String, Integer> seen = new HashMap<>();
        PrintWriter index = new PrintWriter(new FileWriter(new File(outDir, "_INDEX.tsv")));
        index.println("idx\tdir\tsize\tpath\textracted");

        JetarchInputStream in = new JetarchInputStream(arc);
        try {
            while (true) {
                JetarchEntry e;
                try {
                    e = in.getNextEntry();
                } catch (Throwable t) {
                    System.out.printf("%n[!!] getNextEntry threw %s: %s%n",
                        t.getClass().getName(), t.getMessage());
                    break;
                }
                if (e == null) {
                    System.out.println("\n(clean end)");
                    break;
                }
                totalFiles++;
                String path = e.getSourcePath().replace('\\','/');
                while (path.startsWith("/")) path = path.substring(1);
                long size = e.getFilesize();
                boolean isDir = e.isDir();

                int dupIdx = seen.merge(path, 0, (a, b) -> a + 1);
                String savePath = dupIdx == 0 ? path : path + ".dup" + dupIdx;
                boolean small = !isDir && size <= SMALL;

                index.printf("%d\t%s\t%d\t%s\t%s%n", totalFiles, isDir, size, path, small);
                if (totalFiles % 50 == 0) index.flush();

                if (totalFiles <= 200 || totalFiles % 100 == 0 || size > 100_000_000L) {
                    System.out.printf("[%5d] dir=%-5s size=%-12d %s%n",
                        totalFiles, isDir, size, path);
                    System.out.flush();
                }

                if (isDir) continue;

                if (small) {
                    File outFile = new File(outDir, savePath);
                    if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
                    long written = 0;
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        while (written < size) {
                            int toRead = (int) Math.min(buf.length, size - written);
                            int n = in.read(buf, 0, toRead);
                            if (n <= 0) break;
                            fos.write(buf, 0, n);
                            written += n;
                        }
                    }
                    totalSmallBytes += written;
                    extractedFiles++;
                    if (written != size) {
                        System.out.printf("    -> short read: %d / %d on %s%n", written, size, path);
                    }
                } else {
                    // SKIP payload; do not write to disk
                    long remaining = size;
                    while (remaining > 0) {
                        int toRead = (int) Math.min(buf.length, remaining);
                        int n = in.read(buf, 0, toRead);
                        if (n <= 0) break;
                        remaining -= n;
                    }
                    totalSkippedBytes += (size - remaining);
                    skippedFiles++;
                }

                if (totalFiles % 200 == 0) {
                    System.out.printf("    progress: %d files (%d ex, %d sk), small=%.2fMB skipped=%.2fGB t=%.1fs%n",
                        totalFiles, extractedFiles, skippedFiles,
                        totalSmallBytes / 1048576.0,
                        totalSkippedBytes / 1073741824.0,
                        (System.currentTimeMillis() - t0) / 1000.0);
                }
            }
        } finally {
            try { in.close(); } catch (Throwable ignored) {}
            index.flush(); index.close();
        }
        System.out.printf("%nDONE: %d files (%d extracted = %.2f MB, %d skipped = %.2f GB), %.1fs%n",
            totalFiles, extractedFiles, totalSmallBytes / 1048576.0,
            skippedFiles, totalSkippedBytes / 1073741824.0,
            (System.currentTimeMillis() - t0) / 1000.0);
    }
}
