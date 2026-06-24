import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, ShieldAlert, CheckCircle2 } from "lucide-react";

type BackupLog = {
  id: number; backupType: string; trigger: string; status: string;
  storageKey: string | null; sizeBytes: number | null; checksum: string | null;
  durationMs: number | null; offsiteStatus: string; offsiteKey: string | null;
  createdAt: string; completedAt: string | null;
};

export default function BackupRestore() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [source, setSource] = useState<"onsite" | "offsite">("onsite");
  const [confirmed, setConfirmed] = useState(false);

  const { data, isLoading } = useQuery<{ log: BackupLog; offsiteAvailable: boolean }>({
    queryKey: ["/api/admin/backups/restore", id],
    queryFn: async () => {
      const r = await fetch(`/api/admin/backups/restore/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: !!id,
  });

  const restore = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/backups/restore/${id}`, { source }),
    onSuccess: async (resp: any) => {
      const body = await resp.json();
      if (body.ok) toast({ title: "Restore completed", description: `Took ${(body.durationMs / 1000).toFixed(1)}s` });
      else toast({ title: "Restore failed", description: body.error, variant: "destructive" });
    },
    onError: (err: any) => toast({ title: "Restore failed", description: err.message, variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  const log = data?.log;
  if (!log) return <div className="p-6 text-muted-foreground">Backup not found</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to admin
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-restore-title">
          <RotateCcw className="w-6 h-6" /> Restore database backup
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          This will overwrite the current database with the contents of this backup. Existing data will be lost.
        </p>
      </div>

      <div className="border rounded-md p-4 space-y-2 text-sm">
        <Row label="Backup ID" value={`#${log.id}`} />
        <Row label="Trigger" value={log.trigger} />
        <Row label="Status" value={<Badge data-testid="restore-status">{log.status}</Badge>} />
        <Row label="Created" value={new Date(log.createdAt).toLocaleString()} />
        <Row label="Size" value={log.sizeBytes ? `${(log.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "—"} />
        <Row label="Checksum" value={<span className="font-mono text-xs" data-testid="restore-checksum">{log.checksum || "—"}</span>} />
        <Row label="Onsite key" value={<span className="font-mono text-xs">{log.storageKey || "—"}</span>} />
        <Row label="Offsite" value={data?.offsiteAvailable ? "Available" : "Not available"} />
      </div>

      <div className="border rounded-md p-4 space-y-3">
        <Label className="text-sm">Source</Label>
        <div className="flex gap-2">
          <Button
            variant={source === "onsite" ? "default" : "outline"}
            onClick={() => setSource("onsite")}
            data-testid="button-source-onsite"
          >Onsite (Object Storage)</Button>
          <Button
            variant={source === "offsite" ? "default" : "outline"}
            onClick={() => setSource("offsite")}
            disabled={!data?.offsiteAvailable}
            data-testid="button-source-offsite"
          >Offsite (S3)</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If the onsite copy is missing, the server will automatically fall back to offsite when configured.
        </p>
      </div>

      <div className="border-2 border-destructive/40 bg-destructive/5 rounded-md p-4 space-y-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Destructive action.</strong> This restore replaces the live database with the backup contents.
            All changes since this backup will be permanently lost. Make sure you have a fresh backup of the current state if needed.
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="checkbox-confirm-restore" />
          I understand this will overwrite the current database.
        </label>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={!confirmed || restore.isPending}
            onClick={() => restore.mutate()}
            data-testid="button-confirm-restore"
          >
            {restore.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            Restore now
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin")} data-testid="button-cancel-restore">Cancel</Button>
        </div>
        {restore.data && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid="restore-result">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Restore call completed.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
