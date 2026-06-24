import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;

public class JetPerPart {
    public static void main(String[] args) throws Throwable {
        File f = new File(args[0]);
        File outDir = new File(args[1]);
        outDir.mkdirs();
        System.out.printf("Reading %s (%d MB) -> %s%n", f.getName(), f.length()/1048576, outDir);

        // Trick: temporarily rename to look like a base file with no continuation parts
        // so JetarchInputStream doesn't try to open <name>.part1
        // Instead, we make a symlink with a "fake base" name that has NO partN successors.
        File workDir = new File("/tmp/jetwork");
        workDir.mkdirs();
        File link = new File(workDir, "iso.jetarch");
        if (link.exists()) link.delete();
        java.nio.file.Files.createSymbolicLink(link.toPath(), f.toPath());
        // (no .part1, .part2 etc next to /tmp/jetwork/iso.jetarch)

        JetarchInputStream in = null;
        long totalBytes = 0;
        int totalFiles = 0;
        byte[] buf = new byte[1 << 20];
        try {
            in = new JetarchInputStream(link);
            int idx = 0;
            while (true) {
                JetarchEntry e;
                try {
                    e = in.getNextEntry();
                } catch (Throwable t) {
                    System.out.printf("  ! getNextEntry threw %s: %s%n", t.getClass().getSimpleName(), t.getMessage());
                    t.printStackTrace(System.out);
                    break;
                }
                if (e == null) { System.out.println("  (getNextEntry returned null — end)"); break; }
                idx++; totalFiles++;
                String path = e.getSourcePath().replace('\\','/');
                while (path.startsWith("/")) path = path.substring(1);
                long sz = e.getFilesize();
                System.out.printf("  [%d] %s size=%d dir=%s%n", idx, path, sz, e.isDir());
                System.out.flush();
                if (e.isDir()) continue;
                File outF = new File(outDir, path);
                if (outF.getParentFile() != null) outF.getParentFile().mkdirs();
                long written = 0;
                try (FileOutputStream fos = new FileOutputStream(outF)) {
                    while (written < sz) {
                        int toRead = (int)Math.min(buf.length, sz - written);
                        int n;
                        try {
                            n = in.read(buf, 0, toRead);
                        } catch (Throwable t) {
                            System.out.printf("    ! read threw %s: %s after %d bytes%n",
                                t.getClass().getSimpleName(), t.getMessage(), written);
                            n = -1;
                        }
                        if (n <= 0) break;
                        fos.write(buf, 0, n);
                        written += n;
                    }
                }
                totalBytes += written;
                if (written != sz) System.out.printf("    -> short: %d / %d bytes%n", written, sz);
            }
        } finally {
            if (in != null) try { in.close(); } catch (Throwable ignored) {}
            link.delete();
        }
        System.out.printf("DONE: %d entries, %.1f MB%n", totalFiles, totalBytes/1048576.0);
    }
}
