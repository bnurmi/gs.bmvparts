import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  DatabaseBackup, RefreshCw, CloudUpload, Cloud, AlertTriangle,
  CheckCircle2, XCircle, Loader2, FileArchive, Clock, HardDrive, RotateCcw,
} from "lucide-react";

type BackupLog = {
  id: number;
  backupType: string;
  trigger: string;
  label: string | null;
  status: string;
  storageKey: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  durationMs: number | null;
  offsiteStatus: string;
  offsiteKey: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type BackupListResponse = {
  logs: BackupLog[];
  total: number;
  health: {
    schedulerActive: boolean;
    offsiteConfigured: boolean;
    offsite: { endpoint: string; bucket: string } | null;
    lastDb: BackupLog | null;
    lastDbSuccess: BackupLog | null;
    lastFiles: BackupLog | null;
    hoursSinceLastDbSuccess: number | null;
    onsiteUsage: { count: number; bytes: number } | null;
    counts30d: { dbAttempts: number; dbSuccesses: number; fileAttempts: number };
    nextRuns: Record<string, { cron: string; nextRunAt: string } | null>;
  };
};

type SettingsResponse = {
  retention: Record<string, number>;
  schedule: Record<string, any>;
  defaults: { retention: Record<string, number>; schedule: Record<string, any> };
};

function formatBytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string; icon: any }> = {
    verified: { variant: "default", label: "Verified", icon: CheckCircle2 },
    completed: { variant: "default", label: "Done", icon: CheckCircle2 },
    pending: { variant: "secondary", label: "Pending", icon: Loader2 },
    failed: { variant: "destructive", label: "Failed", icon: XCircle },
  };
  const cfg = map[status] || { variant: "outline", label: status, icon: AlertTriangle };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1" data-testid={`status-${status}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </Badge>
  );
}

function OffsiteBadge({ status }: { status: string }) {
  if (status === "uploaded") return <Badge variant="default" className="gap-1" data-testid="offsite-uploaded"><Cloud className="w-3 h-3" /> Offsite</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1" data-testid="offsite-failed"><XCircle className="w-3 h-3" /> Offsite failed</Badge>;
  return <Badge variant="outline" className="gap-1" data-testid="offsite-skipped"><Cloud className="w-3 h-3 opacity-40" /> No offsite</Badge>;
}

export default function BackupsPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<BackupListResponse>({ queryKey: ["/api/admin/backups"] });
  const { data: settings } = useQuery<SettingsResponse>({ queryKey: ["/api/admin/backups/settings"] });

  const runDb = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/backups/run-db", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      toast({ title: "DB backup completed" });
    },
    onError: (err: any) => toast({ title: "Backup failed", description: err.message, variant: "destructive" }),
  });

  const runFiles = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/backups/run-files", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      toast({ title: "File backup completed" });
    },
    onError: (err: any) => toast({ title: "Backup failed", description: err.message, variant: "destructive" }),
  });

  const testOffsite = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/backups/test-offsite", {}),
    onSuccess: async (resp: any) => {
      const body = await resp.json();
      if (!body.configured) toast({ title: "Offsite not configured", description: "No offsite environment variables are set.", variant: "destructive" });
      else if (body.ok) toast({ title: "Offsite reachable", description: `${body.bucket} @ ${body.endpoint}` });
      else toast({ title: "Offsite test failed", description: body.error || "unknown", variant: "destructive" });
    },
  });

  const health = data?.health;
  const logs = data?.logs || [];

  return (
    <div className="space-y-6" data-testid="backups-panel">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <HealthCard
          title="Last DB backup"
          icon={DatabaseBackup}
          value={health?.lastDbSuccess ? new Date(health.lastDbSuccess.completedAt || health.lastDbSuccess.createdAt).toLocaleString() : "Never"}
          sub={health?.hoursSinceLastDbSuccess !== null && health?.hoursSinceLastDbSuccess !== undefined ? `${health.hoursSinceLastDbSuccess.toFixed(1)}h ago` : undefined}
          testId="health-last-db"
        />
        <HealthCard
          title="Last file backup"
          icon={FileArchive}
          value={health?.lastFiles ? new Date(health.lastFiles.createdAt).toLocaleString() : "Never"}
          testId="health-last-files"
        />
        <HealthCard
          title="Offsite"
          icon={Cloud}
          value={health?.offsiteConfigured ? (health.offsite?.bucket || "configured") : "Not configured"}
          sub={health?.offsiteConfigured ? health.offsite?.endpoint : "Optional"}
          testId="health-offsite"
        />
        <HealthCard
          title="Onsite usage"
          icon={HardDrive}
          value={formatBytes(health?.onsiteUsage?.bytes ?? 0)}
          sub={`${health?.onsiteUsage?.count ?? 0} objects`}
          testId="health-onsite"
        />
      </div>

      <div className="rounded-md border bg-card p-4" data-testid="next-runs">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" />
          <span className="font-medium text-sm">Next scheduled runs</span>
          <Badge
            variant={health?.schedulerActive ? "default" : "secondary"}
            data-testid="status-scheduler"
            className="ml-auto"
          >
            {health?.schedulerActive ? "Scheduler active" : "Scheduler standby"}
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["hourly", "daily", "weekly", "monthly"] as const).map((kind) => {
            const info = health?.nextRuns?.[kind];
            return (
              <div
                key={kind}
                className="rounded-md border bg-background px-3 py-2"
                data-testid={`next-run-${kind}`}
              >
                <div className="text-xs uppercase text-muted-foreground tracking-wide">{kind}</div>
                <div className="text-sm font-medium" data-testid={`next-run-${kind}-time`}>
                  {info && info.nextRunAt ? new Date(info.nextRunAt).toLocaleString() : "Disabled"}
                </div>
                {info?.cron && (
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{info.cron}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => runDb.mutate()} disabled={runDb.isPending} data-testid="button-run-db">
          {runDb.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
          Run DB backup now
        </Button>
        <Button variant="secondary" onClick={() => runFiles.mutate()} disabled={runFiles.isPending} data-testid="button-run-files">
          {runFiles.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileArchive className="w-4 h-4 mr-2" />}
          Run file backup now
        </Button>
        <Button variant="outline" onClick={() => testOffsite.mutate()} disabled={testOffsite.isPending} data-testid="button-test-offsite">
          {testOffsite.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudUpload className="w-4 h-4 mr-2" />}
          Test offsite connection
        </Button>
        <Button variant="ghost" onClick={() => refetch()} data-testid="button-refresh-backups">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {settings && <SettingsPanels settings={settings} />}

      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Backup history
          <span className="text-xs text-muted-foreground font-normal">({data?.total || 0} entries)</span>
        </h3>
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-1.5 text-left">Type</th>
                <th className="px-2 py-1.5 text-left">Trigger</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-left">Offsite</th>
                <th className="px-2 py-1.5 text-right">Size</th>
                <th className="px-2 py-1.5 text-left">Checksum</th>
                <th className="px-2 py-1.5 text-right">Duration</th>
                <th className="px-2 py-1.5 text-left">When</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-2 py-4 text-center text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin" /></td></tr>}
              {!isLoading && logs.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-muted-foreground" data-testid="backups-empty">No backups yet</td></tr>}
              {logs.map((l) => (
                <tr key={l.id} className="border-t hover-elevate" data-testid={`row-backup-${l.id}`}>
                  <td className="px-2 py-1.5 font-medium">{l.backupType}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{l.trigger}</td>
                  <td className="px-2 py-1.5"><StatusBadge status={l.status} /></td>
                  <td className="px-2 py-1.5"><OffsiteBadge status={l.offsiteStatus} /></td>
                  <td className="px-2 py-1.5 text-right">{formatBytes(l.sizeBytes)}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]" data-testid={`text-checksum-${l.id}`}>{l.checksum?.slice(0, 12) || "—"}</td>
                  <td className="px-2 py-1.5 text-right">{formatDuration(l.durationMs)}</td>
                  <td className="px-2 py-1.5 text-muted-foreground" title={l.createdAt}>{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right">
                    {l.backupType === "database" && l.status === "verified" && l.storageKey && (
                      <Link href={`/admin/backups/restore/${l.id}`}>
                        <Button size="sm" variant="ghost" data-testid={`button-restore-${l.id}`}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Restore
                        </Button>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HealthCard({ title, icon: Icon, value, sub, testId }: { title: string; icon: any; value: string; sub?: string; testId: string }) {
  return (
    <div className="border rounded-md p-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</div>
      <div className="text-sm font-medium mt-1 truncate" title={value}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function SettingsPanels({ settings }: { settings: SettingsResponse }) {
  const { toast } = useToast();
  const [retention, setRetention] = useState(settings.retention);
  const [schedule, setSchedule] = useState(settings.schedule);

  const saveRetention = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/backups/retention", retention),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups/settings"] });
      toast({ title: "Retention saved" });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const saveSchedule = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/backups/schedule", schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups/settings"] });
      toast({ title: "Schedule saved", description: "New schedule applied immediately." });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const retentionFields: { key: string; label: string }[] = [
    { key: "hourly", label: "Hourly" },
    { key: "daily", label: "Daily / Manual" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "files", label: "File manifests" },
    { key: "preDeploy", label: "Pre-deploy" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border rounded-md p-3 space-y-3">
        <h4 className="text-sm font-semibold">Retention (set 0 to keep indefinitely)</h4>
        <div className="grid grid-cols-2 gap-3">
          {retentionFields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                min={0}
                value={retention[f.key] ?? 0}
                onChange={(e) => setRetention({ ...retention, [f.key]: parseInt(e.target.value) || 0 })}
                data-testid={`input-retention-${f.key}`}
              />
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => saveRetention.mutate()} disabled={saveRetention.isPending} data-testid="button-save-retention">
          {saveRetention.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
          Save retention
        </Button>
      </div>

      <div className="border rounded-md p-3 space-y-3">
        <h4 className="text-sm font-semibold">Schedule</h4>
        <ScheduleToggle label="Hourly" enabledKey="hourlyEnabled" schedule={schedule} setSchedule={setSchedule}>
          <div>
            <Label className="text-xs">Interval (min)</Label>
            <Input
              type="number"
              min={5}
              value={schedule.hourlyIntervalMinutes ?? 60}
              onChange={(e) => setSchedule({ ...schedule, hourlyIntervalMinutes: parseInt(e.target.value) || 60 })}
              data-testid="input-hourly-minutes"
            />
          </div>
        </ScheduleToggle>
        <ScheduleToggle label="Daily" enabledKey="dailyEnabled" schedule={schedule} setSchedule={setSchedule}>
          <div>
            <Label className="text-xs">Hour (0-23)</Label>
            <Input type="number" min={0} max={23} value={schedule.dailyHour ?? 3} onChange={(e) => setSchedule({ ...schedule, dailyHour: parseInt(e.target.value) || 0 })} data-testid="input-daily-hour" />
          </div>
        </ScheduleToggle>
        <ScheduleToggle label="Weekly" enabledKey="weeklyEnabled" schedule={schedule} setSchedule={setSchedule}>
          <div>
            <Label className="text-xs">Hour</Label>
            <Input type="number" min={0} max={23} value={schedule.weeklyHour ?? 4} onChange={(e) => setSchedule({ ...schedule, weeklyHour: parseInt(e.target.value) || 0 })} data-testid="input-weekly-hour" />
          </div>
          <div>
            <Label className="text-xs">Day (0=Sun)</Label>
            <Input type="number" min={0} max={6} value={schedule.weeklyDayOfWeek ?? 0} onChange={(e) => setSchedule({ ...schedule, weeklyDayOfWeek: parseInt(e.target.value) || 0 })} data-testid="input-weekly-dow" />
          </div>
        </ScheduleToggle>
        <ScheduleToggle label="Monthly" enabledKey="monthlyEnabled" schedule={schedule} setSchedule={setSchedule}>
          <div>
            <Label className="text-xs">Hour (1st of month)</Label>
            <Input type="number" min={0} max={23} value={schedule.monthlyHour ?? 5} onChange={(e) => setSchedule({ ...schedule, monthlyHour: parseInt(e.target.value) || 0 })} data-testid="input-monthly-hour" />
          </div>
        </ScheduleToggle>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!schedule.fileBackupOnDaily}
            onCheckedChange={(v) => setSchedule({ ...schedule, fileBackupOnDaily: v })}
            data-testid="switch-file-on-daily"
          />
          <Label className="text-xs">Run file backup with daily DB backup</Label>
        </div>
        <Button size="sm" onClick={() => saveSchedule.mutate()} disabled={saveSchedule.isPending} data-testid="button-save-schedule">
          {saveSchedule.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
          Save schedule
        </Button>
      </div>
    </div>
  );
}

function ScheduleToggle({ label, enabledKey, schedule, setSchedule, children }: any) {
  return (
    <div className="space-y-1.5 pb-2 border-b last:border-b-0">
      <div className="flex items-center gap-2">
        <Switch
          checked={!!schedule[enabledKey]}
          onCheckedChange={(v) => setSchedule({ ...schedule, [enabledKey]: v })}
          data-testid={`switch-${enabledKey}`}
        />
        <Label className="text-sm font-medium">{label}</Label>
      </div>
      {schedule[enabledKey] && <div className="grid grid-cols-2 gap-2 ml-10">{children}</div>}
    </div>
  );
}
