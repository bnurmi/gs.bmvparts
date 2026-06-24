import de.fundf.swupdate.common.jetarch.JetarchInputStream;
import de.fundf.swupdate.common.jetarch.JetarchEntry;
import java.io.*;

public class JetList {
    public static void main(String[] args) throws Throwable {
        File arc = new File(args[0]);
        long t0 = System.currentTimeMillis();
        long totalBytes = 0;
        int totalFiles = 0;
        byte[] buf = new byte[1 << 20];
        JetarchInputStream in = new JetarchInputStream(arc);
        try {
            while (true) {
                JetarchEntry e;
                try { e = in.getNextEntry(); }
                catch (Throwable t) {
                    System.out.printf("[!!] getNextEntry threw %s: %s%n", t.getClass().getName(), t.getMessage());
                    t.printStackTrace(System.out);
                    break;
                }
                if (e == null) { System.out.println("(null - clean end)"); break; }
                totalFiles++;
                String path = e.getSourcePath().replace('\\','/');
                long size = e.getFilesize();
                System.out.printf("[%5d] %-50s size=%d  dir=%s%n", totalFiles, path, size, e.isDir());
                System.out.flush();
                if (e.isDir()) continue;
                long drained = 0;
                while (drained < size) {
                    int toRead = (int)Math.min(buf.length, size - drained);
                    int n;
                    try { n = in.read(buf, 0, toRead); }
                    catch (Throwable t) {
                        System.out.printf("    [!!] read threw %s: %s after %d bytes%n",
                            t.getClass().getName(), t.getMessage(), drained);
                        n = -1;
                    }
                    if (n <= 0) break;
                    drained += n;
                }
                totalBytes += drained;
                if (drained != size) System.out.printf("    short: %d/%d (%.1f%%)%n", drained, size, 100.0*drained/size);
                if (totalFiles % 5 == 0) {
                    System.out.printf("    ... %d entries, %.2f GB drained, %.1fs%n",
                        totalFiles, totalBytes/1073741824.0, (System.currentTimeMillis()-t0)/1000.0);
                }
            }
        } finally { try { in.close(); } catch (Throwable ignored) {} }
        System.out.printf("DONE: %d entries, %.2f GB drained in %.1fs%n",
            totalFiles, totalBytes/1073741824.0, (System.currentTimeMillis()-t0)/1000.0);
    }
}
