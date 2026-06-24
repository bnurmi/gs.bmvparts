import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;
import java.util.*;

public class JetExtract2 {
    public static void main(String[] args) throws Throwable {
        File arc = new File(args[0]);
        File outDir = new File(args[1]);
        outDir.mkdirs();
        long t0 = System.currentTimeMillis();
        long totalBytes = 0;
        int totalFiles = 0;
        byte[] buf = new byte[1 << 20];

        // Track duplicate paths -> append numeric suffix
        Map<String, Integer> seen = new HashMap<>();

        JetarchInputStream in = new JetarchInputStream(arc);
        try {
            while (true) {
                JetarchEntry e;
                try {
                    e = in.getNextEntry();
                } catch (Throwable t) {
                    System.out.printf("%n[!!] getNextEntry threw %s: %s%n",
                        t.getClass().getName(), t.getMessage());
                    t.printStackTrace(System.out);
                    break;
                }
                if (e == null) {
                    System.out.println("\n(getNextEntry returned null — clean end)");
                    break;
                }
                totalFiles++;
                String path = e.getSourcePath().replace('\\','/');
                while (path.startsWith("/")) path = path.substring(1);
                long size = e.getFilesize();

                int dupIdx = seen.merge(path, 0, (a, b) -> a + 1);
                String savePath = dupIdx == 0 ? path : path + ".dup" + dupIdx;

                System.out.printf("[%5d] %s  size=%d  dir=%s  saveAs=%s%n",
                    totalFiles, path, size, e.isDir(), savePath);
                System.out.flush();

                if (e.isDir()) continue;

                File outFile = new File(outDir, savePath);
                if (outFile.getParentFile() != null) outFile.getParentFile().mkdirs();
                long written = 0;
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    while (written < size) {
                        int toRead = (int) Math.min(buf.length, size - written);
                        int n;
                        try {
                            n = in.read(buf, 0, toRead);
                        } catch (Throwable t) {
                            System.out.printf("    [!!] read threw %s: %s after %d bytes%n",
                                t.getClass().getName(), t.getMessage(), written);
                            t.printStackTrace(System.out);
                            n = -1;
                        }
                        if (n <= 0) break;
                        fos.write(buf, 0, n);
                        written += n;
                    }
                }
                totalBytes += written;
                if (written != size) {
                    System.out.printf("    -> short read: wrote %d / %d (%.1f%%)%n",
                        written, size, 100.0 * written / Math.max(1, size));
                }
                if (totalFiles % 5 == 0 || written > 50_000_000) {
                    System.out.printf("    progress: %d files, %.2f GB, %.1fs%n",
                        totalFiles, totalBytes / 1073741824.0,
                        (System.currentTimeMillis() - t0) / 1000.0);
                }
            }
        } finally {
            try { in.close(); } catch (Throwable ignored) {}
        }
        System.out.printf("%nDONE: %d entries, %.2f GB total, %.1fs%n",
            totalFiles, totalBytes / 1073741824.0, (System.currentTimeMillis() - t0) / 1000.0);
    }
}
