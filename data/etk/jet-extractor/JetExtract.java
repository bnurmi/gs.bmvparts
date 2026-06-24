import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;

public class JetExtract {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: JetExtract <jetarch-file> <output-dir> [--list-only]");
            System.exit(2);
        }
        File arc = new File(args[0]);
        File outDir = new File(args[1]);
        boolean listOnly = args.length >= 3 && "--list-only".equals(args[2]);
        if (!outDir.exists()) outDir.mkdirs();

        long t0 = System.currentTimeMillis();
        long totalBytes = 0;
        int totalFiles = 0;

        JetarchInputStream in = new JetarchInputStream(arc);
        JetarchEntry e;
        byte[] buf = new byte[1 << 20];
        while ((e = in.getNextEntry()) != null) {
            String path = e.getSourcePath();
            boolean isDir = e.isDir();
            long size = e.getFilesize();
            totalFiles++;
            System.out.printf("[%5d] %s  size=%d  dir=%s%n", totalFiles, path, size, isDir);
            System.out.flush();

            if (isDir || listOnly) {
                // drain entry to advance stream
                long skipped = 0;
                int n;
                while (skipped < size && (n = in.read(buf, 0, (int)Math.min(buf.length, size - skipped))) > 0) {
                    skipped += n;
                }
                continue;
            }

            // Sanitize path
            String safe = path.replace('\\', '/');
            while (safe.startsWith("/")) safe = safe.substring(1);
            File outFile = new File(outDir, safe);
            File parent = outFile.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();

            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                long written = 0;
                int n;
                while (written < size && (n = in.read(buf, 0, (int)Math.min(buf.length, size - written))) > 0) {
                    fos.write(buf, 0, n);
                    written += n;
                }
                totalBytes += written;
            }
            if (totalFiles % 50 == 0) {
                System.out.printf("  ... progress: %d files, %.1f MB, %.1fs%n",
                    totalFiles, totalBytes / 1048576.0, (System.currentTimeMillis() - t0) / 1000.0);
                System.out.flush();
            }
        }
        in.close();
        System.out.printf("DONE: %d files, %.1f MB extracted in %.1fs%n",
            totalFiles, totalBytes / 1048576.0, (System.currentTimeMillis() - t0) / 1000.0);
    }
}
