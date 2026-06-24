import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Key, Plus, Trash2, Shield, ShieldCheck, ShieldAlert,
  Copy, Check, Eye, EyeOff, RefreshCw, Play, Square,
  DollarSign, Search, AlertTriangle, CheckCircle, XCircle, Loader2,
  Star, Database, Car, Wrench, Globe, Brain, Gauge, Lock, Image, Zap,
  ShoppingCart, FileText, BarChart3, Cpu, Layers, BookOpen, Mail, Send,
  Download, DatabaseBackup, Calculator, Calendar, Package, Network, TrendingUp
} from "lucide-react";
import BackupsPanel from "@/components/admin/BackupsPanel";
import SeoEditorialPanel from "@/components/admin/SeoEditorialPanel";
import SearchConsolePanel from "@/components/admin/SearchConsolePanel";
import { BmvVinContentPanel } from "@/components/admin/BmvVinContentPanel";
import IstaIngestPanel from "@/components/admin/IstaIngestPanel";
import BimmerWorkDiscoveryPanel from "@/components/admin/BimmerWorkDiscoveryPanel";
import VinEnrichmentQueuePanel from "@/components/admin/VinEnrichmentQueuePanel";
import ProxyDashboardPanel from "@/components/admin/ProxyDashboardPanel";
import AiFaqAdminPanel from "@/components/admin/AiFaqAdminPanel";
import SeoGrowthPanel from "@/components/admin/SeoGrowthPanel";
import { BmvVinSeoPanel } from "@/components/admin/BmvVinSeoPanel";
import SeoPagesCatalogPanel from "@/components/admin/SeoPagesCatalogPanel";
import SeoPublisherPanel from "@/components/admin/SeoPublisherPanel";
import { CatalogStatusChip } from "@/components/CatalogStatusChip";

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  createdAt: string;
}

interface ApiKeyData {
  id: number;
  userId: string;
  key: string;
  name: string;
  tier: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  username: string;
}

function UserManagement() {
  const { toast } = useToast();
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/users", { username: newUsername, password: newPassword, role: newRole, email: newEmail || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewRole("user");
      toast({ title: "User created" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = msg;
      try { errorText = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Error", description: errorText, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string | null }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, { email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingEmailId(null);
      setEditEmail("");
      toast({ title: "Email updated" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = msg;
      try { errorText = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Error", description: errorText, variant: "destructive" });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, { password });
    },
    onSuccess: () => {
      setEditingPasswordId(null);
      setEditPassword("");
      setShowEditPassword(false);
      toast({ title: "Password updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin": return <ShieldAlert className="w-3.5 h-3.5" />;
      case "user": return <Shield className="w-3.5 h-3.5" />;
      default: return <Shield className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-users-title">
        <Users className="w-5 h-5" /> User Accounts
      </h2>

      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <h3 className="text-sm font-medium">Create New User</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <Label htmlFor="new-user" className="text-xs">Username</Label>
            <Input id="new-user" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" data-testid="input-new-username" />
          </div>
          <div>
            <Label htmlFor="new-pass" className="text-xs">Password</Label>
            <Input id="new-pass" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="min 6 chars" data-testid="input-new-password" />
          </div>
          <div>
            <Label htmlFor="new-email" className="text-xs">Email (optional)</Label>
            <Input id="new-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@example.com" data-testid="input-new-email" />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => createMutation.mutate()} disabled={!newUsername || !newPassword || createMutation.isPending} className="w-full" data-testid="button-create-user">
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.5fr_1fr_8rem_8rem] text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-2 border-b">
          <span>Username / Email</span>
          <span>Created</span>
          <span>Role</span>
          <span className="text-right">Actions</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : users.map(user => (
          <div key={user.id} className="border-b last:border-0" data-testid={`row-user-${user.id}`}>
            <div className="sm:grid sm:grid-cols-[1.5fr_1fr_8rem_8rem] px-3 py-2.5 text-sm items-center gap-2">
              <div className="font-medium truncate" data-testid={`text-email-${user.id}`}>
                {user.email && user.username === user.email
                  ? <span className="text-foreground">{user.email}</span>
                  : <span className="text-foreground">{user.username || user.email || "—"}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</div>
              <div>
                <Select value={user.role} onValueChange={(role) => updateRoleMutation.mutate({ id: user.id, role })}>
                  <SelectTrigger className="h-7 text-xs">
                    <div className="flex items-center gap-1">
                      {roleIcon(user.role)}
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (editingEmailId === user.id) {
                      setEditingEmailId(null);
                      setEditEmail("");
                    } else {
                      setEditingEmailId(user.id);
                      setEditEmail(user.email ?? "");
                    }
                  }}
                  data-testid={`button-edit-email-${user.id}`}
                  title="Edit email"
                >
                  <Mail className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (editingPasswordId === user.id) {
                      setEditingPasswordId(null);
                      setEditPassword("");
                      setShowEditPassword(false);
                    } else {
                      setEditingPasswordId(user.id);
                      setEditPassword("");
                      setShowEditPassword(false);
                    }
                  }}
                  data-testid={`button-edit-password-${user.id}`}
                  title="Change password"
                >
                  <Lock className="w-3.5 h-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" data-testid={`button-delete-user-${user.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete user?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this user? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate(user.id)}
                        data-testid={`button-confirm-delete-user-${user.id}`}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {editingEmailId === user.id && (
              <div className="px-3 pb-3 flex items-center gap-2" data-testid={`email-edit-${user.id}`}>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="email@example.com (leave blank to clear)"
                  className="h-8 text-sm flex-1 max-w-xs"
                  data-testid={`input-edit-email-${user.id}`}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      updateEmailMutation.mutate({ id: user.id, email: editEmail.trim() ? editEmail.trim() : null });
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={updateEmailMutation.isPending}
                  onClick={() => updateEmailMutation.mutate({ id: user.id, email: editEmail.trim() ? editEmail.trim() : null })}
                  data-testid={`button-save-email-${user.id}`}
                >
                  {updateEmailMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => { setEditingEmailId(null); setEditEmail(""); }}
                >
                  Cancel
                </Button>
              </div>
            )}
            {editingPasswordId === user.id && (
              <div className="px-3 pb-3 flex items-center gap-2" data-testid={`password-edit-${user.id}`}>
                <div className="relative flex-1 max-w-xs">
                  <Input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="h-8 text-sm pr-8"
                    data-testid={`input-edit-password-${user.id}`}
                    onKeyDown={e => {
                      if (e.key === "Enter" && editPassword.length >= 6) {
                        updatePasswordMutation.mutate({ id: user.id, password: editPassword });
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    tabIndex={-1}
                  >
                    {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={editPassword.length < 6 || updatePasswordMutation.isPending}
                  onClick={() => updatePasswordMutation.mutate({ id: user.id, password: editPassword })}
                  data-testid={`button-save-password-${user.id}`}
                >
                  {updatePasswordMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => { setEditingPasswordId(null); setEditPassword(""); setShowEditPassword(false); }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeyManagement() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState("basic");
  const [newUserId, setNewUserId] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  const { data: keys = [], isLoading } = useQuery<ApiKeyData[]>({
    queryKey: ["/api/admin/api-keys"],
  });

  const { data: users = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/api-keys", { userId: newUserId, name: newName, tier: newTier });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      setNewName("");
      setNewTier("basic");
      toast({ title: "API key created", description: "Key has been generated successfully" });
      setVisibleKeys(prev => new Set(prev).add(data.id));
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await apiRequest("PATCH", `/api/admin/api-keys/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "API key deleted" });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: number; tier: string }) => {
      await apiRequest("PATCH", `/api/admin/api-keys/${id}`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "Tier updated" });
    },
  });

  const copyKey = async (id: number, key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tierColor = (tier: string) => {
    switch (tier) {
      case "basic": return "secondary";
      case "paid": return "default";
      case "admin": return "destructive";
      default: return "secondary" as const;
    }
  };

  const maskKey = (key: string) => key.substring(0, 12) + "..." + key.substring(key.length - 6);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-api-keys-title">
        <Key className="w-5 h-5" /> API Keys
      </h2>

      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <h3 className="text-sm font-medium">Create New API Key</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">User</Label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger data-testid="select-api-user"><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Key Name</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. My App" data-testid="input-api-key-name" />
          </div>
          <div>
            <Label className="text-xs">Tier</Label>
            <Select value={newTier} onValueChange={setNewTier}>
              <SelectTrigger data-testid="select-api-tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic (Free)</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="admin">Admin (Full)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => createMutation.mutate()} disabled={!newUserId || !newName || createMutation.isPending} className="w-full" data-testid="button-create-api-key">
              <Plus className="w-4 h-4 mr-1" /> Generate
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p><Badge variant="secondary" className="text-[10px] mr-1">Basic</Badge> Cars listing, stats only</p>
          <p><Badge className="text-[10px] mr-1">Paid</Badge> + Parts, search, cross-reference</p>
          <p><Badge variant="destructive" className="text-[10px] mr-1">Admin</Badge> + Pricing, full access</p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="hidden lg:grid grid-cols-[1fr_1fr_6rem_5rem_5rem_6rem_4rem] text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-2 border-b">
          <span>Key</span>
          <span>Name / User</span>
          <span>Tier</span>
          <span>Status</span>
          <span>Requests</span>
          <span>Last Used</span>
          <span className="text-right">Actions</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">No API keys yet</div>
        ) : keys.map(k => (
          <div key={k.id} className="lg:grid lg:grid-cols-[1fr_1fr_6rem_5rem_5rem_6rem_4rem] px-3 py-2.5 text-sm border-b last:border-0 items-center gap-2" data-testid={`row-api-key-${k.id}`}>
            <div className="font-mono text-xs flex items-center gap-1">
              <span className="truncate">{visibleKeys.has(k.id) ? k.key : maskKey(k.key)}</span>
              <button onClick={() => setVisibleKeys(prev => { const s = new Set(prev); s.has(k.id) ? s.delete(k.id) : s.add(k.id); return s; })} className="p-0.5 hover:bg-accent rounded shrink-0">
                {visibleKeys.has(k.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <button onClick={() => copyKey(k.id, k.key)} className="p-0.5 hover:bg-accent rounded shrink-0">
                {copiedId === k.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div>
              <div className="text-xs font-medium">{k.name}</div>
              <div className="text-xs text-muted-foreground">{k.username}</div>
            </div>
            <div>
              <Select value={k.tier} onValueChange={(tier) => updateTierMutation.mutate({ id: k.id, tier })}>
                <SelectTrigger className="h-6 text-[10px] px-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <button onClick={() => toggleMutation.mutate({ id: k.id, active: !k.active })}>
                <Badge variant={k.active ? "default" : "secondary"} className="text-[10px] cursor-pointer">
                  {k.active ? "Active" : "Inactive"}
                </Badge>
              </button>
            </div>
            <div className="text-xs text-muted-foreground">{k.requestCount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</div>
            <div className="text-right">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(k.id)} data-testid={`button-delete-key-${k.id}`}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PricingSyncStatus {
  isRunning: boolean;
  totalParts: number;
  completed: number;
  found: number;
  notFound: number;
  errors: number;
  skipped: number;
  currentPartNumber: string | null;
  mode: "resume" | "full";
  startedAt: string | null;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function computeEta(elapsed: number, completed: number, total: number): string | null {
  if (completed <= 0 || total <= 0 || elapsed <= 0 || total <= completed) return null;
  if (!Number.isFinite(elapsed)) return null;
  const remaining = total - completed;
  const secsPerItem = elapsed / completed;
  const etaSeconds = Math.round(remaining * secsPerItem);
  if (etaSeconds < 5) return "<1m";
  return formatElapsed(etaSeconds);
}

function PricingSyncPanel() {
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState<PricingSyncStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await apiRequest("GET", "/api/admin/pricing-sync/status");
      const data: PricingSyncStatus = await res.json();
      setStatus(data);
      if (!data.isRunning && polling) {
        setPolling(false);
      }
      return data;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    fetchStatus().then((data) => {
      if (data?.isRunning) setPolling(true);
    });
  }, []);

  useEffect(() => {
    if (polling) {
      intervalRef.current = setInterval(fetchStatus, 1500);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [polling]);

  const startMutation = useMutation({
    mutationFn: async (forceRefresh: boolean = false) => {
      await apiRequest("POST", "/api/admin/pricing-sync/start", { forceRefresh });
    },
    onSuccess: (_data, forceRefresh) => {
      setPolling(true);
      toast({ title: forceRefresh ? "Full pricing refresh started" : "Pricing sync started (resuming)" });
      fetchStatus();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/pricing-sync/stop");
    },
    onSuccess: () => {
      toast({ title: "Pricing sync stopped" });
      fetchStatus();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const percentage = status && status.totalParts > 0
    ? Math.round((status.completed / status.totalParts) * 100)
    : 0;

  const remaining = status ? status.totalParts - status.completed : 0;
  const pricingElapsed = status?.startedAt && status.isRunning ? Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1000) : 0;
  const pricingEta = status?.isRunning ? computeEta(pricingElapsed, status.completed, status.totalParts) : null;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm" data-testid="text-pricing-sync-title">Pricing Sync</div>
          <div className="text-xs text-muted-foreground">Sync part pricing from external sources</div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Sync part pricing from external sources (bmwpartsdeal.com, lllparts.co.uk)
          </p>
          <div className="flex items-center gap-2">
            {status?.isRunning ? (
              <Button
                variant="destructive"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                data-testid="button-stop-sync"
              >
                <Square className="w-4 h-4 mr-1" /> Stop Sync
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => startMutation.mutate(false)}
                  disabled={startMutation.isPending}
                  data-testid="button-start-sync"
                >
                  <Play className="w-4 h-4 mr-1" /> Sync New
                </Button>
                <Button
                  variant="outline"
                  onClick={() => startMutation.mutate(true)}
                  disabled={startMutation.isPending}
                  data-testid="button-force-sync"
                >
                  <RefreshCw className="w-4 h-4 mr-1" /> Force Full Sync
                </Button>
              </>
            )}
          </div>
        </div>

        {status && (status.isRunning || status.completed > 0) && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium" data-testid="text-sync-percentage">{percentage}%</span>
              </div>
              <Progress value={percentage} data-testid="progress-sync" />
            </div>

            {status.isRunning && status.currentPartNumber && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <Badge variant="outline" className="text-xs px-1.5 py-0">{status.mode === "full" ? "Full Refresh" : "New Only"}</Badge>
                <span>Processing:</span>
                <span className="font-mono" data-testid="text-current-part">{status.currentPartNumber}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-lg font-semibold" data-testid="text-sync-total">{status.totalParts.toLocaleString()}</div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Completed</div>
                <div className="text-lg font-semibold" data-testid="text-sync-completed">
                  {status.completed.toLocaleString()}
                </div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Found</div>
                <div className="flex items-center justify-center gap-1">
                  <Badge variant="default" className="text-xs" data-testid="badge-sync-found">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {status.found.toLocaleString()}
                  </Badge>
                </div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Not Found</div>
                <div className="flex items-center justify-center gap-1">
                  <Badge variant="secondary" className="text-xs" data-testid="badge-sync-not-found">
                    <XCircle className="w-3 h-3 mr-1" />
                    {status.notFound.toLocaleString()}
                  </Badge>
                </div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Errors</div>
                <div className="flex items-center justify-center gap-1">
                  <Badge variant="destructive" className="text-xs" data-testid="badge-sync-errors">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {status.errors.toLocaleString()}
                  </Badge>
                </div>
              </div>
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground">Remaining</div>
                <div className="text-lg font-semibold" data-testid="text-sync-remaining">
                  {remaining.toLocaleString()}
                </div>
              </div>
            </div>

            {status.isRunning && pricingElapsed > 0 && (
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1" data-testid="pricing-timing">
                <span>Elapsed: {formatElapsed(pricingElapsed)}</span>
                {pricingEta && <span>ETA: {pricingEta}</span>}
              </div>
            )}

            {!status.isRunning && status.completed > 0 && (
              <div className="text-xs text-muted-foreground text-center pt-1">
                Sync complete
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FeatureItem {
  icon: typeof Database;
  title: string;
  description: string;
  stats?: string;
  status: "live" | "beta" | "planned";
}

interface FeatureCategory {
  name: string;
  icon: typeof Database;
  features: FeatureItem[];
}

function getFeatureCategories(): FeatureCategory[] {
  return [
    {
      name: "Parts Catalog",
      icon: Database,
      features: [
        {
          icon: Car,
          title: "674 BMW Models",
          description: "Complete catalog covering all BMW variants from bmw-etk.info — every E/F/G-chassis, engine, market, and drivetrain combination including full X series (X1–X7, XM). Plus G87 M2 from bmwpartsdeal.com.",
          stats: "674 cars, ~4M+ part entries, ~112K+ unique parts",
          status: "live",
        },
        {
          icon: Layers,
          title: "Chassis Generation Grouping",
          description: "Cars organized by chassis generation (M Models, Classic, E-Series, F-Series, G-Series, X Models, Mini) on both the home page and sidebar for easy navigation.",
          status: "live",
        },
        {
          icon: Search,
          title: "Global Parts Search",
          description: "Search across all synced cars by part number or description. Filter by specific car to narrow results. Instant results from the local database.",
          status: "live",
        },
        {
          icon: Layers,
          title: "3-Panel Parts Browser",
          description: "Navigate the full parts hierarchy — categories, subcategories, and individual parts — in a 3-panel layout for each car model.",
          status: "live",
        },
        {
          icon: Wrench,
          title: "Cross-Reference",
          description: "See every car that uses a specific part. Identify shared parts across M and standard models on the same chassis platform.",
          status: "live",
        },
        {
          icon: Image,
          title: "Parts Diagrams",
          description: "High-resolution parts diagrams (1050x735px) with thumbnail previews (330x230px). Locally stored for instant offline access.",
          status: "live",
        },
      ],
    },
    {
      name: "Pricing & Shopping",
      icon: DollarSign,
      features: [
        {
          icon: DollarSign,
          title: "Dual-Source Live Pricing",
          description: "Real-time pricing from bmwpartsdeal.com (USD, ~54% coverage) with lllparts.co.uk fallback (GBP, ~45% of remainder). Prices converted to AUD automatically.",
          stats: "USD x1.5 → AUD, GBP x2.5 → AUD",
          status: "live",
        },
        {
          icon: ShoppingCart,
          title: "MPerformance.parts Integration",
          description: "Real-time stock check on mperformance.parts Shopify store. Shows buy link and 10% off coupon code (PARTFINDER10) for in-stock parts only.",
          status: "live",
        },
        {
          icon: RefreshCw,
          title: "Admin Pricing Sync",
          description: "Bulk background sync of pricing from both sources with real-time progress tracking. Runs at concurrency of 2 to respect rate limits. Start/stop controls with found/notFound/errors counts.",
          status: "live",
        },
        {
          icon: Lock,
          title: "Auth-Gated Pricing",
          description: "Pricing data requires user login. Unauthenticated visitors see a 'Register to See Pricing' prompt, encouraging account creation.",
          status: "live",
        },
      ],
    },
    {
      name: "VIN & Vehicle Intelligence",
      icon: Cpu,
      features: [
        {
          icon: FileText,
          title: "BMW VIN Decoder",
          description: "Full 17-digit VIN or last 7 serial decode. Returns vehicle profile (chassis, engine, year, plant), NHTSA safety data, and matched catalog parts.",
          status: "live",
        },
        {
          icon: Globe,
          title: "Dual VIN Enrichment",
          description: "Primary: bimmer.work (factory options with images, exterior/interior/360° config photos, owner's manuals). Secondary: mdecoder.com fallback. 5-source hash discovery chain (Google, Bing, DuckDuckGo, mdecoder, bvzine).",
          status: "live",
        },
        {
          icon: Car,
          title: "User Garage (My Cars)",
          description: "Save vehicles by VIN to your account. VIN auto-decoded on save with catalog car matching. Quick access to your car's parts catalog. Edit nicknames for easy identification.",
          status: "live",
        },
        {
          icon: BookOpen,
          title: "BMW Model Reference",
          description: "1,340+ model variants with chassis codes, type codes, engine specs, markets, and configuration images. Searchable and filterable by chassis code.",
          stats: "1,340+ variants across all generations",
          status: "live",
        },
      ],
    },
    {
      name: "AI & Intelligence",
      icon: Brain,
      features: [
        {
          icon: Brain,
          title: "AI Part Finder (GPT-4o Vision)",
          description: "Upload up to 5 photos of BMW parts. AI identifies them using GPT-4o vision and searches the catalog. Prompts for make/model if no matches found for better accuracy.",
          status: "live",
        },
      ],
    },
    {
      name: "API & Platform",
      icon: Globe,
      features: [
        {
          icon: Globe,
          title: "Versioned External API (v1)",
          description: "RESTful API with X-API-Key authentication. Cars, categories, parts, search, cross-reference, pricing, VIN decode, and stats endpoints.",
          status: "live",
        },
        {
          icon: Key,
          title: "3-Tier API Access",
          description: "Basic (free): cars listing, stats. Paid: + parts, search, cross-reference. Admin: + pricing, full access. Keys prefixed by tier for easy identification.",
          status: "live",
        },
        {
          icon: Users,
          title: "User Management",
          description: "Admin panel for creating/managing user accounts and roles. Passport.js local strategy with bcrypt hashing and PostgreSQL session store.",
          status: "live",
        },
        {
          icon: BarChart3,
          title: "Data Export/Import & Sync",
          description: "Export full database to JSON, import on another instance, or sync production from dev. Separate dev/production PostgreSQL databases with bundled data file.",
          status: "live",
        },
      ],
    },
    {
      name: "Data Sources",
      icon: Database,
      features: [
        {
          icon: Database,
          title: "Primary parts catalog",
          description: "Primary catalog source — 426 cars fully synced. Rate limited (500ms catalog, 400ms categories, 300ms parts). English URLs only. SSL bypass for expired certificate.",
          stats: "426 cars complete, 1 error (E90 318d N47 — HTTP 500 from source)",
          status: "live",
        },
        {
          icon: ShoppingCart,
          title: "BMWPartsDeal (bmwpartsdeal.com)",
          description: "G87 M2 parts catalog + primary pricing source. Parses __INITIAL_STORE__ JS object from pages. 2-second delay between requests.",
          stats: "~54% of unique parts have pricing",
          status: "live",
        },
        {
          icon: DollarSign,
          title: "LLLParts (lllparts.co.uk)",
          description: "Fallback pricing source for parts not on bmwpartsdeal. Server-rendered HTML with GBP prices. Covers mainly interior trim + newer generation parts.",
          stats: "~45% coverage of remaining parts",
          status: "live",
        },
        {
          icon: Globe,
          title: "bimmer.work / mdecoder.com",
          description: "VIN enrichment sources. bimmer.work provides factory options, configuration images, and manuals. mdecoder.com provides vehicle specs and SA options as fallback.",
          status: "live",
        },
      ],
    },
  ];
}

function FeaturesAndBenefits() {
  const categories = getFeatureCategories();
  const totalFeatures = categories.reduce((sum, c) => sum + c.features.length, 0);
  const liveCount = categories.reduce((sum, c) => sum + c.features.filter(f => f.status === "live").length, 0);
  const betaCount = categories.reduce((sum, c) => sum + c.features.filter(f => f.status === "beta").length, 0);

  const statusBadge = (status: string) => {
    switch (status) {
      case "live": return <Badge className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10" data-testid="badge-status-live">Live</Badge>;
      case "beta": return <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/10" data-testid="badge-status-beta">Beta</Badge>;
      case "planned": return <Badge variant="secondary" className="text-[10px]" data-testid="badge-status-planned">Planned</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="section-features">
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="flex flex-wrap gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold" data-testid="text-total-features">{totalFeatures}</div>
            <div className="text-xs text-muted-foreground">Total Features</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="text-live-count">{liveCount}</div>
            <div className="text-xs text-muted-foreground">Live</div>
          </div>
          {betaCount > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600" data-testid="text-beta-count">{betaCount}</div>
              <div className="text-xs text-muted-foreground">Beta</div>
            </div>
          )}
          <div className="text-center">
            <div className="text-2xl font-bold" data-testid="text-category-count">{categories.length}</div>
            <div className="text-xs text-muted-foreground">Categories</div>
          </div>
        </div>
      </div>

      {categories.map((category) => (
        <div key={category.name} className="space-y-3" data-testid={`category-${category.name.toLowerCase().replace(/\s+/g, "-")}`}>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <category.icon className="w-4 h-4 text-muted-foreground" />
            {category.name}
            <Badge variant="secondary" className="text-[10px] ml-1">{category.features.length}</Badge>
          </h3>
          <div className="grid gap-2">
            {category.features.map((feature) => (
              <div key={feature.title} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors" data-testid={`feature-${feature.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <div className="flex items-start gap-3">
                  <feature.icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{feature.title}</span>
                      {statusBadge(feature.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feature.description}</p>
                    {feature.stats && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">{feature.stats}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RealOemCrossRefPanel() {
  const { toast } = useToast();

  const statusQuery = useQuery<{
    running: boolean;
    totalParts: number;
    checkedCount: number;
    foundCount: number;
    errorCount: number;
    startedAt: string | null;
    estimatedEndAt: string | null;
    cancelled: boolean;
    currentPart: string;
    partsPerSecond: number;
  }>({
    queryKey: ["/api/realoem-crossref/status"],
    refetchInterval: (query) => query.state.data?.running ? 3000 : false,
  });

  const statsQuery = useQuery<{
    totalUniqueParts: number;
    totalChecked: number;
    totalFound: number;
    totalCrossRefs: number;
    topSeries: { series: string; count: number }[];
  }>({
    queryKey: ["/api/realoem-crossref/stats"],
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/realoem-crossref/start");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/realoem-crossref/status"] });
      toast({ title: "Cross-reference enrichment started", description: "Checking parts against RealOEM via Oxylabs..." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/realoem-crossref/cancel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/realoem-crossref/status"] });
      toast({ title: "Cancelled" });
    },
  });

  const st = statusQuery.data;
  const stats = statsQuery.data;
  const isRunning = st?.running || false;
  const percentage = st?.totalParts ? Math.round((st.checkedCount / st.totalParts) * 100) : 0;
  const crossRefElapsed = st?.startedAt && isRunning ? Math.floor((Date.now() - new Date(st.startedAt).getTime()) / 1000) : 0;
  const crossRefEta = isRunning ? computeEta(crossRefElapsed, st?.checkedCount || 0, st?.totalParts || 0) : null;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">RealOEM Cross-Reference</div>
          <div className="text-xs text-muted-foreground">Check all unique part numbers against realoem.com to find which BMW chassis series each part fits</div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 text-center" data-testid="crossref-stats">
          <div className="bg-muted/50 rounded-md p-2">
            <div className="text-lg font-bold">{stats.totalChecked.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> / {stats.totalUniqueParts.toLocaleString()}</span></div>
            <div className="text-xs text-muted-foreground">Checked</div>
          </div>
          <div className="bg-muted/50 rounded-md p-2">
            <div className="text-lg font-bold text-green-600">{stats.totalFound.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Found</div>
          </div>
          <div className="bg-muted/50 rounded-md p-2">
            <div className="text-lg font-bold text-primary">{stats.totalCrossRefs.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Cross-Refs</div>
          </div>
        </div>
      )}

      {stats && stats.topSeries.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Top series: </span>
          {stats.topSeries.slice(0, 10).map((s, i) => (
            <span key={s.series}>
              {i > 0 && ", "}
              <Badge variant="outline" className="text-xs font-mono px-1 py-0">{s.series}</Badge>
              <span className="text-muted-foreground/60"> ({s.count})</span>
            </span>
          ))}
        </div>
      )}

      {isRunning && st && (
        <div className="space-y-2" data-testid="crossref-progress">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Checking: {st.currentPart}
            </span>
            <span className="font-semibold text-primary">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex gap-3">
              <span>{st.checkedCount.toLocaleString()} / {st.totalParts.toLocaleString()}</span>
              <span className="text-green-600">{st.foundCount.toLocaleString()} found</span>
              <span>{st.partsPerSecond.toFixed(1)} parts/s</span>
            </div>
            <div className="flex gap-3">
              {crossRefElapsed > 0 && <span>Elapsed: {formatElapsed(crossRefElapsed)}</span>}
              {crossRefEta && <span>ETA: {crossRefEta}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!isRunning ? (
          <Button
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            data-testid="button-start-crossref"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Start Cross-Reference
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            data-testid="button-cancel-crossref"
          >
            <Square className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

interface ScrapeStatus {
  total: number;
  running: number;
  idle: number;
  complete: number;
  error: number;
  errorNoParts: number;
  withParts: number;
  totalParts: number;
  runningCars: { id: number; displayName: string; chassis: string; scrapeProgress: number; totalParts: number; totalSubcategories: number }[];
  erroredCars: { id: number; displayName: string; chassis: string; scrapeError: string | null; totalParts: number }[];
}

function AllModelsSyncPanel() {
  const { toast } = useToast();

  const statusQuery = useQuery<ScrapeStatus>({
    queryKey: ["/api/scrape-status"],
    staleTime: 0,
    refetchInterval: (query) => {
      return query.state.data?.running && query.state.data.running > 0 ? 3000 : 30000;
    },
  });

  const proxyQuery = useQuery<{ useProxy: boolean; hasCredentials: boolean }>({
    queryKey: ["/api/scrape-proxy"],
  });

  const toggleProxyMutation = useMutation({
    mutationFn: async (useProxy: boolean) => {
      const res = await apiRequest("POST", "/api/scrape-proxy", { useProxy });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape-proxy"] });
      toast({ title: data.useProxy ? "Proxy enabled" : "Proxy disabled", description: data.useProxy ? "Scraping will use Oxylabs proxy" : "Scraping will connect directly" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetStuckMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reset-stuck-scrapes");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({ title: "Reset complete", description: `${data.fixed} stuck scrapes reset` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const batchScrapeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/batch-scrape", { status: "idle", limit: 50 });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape-status"] });
      toast({ title: "Batch scrape started", description: `Started scraping ${data.started} cars` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const retryErrorsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/batch-scrape", { status: "error", limit: 50 });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scrape-status"] });
      toast({ title: "Retry started", description: data.started > 0 ? `Retrying ${data.started} errored cars` : "No errored cars to retry" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const status = statusQuery.data;
  const proxyData = proxyQuery.data;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">All Models Sync</div>
            <div className="text-xs text-muted-foreground">Monitor and manage parts catalog scraping across all BMW models</div>
          </div>
        </div>
        {proxyData && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={proxyData.useProxy ? "default" : "outline"}
              onClick={() => toggleProxyMutation.mutate(!proxyData.useProxy)}
              disabled={toggleProxyMutation.isPending || (!proxyData.hasCredentials && !proxyData.useProxy)}
              className="text-xs h-7 px-2.5"
              data-testid="button-toggle-proxy"
            >
              <Globe className="w-3 h-3 mr-1" />
              {proxyData.useProxy ? "Proxy: ON" : "Proxy: OFF"}
            </Button>
            {!proxyData.hasCredentials && (
              <span className="text-xs text-muted-foreground">No proxy credentials</span>
            )}
          </div>
        )}
      </div>

      {statusQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading scrape status...
        </div>
      )}

      {statusQuery.isError && (
        <div className="text-sm text-destructive py-2" data-testid="scrape-status-error">
          Failed to load scrape status. <Button variant="ghost" size="sm" className="text-xs p-0 h-auto" onClick={() => statusQuery.refetch()}>Retry</Button>
        </div>
      )}

      {status && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center bg-muted/30 rounded-md p-2">
              <div className="text-xs text-muted-foreground">Total Models</div>
              <div className="text-lg font-semibold" data-testid="text-total-models">{status.total}</div>
            </div>
            <div className="text-center bg-muted/30 rounded-md p-2">
              <div className="text-xs text-muted-foreground">With Parts</div>
              <div className="text-lg font-semibold text-green-600" data-testid="text-with-parts">{status.withParts}</div>
            </div>
            <div className="text-center bg-muted/30 rounded-md p-2">
              <div className="text-xs text-muted-foreground">Total Parts</div>
              <div className="text-lg font-semibold" data-testid="text-total-parts">{status.totalParts.toLocaleString()}</div>
            </div>
            <div className="text-center bg-muted/30 rounded-md p-2">
              <div className="text-xs text-muted-foreground">Idle / Errors</div>
              <div className="text-lg font-semibold">
                <span>{status.idle}</span>
                {status.errorNoParts > 0 && <span className="text-destructive ml-1">/ {status.errorNoParts}</span>}
              </div>
            </div>
          </div>

          {status.running > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>{status.running} models currently scraping</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {status.runningCars.map(car => (
                  <div key={car.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1" data-testid={`scrape-car-${car.id}`}>
                    <span className="font-medium truncate mr-2">{car.displayName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{car.totalParts.toLocaleString()} parts</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">{car.scrapeProgress}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status.error > 0 && status.erroredCars.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{status.error} models with errors{status.errorNoParts > 0 ? ` (${status.errorNoParts} have 0 parts)` : ''}</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {status.erroredCars.map(car => (
                  <div key={car.id} className="flex items-center justify-between text-xs bg-destructive/5 rounded px-2 py-1" data-testid={`error-car-${car.id}`}>
                    <span className="font-medium truncate mr-2">{car.displayName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{car.totalParts.toLocaleString()} parts</span>
                      <span className="text-destructive truncate max-w-[180px]">{car.scrapeError}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => batchScrapeMutation.mutate()}
          disabled={batchScrapeMutation.isPending}
          data-testid="button-batch-scrape"
        >
          {batchScrapeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          Scrape Idle Models
        </Button>
        {status && status.running > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => resetStuckMutation.mutate()}
            disabled={resetStuckMutation.isPending}
            data-testid="button-reset-stuck"
          >
            {resetStuckMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Reset Stuck ({status.running})
          </Button>
        )}
        {status && status.error > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => retryErrorsMutation.mutate()}
            disabled={retryErrorsMutation.isPending}
            data-testid="button-retry-errors"
          >
            {retryErrorsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Retry Errors ({status.error})
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => statusQuery.refetch()}
          data-testid="button-refresh-status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmailTestPanel() {
  const { toast } = useToast();
  const [emailTo, setEmailTo] = useState("");

  const sendTestMutation = useMutation({
    mutationFn: async (to: string) => {
      const res = await apiRequest("POST", "/api/test-email", { to });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Test email sent", description: `Email delivered successfully (ID: ${data.id})` });
      } else {
        toast({ title: "Email failed", description: data.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">Email Service</div>
          <div className="text-xs text-muted-foreground">Send a test email via Resend to verify email delivery is working</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="email"
          placeholder="recipient@example.com"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          className="max-w-xs h-8 text-sm"
          data-testid="input-test-email"
        />
        <Button
          size="sm"
          onClick={() => sendTestMutation.mutate(emailTo)}
          disabled={sendTestMutation.isPending || !emailTo.includes("@")}
          data-testid="button-send-test-email"
        >
          {sendTestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
          Send Test
        </Button>
      </div>
    </div>
  );
}

interface SyncStatus {
  running: boolean;
  finished: boolean;
  totalChunks: number;
  completedChunks: number;
  totalCars: number;
  totalParts: number;
  carsImported: number;
  partsImported: number;
  carsSkipped: number;
  partsSkipped: number;
  currentChunkCars: number;
  currentChunkParts: number;
  percentage: number;
  elapsedSeconds: number;
  etaSeconds: number | null;
  chunkErrors: string[];
  error: string | null;
}

function formatSyncDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function ResumeIncompleteScrapePanel() {
  const [status, setStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await apiRequest("GET", "/api/admin/resume-incomplete/status");
      const data = await res.json();
      setStatus(data);
      return data;
    } catch { return null; }
  };

  useEffect(() => { fetchStatus(); }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      const data = await fetchStatus();
      if (data && !data.job?.running) setPolling(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [polling]);

  const { toast } = useToast();

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/resume-incomplete/start");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Re-scraping ${data.totalCars} incomplete cars` });
      setPolling(true);
      fetchStatus();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/resume-incomplete/stop");
    },
    onSuccess: () => {
      toast({ title: "Stopping after current car finishes..." });
      fetchStatus();
    },
  });

  const [elapsedTick, setElapsedTick] = useState(0);

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => setElapsedTick(prev => prev + 1), 1000);
    return () => clearInterval(t);
  }, [polling]);

  const job = status?.job;
  const isRunning = job?.running === true;
  const totalIncomplete = status?.totalIncomplete || 0;
  const percentage = job?.totalCars > 0 ? Math.round((job.completedCars / job.totalCars) * 100) : 0;
  const elapsed = isRunning && job?.startedAt ? Math.floor((Date.now() - job.startedAt) / 1000) : 0;
  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${secs % 60}s`;
  };
  const curLive = job?.currentCarLive;
  const totalPartsCompleted = (job?.results || []).reduce((sum: number, r: any) => sum + (r.parts || 0), 0);
  const totalPartsBefore = (job?.results || []).reduce((sum: number, r: any) => sum + (r.partsBefore || 0), 0);

  if (!isRunning && totalIncomplete === 0 && (!job || job.results?.length === 0)) return null;

  return (
    <div className="border rounded-lg p-4 space-y-4" data-testid="resume-incomplete-panel">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">Resume Incomplete Scrapes</div>
          <div className="text-xs text-muted-foreground">
            {totalIncomplete} cars marked complete but only partially scraped. Re-scrape to 100% (G-chassis first).
          </div>
        </div>
      </div>

      {!isRunning && totalIncomplete > 0 && status?.incompleteCars && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Incomplete Cars Overview</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="border rounded p-2">
              <div className="text-lg font-bold" data-testid="text-incomplete-count">{totalIncomplete}</div>
              <div className="text-xs text-muted-foreground">Cars to Fix</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold" data-testid="text-incomplete-parts">{(status.incompleteCars.reduce((s: number, c: any) => s + (c.totalParts || 0), 0)).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Current Parts</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold" data-testid="text-incomplete-avg">{Math.round(status.incompleteCars.reduce((s: number, c: any) => s + (c.scrapeProgress || 0), 0) / totalIncomplete)}%</div>
              <div className="text-xs text-muted-foreground">Avg Progress</div>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-1.5 font-medium">Car</th>
                  <th className="text-center p-1.5 font-medium">Chassis</th>
                  <th className="text-right p-1.5 font-medium">Progress</th>
                  <th className="text-right p-1.5 font-medium">Parts</th>
                </tr>
              </thead>
              <tbody>
                {status.incompleteCars.map((c: any) => (
                  <tr key={c.id} className="border-t border-muted/30">
                    <td className="p-1.5 truncate max-w-[180px]" data-testid={`text-incomplete-car-${c.id}`}>{c.displayName}</td>
                    <td className="p-1.5 text-center">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.chassis}</Badge>
                    </td>
                    <td className="p-1.5 text-right">
                      <span className={c.scrapeProgress < 30 ? "text-red-500 font-medium" : c.scrapeProgress < 60 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
                        {c.scrapeProgress}%
                      </span>
                    </td>
                    <td className="p-1.5 text-right text-muted-foreground">{(c.totalParts || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isRunning && job && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Overall: {job.completedCars}/{job.totalCars} cars
            </span>
            <span className="font-semibold text-primary">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="border rounded p-1.5">
              <div className="font-bold text-sm" data-testid="text-resume-elapsed">{formatDuration(elapsed)}</div>
              <div className="text-muted-foreground">Elapsed</div>
            </div>
            <div className="border rounded p-1.5">
              <div className="font-bold text-sm" data-testid="text-resume-remaining">{job.totalCars - job.completedCars - (curLive ? 1 : 0)}</div>
              <div className="text-muted-foreground">Remaining</div>
            </div>
            <div className="border rounded p-1.5">
              <div className="font-bold text-sm" data-testid="text-resume-total-parts">{totalPartsCompleted.toLocaleString()}</div>
              <div className="text-muted-foreground">Parts Scraped</div>
            </div>
          </div>

          {curLive && (
            <div className="border rounded p-3 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  {curLive.displayName}
                </span>
                <Badge variant="outline" className="text-xs">{curLive.chassis}</Badge>
              </div>
              <Progress value={curLive.scrapeProgress || 0} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{curLive.scrapeProgress || 0}% complete</span>
                <span>{(curLive.totalParts || 0).toLocaleString()} parts</span>
                <span>{curLive.totalCategories || 0} cats / {curLive.totalSubcategories || 0} subcats</span>
              </div>
            </div>
          )}
        </div>
      )}

      {job?.results && job.results.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Completed ({job.results.length})</span>
            {totalPartsBefore > 0 && (
              <span className="text-muted-foreground">
                {totalPartsBefore.toLocaleString()} → {totalPartsCompleted.toLocaleString()} parts
              </span>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-1.5 font-medium">Car</th>
                  <th className="text-center p-1.5 font-medium">Status</th>
                  <th className="text-right p-1.5 font-medium">Before</th>
                  <th className="text-right p-1.5 font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                {job.results.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-muted/30">
                    <td className="p-1.5 truncate max-w-[160px]">
                      <span className="mr-1">{r.chassis && <Badge variant="outline" className="text-[10px] px-1 py-0 mr-1">{r.chassis}</Badge>}</span>
                      {r.displayName}
                    </td>
                    <td className="p-1.5 text-center">
                      {r.status === "complete" ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-600 inline" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-500 inline" />
                      )}
                    </td>
                    <td className="p-1.5 text-right text-muted-foreground">{(r.partsBefore || 0).toLocaleString()}</td>
                    <td className="p-1.5 text-right font-medium">
                      <span className={r.parts > (r.partsBefore || 0) ? "text-green-600" : ""}>{(r.parts || 0).toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!isRunning ? (
          <Button
            size="sm"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || totalIncomplete === 0}
            data-testid="button-resume-incomplete"
          >
            {startMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Re-scrape {totalIncomplete} Incomplete Cars
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            data-testid="button-stop-resume"
          >
            <Square className="w-3.5 h-3.5 mr-1" />
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}

function DevSyncPanel() {
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: mismatchData, refetch: refetchMismatch } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/count-mismatch"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/count-mismatch");
      return res.json();
    },
    refetchInterval: 60000,
  });
  const mismatchCount = mismatchData?.count ?? 0;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync-from-dev/status");
      const data: SyncStatus = await res.json();
      setSyncStatus(data);
      if (data.finished && !data.running) {
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
        if (data.error) {
          toast({ title: "Sync error", description: data.error, variant: "destructive" });
        } else if (data.carsImported > 0) {
          toast({ title: "Sync complete", description: `Imported ${data.carsImported} cars, ${data.partsImported.toLocaleString()} new parts` });
        } else {
          toast({ title: "Sync complete", description: `All ${data.totalCars.toLocaleString()} cars already up to date` });
        }
      }
    } catch {}
  }, [stopPolling, toast]);

  const startPolling = useCallback(() => {
    stopPolling();
    fetchSyncStatus();
    pollRef.current = setInterval(fetchSyncStatus, 1500);
  }, [fetchSyncStatus, stopPolling]);

  useEffect(() => {
    fetchSyncStatus();
    return stopPolling;
  }, [fetchSyncStatus, stopPolling]);

  useEffect(() => {
    if (syncStatus?.running && !pollRef.current) {
      startPolling();
    }
  }, [syncStatus?.running, startPolling]);

  const handleSyncFromDev = async (force = false) => {
    try {
      const res = await fetch("/api/sync-from-dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      startPolling();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bmw-parts-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: `Downloaded ${data.cars?.length || 0} cars` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const [isFixingMismatch, setIsFixingMismatch] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const invalidateAfterRecalc = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cars/homepage"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/count-mismatch"] });
    refetchMismatch();
  };

  const handleFixMismatch = async () => {
    setIsFixingMismatch(true);
    try {
      const res = await fetch("/api/recalculate-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const scanned = data.mismatchScanned ?? data.carsUpdated;
      toast({
        title: "Stale counts fixed",
        description: data.carsUpdated === 0
          ? "No mismatched cars found — all counts are up to date"
          : `Fixed ${data.carsUpdated} of ${scanned} mismatched models`,
      });
      invalidateAfterRecalc();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsFixingMismatch(false);
    }
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const res = await fetch("/api/recalculate-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      toast({ title: "Counts recalculated", description: `Updated ${data.carsUpdated} cars` });
      invalidateAfterRecalc();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsRecalculating(false);
    }
  };

  const isRunning = syncStatus?.running === true;
  const justFinished = syncStatus?.finished === true && !syncStatus?.running;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <DatabaseBackup className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">Data Sync & Maintenance</div>
          <div className="text-xs text-muted-foreground">Sync from dev, export data, fix duplicates, and recalculate counts</div>
        </div>
      </div>

      {isRunning && syncStatus && (
        <div className="space-y-2" data-testid="sync-progress-panel">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              {syncStatus.carsSkipped > 0
                ? `Processing chunk ${syncStatus.completedChunks + 1} of ${syncStatus.totalChunks} (${syncStatus.completedChunks} skipped)`
                : `Importing chunk ${syncStatus.completedChunks + 1} of ${syncStatus.totalChunks}`
              }
            </span>
            <span className="font-semibold text-primary" data-testid="text-sync-percentage">{syncStatus.percentage}%</span>
          </div>
          <Progress value={syncStatus.percentage} className="h-2.5" data-testid="progress-sync-bar" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex gap-3">
              <span>{syncStatus.carsImported.toLocaleString()} new, {syncStatus.carsSkipped.toLocaleString()} skipped / {syncStatus.totalCars.toLocaleString()} cars</span>
              <span>{syncStatus.partsImported.toLocaleString()} parts</span>
            </div>
            <div className="flex gap-3">
              <span>Elapsed: {formatSyncDuration(syncStatus.elapsedSeconds)}</span>
              {syncStatus.etaSeconds !== null && <span className="font-medium text-foreground">ETA: {formatSyncDuration(syncStatus.etaSeconds)}</span>}
            </div>
          </div>
        </div>
      )}

      {justFinished && syncStatus && !syncStatus.error && (
        <div className="p-2 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm" data-testid="sync-complete-banner">
          <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-medium">
            <CheckCircle className="w-4 h-4" />
            Sync complete
          </div>
          <div className="text-xs text-green-600 dark:text-green-500 mt-0.5">
            {syncStatus.carsImported > 0
              ? `Imported ${syncStatus.carsImported.toLocaleString()} cars, ${syncStatus.partsImported.toLocaleString()} parts`
              : `All ${syncStatus.totalCars.toLocaleString()} cars already up to date`}
            {` in ${formatSyncDuration(syncStatus.elapsedSeconds)}`}
          </div>
        </div>
      )}

      {justFinished && syncStatus?.error && (
        <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm" data-testid="sync-error-banner">
          <div className="flex items-center gap-1.5 text-destructive font-medium">
            <XCircle className="w-4 h-4" />
            Sync failed: {syncStatus.error}
          </div>
        </div>
      )}

      {mismatchCount > 0 && (
        <div
          className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm flex items-center justify-between gap-3"
          data-testid="mismatch-count-banner"
        >
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <span className="font-semibold">{mismatchCount} {mismatchCount === 1 ? "model" : "models"}</span>
              {" "}have parts but show 0 categories — counts are stale.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleFixMismatch}
            disabled={isFixingMismatch}
            className="shrink-0 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            data-testid="button-fix-mismatch"
          >
            {isFixingMismatch
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Fixing…</>
              : <><Wrench className="w-3 h-3 mr-1.5" />Fix Now</>
            }
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isRunning} data-testid="button-sync-from-dev">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Sync from Dev
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sync from Dev Environment?</AlertDialogTitle>
              <AlertDialogDescription>
                This will pull all scraped car and parts data from the development database into production.
                Only new or updated records will be imported. This is a legacy feature — production is now the primary data source.
                Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleSyncFromDev(false)}>Sync</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isRunning} data-testid="button-force-resync">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Force Re-sync
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Force Full Re-sync?</AlertDialogTitle>
              <AlertDialogDescription>
                This will re-import ALL data from dev, overwriting existing records and bypassing skip logic.
                This can take several minutes and may create duplicates that need cleanup afterward.
                Only use this if you know what you're doing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleSyncFromDev(true)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Force Re-sync
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export JSON
        </Button>

        <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={isRecalculating} data-testid="button-recalculate">
          {isRecalculating
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Recounting…</>
            : <><Calculator className="w-3.5 h-3.5 mr-1.5" />Recount All</>
          }
        </Button>
      </div>
    </div>
  );
}

function LinkClicksPanel() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/link-clicks/stats", days],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/link-clicks/stats?days=${days}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6" data-testid="link-clicks-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">External Link Click Tracking</h3>
          <p className="text-sm text-muted-foreground">All outbound links route through /go for click analytics</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[130px]" data-testid="select-days">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading click data...
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 text-center">
              <div className="text-3xl font-bold" data-testid="text-total-clicks">{stats.totalClicks.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Clicks</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-3xl font-bold" data-testid="text-total-sites">{stats.byDestination?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Sites Clicked</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-3xl font-bold" data-testid="text-unique-parts">{stats.uniqueParts || 0}</div>
              <div className="text-sm text-muted-foreground">Unique Parts</div>
            </div>
          </div>

          {stats.byDestination && stats.byDestination.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 border-b font-semibold text-sm">Clicks by Destination</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">Site</th>
                    <th className="text-right p-3 font-medium">Clicks</th>
                    <th className="text-right p-3 font-medium">Unique Parts</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byDestination.map((row: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 font-medium" data-testid={`text-site-${i}`}>{row.site}</td>
                      <td className="p-3 text-right font-mono" data-testid={`text-clicks-${i}`}>{Number(row.clicks).toLocaleString()}</td>
                      <td className="p-3 text-right text-muted-foreground">{Number(row.unique_parts).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stats.topParts && stats.topParts.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 border-b font-semibold text-sm">Top Clicked Parts</div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Part Number</th>
                      <th className="text-right p-3 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topParts.map((row: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-3 font-mono text-sm" data-testid={`text-part-${i}`}>{row.part_number}</td>
                        <td className="p-3 text-right font-mono">{Number(row.clicks).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.byDay && stats.byDay.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 border-b font-semibold text-sm">Clicks by Day</div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-right p-3 font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byDay.map((row: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{row.day}</td>
                        <td className="p-3 text-right font-mono">{Number(row.clicks).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No click data available yet.</div>
      )}
    </div>
  );
}

interface CatalogCoverage {
  ok: boolean;
  total: number;
  covered: number;
  pending: number;
  skipped: number;
  inProgress: number;
  totalParts: number;
  pct: number;
  complete: boolean;
  breakdown: { chassis: string; status: string; parts: number; carCount: number }[];
  completedAt: string | null;
  etaMinutes: number | null;
}

interface EtkUncoveredStatus {
  ok: boolean;
  running: boolean;
  jobId: number | null;
  total: number;
  done: number;
  partsFound: number;
  currentChassis: string | null;
  currentCarName: string | null;
  errors: string[];
  uncoveredCount: number;
}

function formatEta(minutes: number): string {
  if (minutes < 60) return `~${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function CatalogCoverageCard() {
  const { toast } = useToast();

  const { data, isLoading, dataUpdatedAt } = useQuery<CatalogCoverage>({
    queryKey: ["/api/admin/catalog-coverage"],
    refetchInterval: 60_000,
  });

  const { data: etkStatus, refetch: refetchEtk } = useQuery<EtkUncoveredStatus>({
    queryKey: ["/api/admin/etk-uncovered-backfill/status"],
    refetchInterval: (query) => (query.state.data?.running ? 5_000 : 30_000),
  });

  const startEtkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/etk-uncovered-backfill/start");
      return res.json();
    },
    onSuccess: (d: any) => {
      refetchEtk();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/catalog-coverage"] });
      if (d.ok) {
        toast({ title: "ETK backfill started", description: d.message });
      } else {
        toast({ title: "Could not start", description: d.message, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelEtkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/etk-uncovered-backfill/cancel");
      return res.json();
    },
    onSuccess: () => {
      refetchEtk();
      toast({ title: "Cancel requested", description: "Will stop after the current car finishes." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4 space-y-3" data-testid="catalog-coverage-card">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-muted-foreground" />
          <div className="font-semibold text-sm">Catalog Coverage</div>
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { total, covered, pending, skipped, inProgress, totalParts, pct, complete, completedAt, etaMinutes } = data;
  const etkRunning = etkStatus?.running ?? false;
  const etkUncoveredCount = etkStatus?.uncoveredCount ?? 0;
  const showEtkButton = covered < total && !etkRunning;
  const etkPct = etkStatus && etkStatus.total > 0
    ? Math.round((etkStatus.done / etkStatus.total) * 100)
    : 0;

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid="catalog-coverage-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Catalog Coverage</div>
            <div className="text-xs text-muted-foreground">
              {complete ? (
                <span className="text-green-600 font-medium" data-testid="text-coverage-complete">
                  Scrape complete{completedAt ? ` — finished ${new Date(completedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </span>
              ) : inProgress > 0 ? (
                <span className="text-blue-600 font-medium" data-testid="text-coverage-active">
                  Scraping in progress{etaMinutes != null ? ` · ETA ${formatEta(etaMinutes)}` : ""}
                </span>
              ) : (
                <span data-testid="text-coverage-idle">
                  RealOEM backfill progress across all chassis{etaMinutes != null ? ` · ETA ${formatEta(etaMinutes)}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        {lastRefreshed && (
          <span className="text-[10px] text-muted-foreground" data-testid="text-coverage-refreshed">
            Updated {lastRefreshed}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{covered} of {total} chassis covered</span>
          <span className="font-medium" data-testid="text-coverage-pct">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" data-testid="progress-coverage" />
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        <div className="bg-green-50 dark:bg-green-950/30 rounded-md p-2 border border-green-200 dark:border-green-800">
          <div className="text-sm font-bold text-green-700 dark:text-green-400" data-testid="text-coverage-covered">{covered}</div>
          <div className="text-[10px] text-muted-foreground">Covered</div>
        </div>
        <div className={`rounded-md p-2 border ${inProgress > 0 ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" : "bg-muted/30"}`}>
          <div className={`text-sm font-bold ${inProgress > 0 ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"}`} data-testid="text-coverage-in-progress">{inProgress}</div>
          <div className="text-[10px] text-muted-foreground">In Progress</div>
        </div>
        <div className="bg-muted/30 rounded-md p-2 border">
          <div className="text-sm font-bold" data-testid="text-coverage-pending">{pending}</div>
          <div className="text-[10px] text-muted-foreground">Pending</div>
        </div>
        <div className="bg-muted/30 rounded-md p-2 border">
          <div className="text-sm font-bold text-muted-foreground" data-testid="text-coverage-skipped">{skipped}</div>
          <div className="text-[10px] text-muted-foreground">Skipped</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2 border border-blue-200 dark:border-blue-800">
          <div className="text-sm font-bold text-blue-700 dark:text-blue-400" data-testid="text-coverage-parts">{totalParts.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Total Parts</div>
        </div>
      </div>

      {/* ETK Direct Scrape section */}
      {(showEtkButton || etkRunning) && (
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                ETK Direct Scrape
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {etkRunning
                  ? `Scraping ${etkStatus!.done} of ${etkStatus!.total} uncovered cars — ${etkStatus!.partsFound.toLocaleString()} parts found so far`
                  : etkUncoveredCount > 0
                  ? `${etkUncoveredCount} BMW car${etkUncoveredCount !== 1 ? "s" : ""} have 0 parts but a catalog URL — scrape them directly via ETK`
                  : "No uncovered BMW cars with catalog URLs found"}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {etkRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => cancelEtkMutation.mutate()}
                  disabled={cancelEtkMutation.isPending}
                  data-testid="button-etk-cancel"
                >
                  {cancelEtkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                  Stop
                </Button>
              ) : (
                showEtkButton && etkUncoveredCount > 0 && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => startEtkMutation.mutate()}
                    disabled={startEtkMutation.isPending}
                    data-testid="button-etk-start"
                  >
                    {startEtkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                    Scrape uncovered chassis
                  </Button>
                )
              )}
            </div>
          </div>

          {etkRunning && etkStatus && etkStatus.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{etkStatus.currentCarName ? `→ ${etkStatus.currentCarName}` : "Starting…"}</span>
                <span>{etkPct}%</span>
              </div>
              <Progress value={etkPct} className="h-1.5" data-testid="progress-etk-backfill" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueueIdleCarsPanel() {
  const { toast } = useToast();

  const statusQuery = useQuery<{
    idleCount: number;
    job: {
      running: boolean;
      stopRequested: boolean;
      totalCars: number;
      completedCars: number;
      startedAt: number;
      results: { id: number; displayName: string; chassis: string; parts: number; status: string }[];
      currentCarLive: { id: number; displayName: string; chassis: string; scrapeProgress: number; totalParts: number; scrapeStatus: string } | null;
    };
  }>({
    queryKey: ["/api/admin/queue-idle-cars/status"],
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.job?.running ? 4000 : 30000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/queue-idle-cars/start");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.status === "nothing_to_do") {
        toast({ title: "No idle models", description: data.message });
      } else {
        toast({ title: `Queuing ${data.queued} idle models`, description: "Running one at a time — check progress below." });
      }
      statusQuery.refetch();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/queue-idle-cars/stop");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stopping after current model finishes…" });
      statusQuery.refetch();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const data = statusQuery.data;
  const job = data?.job;
  const idleCount = data?.idleCount ?? 0;
  const isRunning = job?.running ?? false;
  const isStopping = job?.stopRequested ?? false;
  const percentage = job && job.totalCars > 0 ? Math.round((job.completedCars / job.totalCars) * 100) : 0;
  const successCount = (job?.results ?? []).filter(r => r.status === "complete").length;
  const errorCount = (job?.results ?? []).filter(r => r.status === "error").length;

  if (!isRunning && idleCount === 0 && (!job || job.results.length === 0)) return null;

  return (
    <div className="border rounded-lg p-4 space-y-4" data-testid="queue-idle-cars-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Queue All NOT SYNCED Models</div>
            <div className="text-xs text-muted-foreground">
              {isRunning
                ? `Scraping model ${job!.completedCars + 1} of ${job!.totalCars} — one at a time`
                : `${idleCount} model${idleCount !== 1 ? "s" : ""} with idle status and 0 parts`}
            </div>
          </div>
        </div>

        {!isRunning ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                disabled={idleCount === 0 || startMutation.isPending}
                data-testid="button-queue-all-idle"
              >
                {startMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Play className="w-3.5 h-3.5 mr-1.5" />}
                Queue All ({idleCount})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Queue {idleCount} idle models for scraping?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will start scraping <strong>{idleCount}</strong> models that currently show "NOT SYNCED" with 0 parts.
                  They'll run sequentially, one at a time, to avoid overloading the scraper.
                  Each model takes a few minutes — the full run may take several hours.
                  You can stop the queue at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => startMutation.mutate()} data-testid="button-confirm-queue-idle">
                  Queue {idleCount} models
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending || isStopping}
            data-testid="button-stop-queue-idle"
          >
            {isStopping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Square className="w-3.5 h-3.5 mr-1.5" />}
            {isStopping ? "Stopping…" : "Stop Queue"}
          </Button>
        )}
      </div>

      {isRunning && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{job!.completedCars} of {job!.totalCars} done</span>
            <span>{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-1.5" />
          {job?.currentCarLive && (
            <div className="flex items-center justify-between text-xs bg-primary/5 rounded px-2 py-1.5" data-testid="queue-idle-current-car">
              <div className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="font-medium truncate">{job.currentCarLive.displayName}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{job.currentCarLive.chassis}</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                <span>{(job.currentCarLive.totalParts ?? 0).toLocaleString()} parts</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{job.currentCarLive.scrapeProgress ?? 0}%</Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {!isRunning && job && job.results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="text-green-600 font-medium">{successCount} synced</span>
            {errorCount > 0 && <span className="text-destructive font-medium">{errorCount} errors</span>}
            <span>{job.results.reduce((s, r) => s + (r.parts || 0), 0).toLocaleString()} total parts added</span>
          </div>
          <div className="max-h-40 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-1.5 font-medium">Model</th>
                  <th className="text-center p-1.5 font-medium">Chassis</th>
                  <th className="text-right p-1.5 font-medium">Parts</th>
                  <th className="text-center p-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {job.results.map(r => (
                  <tr key={r.id} className="border-t border-muted/30">
                    <td className="p-1.5 truncate max-w-[200px]" data-testid={`queue-idle-result-${r.id}`}>{r.displayName}</td>
                    <td className="p-1.5 text-center">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.chassis}</Badge>
                    </td>
                    <td className="p-1.5 text-right tabular-nums">{r.parts.toLocaleString()}</td>
                    <td className="p-1.5 text-center">
                      {r.status === "complete"
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500 mx-auto" />
                        : <XCircle className="w-3.5 h-3.5 text-destructive mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DataToolsPanel() {
  const { toast } = useToast();

  const enrichStatusQuery = useQuery<{
    running: boolean;
    totalEmpty: number;
    processed: number;
    enriched: number;
    failed: number;
    skipped: number;
    currentSubcategory: string;
    currentCar: string;
    startedAt: number;
    errors: string[];
  }>({
    queryKey: ["/api/enrich-empty/status"],
    refetchInterval: (query) => {
      return query.state.data?.running ? 2000 : false;
    },
  });

  const startEnrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enrich-empty");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enrich-empty/status"] });
      toast({ title: "Enrichment started", description: "Re-scraping empty subcategories from source..." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelEnrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enrich-empty/cancel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enrich-empty/status"] });
      toast({ title: "Cancelled" });
    },
  });

  const dedupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dedup-categories");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Dedup complete", description: `Removed ${data.duplicateCats || 0} categories, ${data.duplicateSubs || 0} subcategories, ${data.duplicateParts || 0} parts` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const status = enrichStatusQuery.data;
  const isRunning = status?.running || false;
  const percentage = status?.totalEmpty ? Math.round((status.processed / status.totalEmpty) * 100) : 0;
  const elapsed = status?.startedAt && isRunning ? Math.floor((Date.now() - status.startedAt) / 1000) : 0;
  const enrichEta = isRunning ? computeEta(elapsed, status?.processed || 0, status?.totalEmpty || 0) : null;

  return (
    <div className="space-y-6">
      <DevSyncPanel />

      <ResumeIncompleteScrapePanel />

      <QueueIdleCarsPanel />

      <AllModelsSyncPanel />

      <PricingSyncPanel />

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Enrich Empty Subcategories</div>
            <div className="text-xs text-muted-foreground">Re-scrape subcategories that have 0 parts from bmw-etk.info to fill missing data</div>
          </div>
        </div>

        {isRunning && status && (
          <div className="space-y-2" data-testid="enrich-progress">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Enriching: {status.currentCar} / {status.currentSubcategory}
              </span>
              <span className="font-semibold text-primary">{percentage}%</span>
            </div>
            <Progress value={percentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex gap-3">
                <span>{status.processed.toLocaleString()} / {status.totalEmpty.toLocaleString()} processed</span>
                <span className="text-green-600">{status.enriched} enriched</span>
                <span>{status.skipped} empty</span>
                {status.failed > 0 && <span className="text-destructive">{status.failed} failed</span>}
              </div>
              <span>Elapsed: {formatElapsed(elapsed)}{enrichEta ? ` · ETA: ${enrichEta}` : ''}</span>
            </div>
          </div>
        )}

        {!isRunning && status && status.processed > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="enrich-results">
            Last run: {status.enriched} subcategories enriched with parts, {status.skipped} confirmed empty, {status.failed} errors out of {status.totalEmpty} total
          </div>
        )}

        <div className="flex gap-2">
          {!isRunning ? (
            <Button
              size="sm"
              onClick={() => startEnrichMutation.mutate()}
              disabled={startEnrichMutation.isPending}
              data-testid="button-start-enrich"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Start Enrichment
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => cancelEnrichMutation.mutate()}
              disabled={cancelEnrichMutation.isPending}
              data-testid="button-cancel-enrich"
            >
              <Square className="w-3.5 h-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Fix Duplicates</div>
            <div className="text-xs text-muted-foreground">Remove duplicate categories and subcategories (keeps the earliest record)</div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dedupMutation.mutate()}
          disabled={dedupMutation.isPending}
          data-testid="button-dedup"
        >
          {dedupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Fix Duplicates
        </Button>
      </div>

      <VinYearFixPanel />

      <VinImageMigrationPanel />

      <ModelImageMigrationPanel />

      <RealOemCrossRefPanel />

      <EtkPricingUploadPanel />

      <EmailTestPanel />

      <CarverticalSettingsPanel />

      <AffiliateShopLinksPanel />

      <DictionariesPanel />

      <VinProvenanceLookupPanel />

      <VinEnrichmentStatsPanel />
    </div>
  );
}

function VinProvenanceLookupPanel() {
  const [vinInput, setVinInput] = useState("");
  const [vin, setVin] = useState<string | null>(null);
  const [nhtsaVin, setNhtsaVin] = useState<string | null>(null);
  const debugQuery = useQuery<{
    vin: string;
    enrichmentSource: Record<string, { source: string; fetchedAt?: string }> | null;
    cacheSource: string | null;
  }>({
    queryKey: ["/api/vin/debug", vin],
    enabled: !!vin,
  });
  const nhtsaQuery = useQuery<Record<string, string | null>>({
    queryKey: ["/api/vin/nhtsa", nhtsaVin],
    enabled: !!nhtsaVin,
    retry: false,
  });

  const tabs: Array<"vehicle" | "options" | "images" | "manuals"> = [
    "vehicle", "options", "images", "manuals",
  ];

  return (
    <Card data-testid="card-vin-provenance-lookup">
      <CardHeader>
        <CardTitle>Per-VIN provenance lookup</CardTitle>
        <CardDescription>Inspect which source filled each tab for a specific VIN.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = vinInput.toUpperCase().replace(/[\s\-]/g, "");
            if (v.length === 17) setVin(v);
          }}
        >
          <Input
            value={vinInput}
            onChange={(e) => setVinInput(e.target.value)}
            placeholder="17-character VIN"
            maxLength={17}
            className="font-mono"
            data-testid="input-provenance-vin"
          />
          <Button type="submit" data-testid="button-provenance-lookup">Look up</Button>
        </form>

        {vin && debugQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {vin && !debugQuery.isLoading && debugQuery.data && (
          <div className="space-y-2" data-testid="provenance-result">
            <div className="text-xs text-muted-foreground">
              Cache source: <span className="font-mono">{debugQuery.data.cacheSource || "—"}</span>
            </div>
            {!debugQuery.data.enrichmentSource && (
              <p className="text-sm text-muted-foreground">
                No per-tab provenance recorded for this VIN yet (will be populated after the next enrichment).
              </p>
            )}
            {debugQuery.data.enrichmentSource && (
              <ul className="text-sm divide-y border rounded">
                {tabs.map((tab) => {
                  const entry = debugQuery.data!.enrichmentSource![tab];
                  return (
                    <li
                      key={tab}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                      data-testid={`provenance-row-${tab}`}
                    >
                      <span className="capitalize font-medium">{tab}</span>
                      <span className="font-mono text-xs">{entry?.source || "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry?.fetchedAt ? new Date(entry.fetchedAt).toLocaleString() : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* NHTSA on-demand lookup — debug tool only; NHTSA is not in the hot decode path */}
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">NHTSA vPIC (debug only)</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!vin || nhtsaQuery.isFetching}
              onClick={() => {
                if (vin) {
                  setNhtsaVin(null);
                  setTimeout(() => setNhtsaVin(vin), 0);
                }
              }}
              data-testid="button-fetch-nhtsa"
            >
              {nhtsaQuery.isFetching ? "Fetching…" : "Fetch NHTSA data"}
            </Button>
            {nhtsaVin && nhtsaVin !== vin && (
              <span className="text-xs text-muted-foreground self-center">Showing data for {nhtsaVin}</span>
            )}
          </div>
          {nhtsaQuery.isError && (
            <p className="text-xs text-destructive" data-testid="nhtsa-error">
              {(nhtsaQuery.error as any)?.message || "NHTSA request failed"}
            </p>
          )}
          {nhtsaQuery.data && (
            <div className="rounded border bg-muted/40 p-3 space-y-1" data-testid="nhtsa-result">
              {(["make", "model", "modelYear", "bodyClass", "driveType", "series", "trim", "engineBrakeHp", "plantCity", "plantCountry"] as const).map((key) => {
                const val = (nhtsaQuery.data as any)[key];
                if (!val) return null;
                return (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground w-28 shrink-0">{key}</span>
                    <span className="font-mono" data-testid={`nhtsa-field-${key}`}>{val}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// External Tools — admin-controlled affiliate parameters for the
// carvertical mileage-check link rendered in VinDecoder VehicleTab.
// Persists via /api/admin/settings/carvertical (Task #59).
function CarverticalSettingsPanel() {
  const { toast } = useToast();
  const settingsQuery = useQuery<{ a: string; b: string; chan: string; voucher?: string; enabled: boolean }>({
    queryKey: ["/api/settings/carvertical"],
  });
  const [draft, setDraft] = useState<{ a: string; b: string; chan: string; voucher: string; enabled: boolean } | null>(null);
  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft({ voucher: "", ...settingsQuery.data });
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (next: { a: string; b: string; chan: string; voucher: string; enabled: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/settings/carvertical", next);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/carvertical"] });
      toast({ title: "Saved", description: "Carvertical affiliate settings updated." });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  if (!draft) return null;
  return (
    <Card data-testid="card-carvertical-settings">
      <CardHeader>
        <CardTitle>Carvertical mileage link</CardTitle>
        <CardDescription>Affiliate parameters appended to the VIN history link in the VIN decoder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cv-a" className="text-xs">a (account)</Label>
            <Input id="cv-a" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} data-testid="input-carvertical-a" />
          </div>
          <div>
            <Label htmlFor="cv-b" className="text-xs">b (campaign)</Label>
            <Input id="cv-b" value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value })} data-testid="input-carvertical-b" />
          </div>
          <div>
            <Label htmlFor="cv-chan" className="text-xs">chan (channel)</Label>
            <Input id="cv-chan" value={draft.chan} onChange={(e) => setDraft({ ...draft, chan: e.target.value })} data-testid="input-carvertical-chan" />
          </div>
          <div>
            <Label htmlFor="cv-voucher" className="text-xs">voucher (discount code)</Label>
            <Input id="cv-voucher" value={draft.voucher} onChange={(e) => setDraft({ ...draft, voucher: e.target.value })} data-testid="input-carvertical-voucher" placeholder="bmv" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="cv-enabled"
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            data-testid="checkbox-carvertical-enabled"
          />
          <Label htmlFor="cv-enabled" className="text-xs">Show mileage-check link in the VIN decoder</Label>
        </div>
        <Button
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending}
          data-testid="button-save-carvertical"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ECS Tuning, Turner Motorsport, eBay, and Amazon affiliate link settings.
// Placed below the Carvertical panel in the Admin dashboard.
function AffiliateShopLinksPanel() {
  const { toast } = useToast();

  type AffiliateDraft = { enabled: boolean; id: string; mid: string; u1: string };
  type EbayDraft = { enabled: boolean; campid: string; customid: string; mkrid: string };
  type AmazonDraft = { enabled: boolean; tag: string };

  const ecsQuery = useQuery<AffiliateDraft>({ queryKey: ["/api/settings/affiliate/ecs"] });
  const turnerQuery = useQuery<AffiliateDraft>({ queryKey: ["/api/settings/affiliate/turner"] });
  const ebayQuery = useQuery<EbayDraft>({ queryKey: ["/api/settings/affiliate/ebay"] });
  const amazonQuery = useQuery<AmazonDraft>({ queryKey: ["/api/settings/affiliate/amazon"] });

  const [ecsDraft, setEcsDraft] = useState<AffiliateDraft | null>(null);
  const [turnerDraft, setTurnerDraft] = useState<AffiliateDraft | null>(null);
  const [ebayDraft, setEbayDraft] = useState<EbayDraft | null>(null);
  const [amazonDraft, setAmazonDraft] = useState<AmazonDraft | null>(null);

  useEffect(() => { if (ecsQuery.data && !ecsDraft) setEcsDraft(ecsQuery.data); }, [ecsQuery.data]);
  useEffect(() => { if (turnerQuery.data && !turnerDraft) setTurnerDraft(turnerQuery.data); }, [turnerQuery.data]);
  useEffect(() => { if (ebayQuery.data && !ebayDraft) setEbayDraft(ebayQuery.data); }, [ebayQuery.data]);
  useEffect(() => { if (amazonQuery.data && !amazonDraft) setAmazonDraft(amazonQuery.data); }, [amazonQuery.data]);

  const ecsMutation = useMutation({
    mutationFn: async (next: AffiliateDraft) => { const res = await apiRequest("POST", "/api/admin/settings/affiliate/ecs", next); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/affiliate/ecs"] }); toast({ title: "Saved", description: "ECS Tuning affiliate settings updated." }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });
  const turnerMutation = useMutation({
    mutationFn: async (next: AffiliateDraft) => { const res = await apiRequest("POST", "/api/admin/settings/affiliate/turner", next); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/affiliate/turner"] }); toast({ title: "Saved", description: "Turner Motorsport affiliate settings updated." }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });
  const ebayMutation = useMutation({
    mutationFn: async (next: EbayDraft) => { const res = await apiRequest("POST", "/api/admin/settings/affiliate/ebay", next); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/affiliate/ebay"] }); toast({ title: "Saved", description: "eBay affiliate settings updated." }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });
  const amazonMutation = useMutation({
    mutationFn: async (next: AmazonDraft) => { const res = await apiRequest("POST", "/api/admin/settings/affiliate/amazon", next); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/affiliate/amazon"] }); toast({ title: "Saved", description: "Amazon affiliate settings updated." }); },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  function AffiliateSection({
    label, draft, setDraft, isPending, onSave, testPrefix,
  }: { label: string; draft: AffiliateDraft | null; setDraft: (d: AffiliateDraft) => void; isPending: boolean; onSave: () => void; testPrefix: string }) {
    if (!draft) return null;
    return (
      <div className="space-y-3 pb-4 border-b last:border-b-0 last:pb-0">
        <p className="text-sm font-medium">{label}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor={`${testPrefix}-id`} className="text-xs">id (LinkSynergy publisher ID)</Label>
            <Input id={`${testPrefix}-id`} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} data-testid={`input-${testPrefix}-id`} />
          </div>
          <div>
            <Label htmlFor={`${testPrefix}-mid`} className="text-xs">mid (merchant ID)</Label>
            <Input id={`${testPrefix}-mid`} value={draft.mid} onChange={(e) => setDraft({ ...draft, mid: e.target.value })} data-testid={`input-${testPrefix}-mid`} />
          </div>
          <div>
            <Label htmlFor={`${testPrefix}-u1`} className="text-xs">u1 (tracking sub-ID)</Label>
            <Input id={`${testPrefix}-u1`} value={draft.u1} onChange={(e) => setDraft({ ...draft, u1: e.target.value })} placeholder="bmv" data-testid={`input-${testPrefix}-u1`} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={`${testPrefix}-enabled`}
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            data-testid={`checkbox-${testPrefix}-enabled`}
          />
          <Label htmlFor={`${testPrefix}-enabled`} className="text-xs">Show "{label}" button on part detail pages</Label>
        </div>
        <Button onClick={onSave} disabled={isPending} data-testid={`button-save-${testPrefix}`}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    );
  }

  return (
    <Card data-testid="card-affiliate-shop-links">
      <CardHeader>
        <CardTitle>Affiliate shop links</CardTitle>
        <CardDescription>Affiliate parameters for ECS Tuning, Turner Motorsport, eBay, and Amazon. Buttons appear side by side on every part detail page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AffiliateSection
          label="ECS Tuning"
          draft={ecsDraft}
          setDraft={setEcsDraft}
          isPending={ecsMutation.isPending}
          onSave={() => ecsDraft && ecsMutation.mutate(ecsDraft)}
          testPrefix="ecs"
        />
        <AffiliateSection
          label="Turner Motorsport"
          draft={turnerDraft}
          setDraft={setTurnerDraft}
          isPending={turnerMutation.isPending}
          onSave={() => turnerDraft && turnerMutation.mutate(turnerDraft)}
          testPrefix="turner"
        />
        {ebayDraft && (
          <div className="space-y-3 pb-4 border-b last:border-b-0 last:pb-0">
            <p className="text-sm font-medium">eBay</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ebay-campid" className="text-xs">campid (Campaign ID)</Label>
                <Input id="ebay-campid" value={ebayDraft.campid} onChange={(e) => setEbayDraft({ ...ebayDraft, campid: e.target.value })} data-testid="input-ebay-campid" />
              </div>
              <div>
                <Label htmlFor="ebay-customid" className="text-xs">customid (Custom ID)</Label>
                <Input id="ebay-customid" value={ebayDraft.customid} onChange={(e) => setEbayDraft({ ...ebayDraft, customid: e.target.value })} placeholder="BMV" data-testid="input-ebay-customid" />
              </div>
              <div>
                <Label htmlFor="ebay-mkrid" className="text-xs">mkrid (Rotation ID)</Label>
                <Input id="ebay-mkrid" value={ebayDraft.mkrid} onChange={(e) => setEbayDraft({ ...ebayDraft, mkrid: e.target.value })} data-testid="input-ebay-mkrid" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="ebay-enabled"
                type="checkbox"
                checked={ebayDraft.enabled}
                onChange={(e) => setEbayDraft({ ...ebayDraft, enabled: e.target.checked })}
                data-testid="checkbox-ebay-enabled"
              />
              <Label htmlFor="ebay-enabled" className="text-xs">Enable affiliate parameters on the eBay button (disabling falls back to a plain search URL)</Label>
            </div>
            <Button onClick={() => ebayMutation.mutate(ebayDraft)} disabled={ebayMutation.isPending} data-testid="button-save-ebay">
              {ebayMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        {amazonDraft && (
          <div className="space-y-3 pb-4 border-b last:border-b-0 last:pb-0">
            <p className="text-sm font-medium">Amazon</p>
            <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
              <div>
                <Label htmlFor="amazon-tag" className="text-xs">tag (Associate Tag / tracking ID)</Label>
                <Input id="amazon-tag" value={amazonDraft.tag} onChange={(e) => setAmazonDraft({ ...amazonDraft, tag: e.target.value })} placeholder="amandadoyle-22" data-testid="input-amazon-tag" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="amazon-enabled"
                type="checkbox"
                checked={amazonDraft.enabled}
                onChange={(e) => setAmazonDraft({ ...amazonDraft, enabled: e.target.checked })}
                data-testid="checkbox-amazon-enabled"
              />
              <Label htmlFor="amazon-enabled" className="text-xs">Enable affiliate parameters on the Amazon button (disabling falls back to a plain search URL)</Label>
            </div>
            <Button onClick={() => amazonMutation.mutate(amazonDraft)} disabled={amazonMutation.isPending} data-testid="button-save-amazon">
              {amazonMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Re-import the SA / paint / upholstery dictionary tables from the
// JSON files in `data/dictionaries/`. Idempotent (Task #59).
function DictionariesPanel() {
  const { toast } = useToast();
  const statsQuery = useQuery<{ saCodes: number; paintCodes: number; upholsteryCodes: number }>({
    queryKey: ["/api/admin/dictionaries/stats"],
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/dictionaries/import");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dictionaries/stats"] });
      toast({ title: "Dictionaries imported", description: `SA ${data.saCodes} / Paint ${data.paintCodes} / Upholstery ${data.upholsteryCodes}` });
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });
  const stats = statsQuery.data;
  return (
    <Card data-testid="card-dictionaries">
      <CardHeader>
        <CardTitle>VIN enrichment dictionaries</CardTitle>
        <CardDescription>SA option, paint and upholstery codes used to translate raw codes into human-readable names.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div data-testid="text-sa-count"><span className="font-medium">{stats?.saCodes ?? "—"}</span> SA codes</div>
          <div data-testid="text-paint-count"><span className="font-medium">{stats?.paintCodes ?? "—"}</span> Paints</div>
          <div data-testid="text-upholstery-count"><span className="font-medium">{stats?.upholsteryCodes ?? "—"}</span> Upholsteries</div>
        </div>
        <Button
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending}
          data-testid="button-reimport-dictionaries"
        >
          {importMutation.isPending ? "Importing..." : "Re-import from JSON"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Aggregated counters of which source filled each VIN tab. Drives the
// "are we still hitting bimmer.work?" answer (Task #59). The stats
// endpoint returns four buckets keyed by tab.
type EnrichmentSourceStats = Record<
  "vehicle" | "options" | "images" | "manuals",
  Record<string, number>
>;
function VinEnrichmentStatsPanel() {
  const statsQuery = useQuery<EnrichmentSourceStats>({
    queryKey: ["/api/admin/vin-enrichment-stats"],
  });
  const data = statsQuery.data;
  const tabs: Array<keyof EnrichmentSourceStats> = ["vehicle", "options", "images", "manuals"];

  return (
    <Card data-testid="card-enrichment-stats">
      <CardHeader>
        <CardTitle>VIN enrichment provenance</CardTitle>
        <CardDescription>How often each tab was filled by the first-party catalog / BMW configurator / BMW manuals vs the bimmer.work fallback.</CardDescription>
      </CardHeader>
      <CardContent>
        {statsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!statsQuery.isLoading && data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tabs.map((tab) => {
              const buckets = data[tab] || {};
              const total = Object.values(buckets).reduce((a, b) => a + b, 0);
              return (
                <div key={tab} className="border rounded p-3" data-testid={`stats-tab-${tab}`}>
                  <div className="font-medium capitalize mb-2">{tab}</div>
                  {total === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
                  {total > 0 && (
                    <ul className="text-sm space-y-1">
                      {Object.entries(buckets)
                        .sort(([, a], [, b]) => b - a)
                        .map(([source, count]) => (
                          <li
                            key={source}
                            className="flex justify-between"
                            data-testid={`stats-${tab}-${source}`}
                          >
                            <span className="font-mono">{source}</span>
                            <span>{count} ({Math.round((count / total) * 100)}%)</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EtkPricingUploadPanel() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [eurAudRate, setEurAudRate] = useState<string>("1.65");
  const [result, setResult] = useState<{
    filename: string;
    totalLines: number;
    parsedRows: number;
    upsertedRows: number;
    matchedExistingParts: number;
    durationMs: number;
  } | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
      }
      const contentBase64 = btoa(binary);
      const rate = parseFloat(eurAudRate);
      const res = await apiRequest("POST", "/api/admin/etk-pricing/upload", {
        filename: file.name,
        contentBase64,
        eurAudRate: !isNaN(rate) && rate > 0 ? rate : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      toast({
        title: "Pricing import complete",
        description: `${data.parsedRows.toLocaleString()} rows imported · ${data.matchedExistingParts.toLocaleString()} matched parts in your catalog`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid="panel-etk-pricing-upload">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Database className="w-4 h-4" /> BMW Europe Dealer Pricing (etkpr*.zip)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a monthly BMW European pricing list (e.g. <code>etkpr2604.zip</code>, ~10–20 MB). Each row updates
          the EU dealer price for that part number. AUD approximation uses the rate below.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Pricing zip file</label>
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            className="block w-full text-sm border rounded-md px-2 py-1.5 file:mr-2 file:py-1 file:px-2 file:border-0 file:rounded file:bg-muted file:text-xs hover:file:bg-muted/70"
            data-testid="input-etk-zip-file"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">EUR → AUD</label>
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="3"
            value={eurAudRate}
            onChange={(e) => setEurAudRate(e.target.value)}
            className="w-24 text-sm border rounded-md px-2 py-1.5"
            data-testid="input-etk-eur-aud-rate"
          />
        </div>
        <Button
          onClick={() => uploadMutation.mutate()}
          disabled={!file || uploadMutation.isPending}
          data-testid="button-etk-upload"
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing…</>
          ) : (
            "Upload & Import"
          )}
        </Button>
      </div>

      {file && !uploadMutation.isPending && !result && (
        <div className="text-xs text-muted-foreground">
          Selected: <span className="font-mono">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </div>
      )}

      {result && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1" data-testid="text-etk-import-result">
          <div className="font-medium">{result.filename} imported in {(result.durationMs / 1000).toFixed(1)}s</div>
          <div className="text-xs text-muted-foreground">
            {result.totalLines.toLocaleString()} lines read ·{" "}
            {result.parsedRows.toLocaleString()} valid rows ·{" "}
            <span className="text-foreground font-medium">{result.upsertedRows.toLocaleString()}</span> upserted ·{" "}
            <span className="text-blue-700 dark:text-blue-400 font-medium">{result.matchedExistingParts.toLocaleString()}</span>{" "}
            matched parts in your catalog
          </div>
        </div>
      )}
    </div>
  );
}

function VinImageMigrationPanel() {
  const { toast } = useToast();
  const [result, setResult] = useState<{ total: number; migrated: number; skipped: number; errors: number } | null>(null);

  const cacheStatsQuery = useQuery<{ cachedVins: number; savedCars: number }>({
    queryKey: ["/api/admin/vin-cache-stats"],
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-vin-images");
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vin-cache-stats"] });
      toast({
        title: "VIN image migration complete",
        description: `${data.migrated} cars migrated, ${data.skipped} skipped, ${data.errors} errors out of ${data.total} total`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Migration failed", description: err.message, variant: "destructive" });
    },
  });

  const stats = cacheStatsQuery.data;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Image className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">VIN Image Cache</div>
          <div className="text-xs text-muted-foreground">Every VIN decode is automatically cached with locally stored images. Download images for any remaining remote URLs.</div>
        </div>
      </div>
      {stats && (
        <div className="flex gap-4 text-sm">
          <div className="bg-muted/50 rounded-md px-3 py-2 text-center" data-testid="stat-cached-vins">
            <div className="text-lg font-bold text-primary">{stats.cachedVins}</div>
            <div className="text-xs text-muted-foreground">Cached VINs</div>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2 text-center" data-testid="stat-saved-cars">
            <div className="text-lg font-bold">{stats.savedCars}</div>
            <div className="text-xs text-muted-foreground">Saved Cars</div>
          </div>
        </div>
      )}
      {result && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="vin-image-migration-results">
          Last run: {result.migrated} cars migrated, {result.skipped} skipped, {result.errors} errors out of {result.total} total
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => migrateMutation.mutate()}
        disabled={migrateMutation.isPending}
        data-testid="button-migrate-vin-images"
      >
        {migrateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Image className="w-3.5 h-3.5 mr-1.5" />}
        {migrateMutation.isPending ? "Downloading Images..." : "Download VIN Images"}
      </Button>
    </div>
  );
}

function VinYearFixPanel() {
  const { toast } = useToast();
  const [result, setResult] = useState<{ total: number; fixed: number; skipped: number; details: { vin: string; oldYear: number | null; newYear: number }[] } | null>(null);

  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/fix-vin-years");
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      toast({
        title: "VIN year fix complete",
        description: `${data.fixed} corrected, ${data.skipped} already correct`,
      });
    },
    onError: (err: any) => {
      toast({ title: "VIN year fix failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Fix VIN Model Years</div>
            <div className="text-xs text-muted-foreground">Correct cached VINs where the decoded year is wrong (e.g. year 2000 bug for WBS VINs) using production date from enrichment data.</div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fixMutation.mutate()}
          disabled={fixMutation.isPending}
          data-testid="button-fix-vin-years"
        >
          {fixMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5 mr-1.5" />}
          Fix Years
        </Button>
      </div>
      {result && (
        <div className="text-xs space-y-2">
          <div className="text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="vin-year-fix-results">
            {result.fixed} fixed, {result.skipped} skipped out of {result.total} total cached VINs
          </div>
          {result.details.length > 0 && (
            <div className="bg-muted/50 rounded-md p-3 max-h-40 overflow-y-auto">
              {result.details.map((d, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className="font-mono">{d.vin}</span>
                  <span><span className="text-red-500 line-through">{d.oldYear || "null"}</span> → <span className="text-green-600 font-semibold">{d.newYear}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelImageMigrationPanel() {
  const { toast } = useToast();
  const [result, setResult] = useState<{ total: number; migrated: number; skipped: number; errors: number } | null>(null);

  const statsQuery = useQuery<{ total: number; withImage: number; local: number; remote: number }>({
    queryKey: ["/api/admin/model-image-stats"],
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrate-model-images");
      return res.json();
    },
    onSuccess: (data: any) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/model-image-stats"] });
      toast({
        title: "Model image migration complete",
        description: `${data.migrated} downloaded, ${data.skipped} skipped, ${data.errors} errors`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Migration failed", description: err.message, variant: "destructive" });
    },
  });

  const stats = statsQuery.data;

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Image className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="font-semibold text-sm">BMW Model Images</div>
          <div className="text-xs text-muted-foreground">Download all BMW model images from bimmer.work to local storage so they load without external dependencies.</div>
        </div>
      </div>
      {stats && (
        <div className="flex gap-4 text-sm">
          <div className="bg-muted/50 rounded-md px-3 py-2 text-center" data-testid="stat-model-images-total">
            <div className="text-lg font-bold">{stats.withImage}</div>
            <div className="text-xs text-muted-foreground">With Image</div>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2 text-center" data-testid="stat-model-images-local">
            <div className="text-lg font-bold text-green-600">{stats.local}</div>
            <div className="text-xs text-muted-foreground">Local</div>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2 text-center" data-testid="stat-model-images-remote">
            <div className="text-lg font-bold text-orange-500">{stats.remote}</div>
            <div className="text-xs text-muted-foreground">Remote</div>
          </div>
        </div>
      )}
      {result && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="model-image-migration-results">
          Last run: {result.migrated} downloaded, {result.skipped} skipped, {result.errors} errors
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => migrateMutation.mutate()}
        disabled={migrateMutation.isPending || (stats?.remote === 0)}
        data-testid="button-migrate-model-images"
      >
        {migrateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Image className="w-3.5 h-3.5 mr-1.5" />}
        {migrateMutation.isPending ? "Downloading Model Images..." : `Download Model Images${stats?.remote ? ` (${stats.remote})` : ""}`}
      </Button>
    </div>
  );
}

interface ServicingCoverageRow {
  chassis: string;
  engine: string;
  fluidsVerified: number;
  fluidsAiDraft: number;
  filtersVerified: number;
  filtersAiDraft: number;
  updatedAt: string | null;
}
interface ServicingCoverageRequest {
  id: number;
  chassis: string;
  engine: string;
  vin: string | null;
  email: string | null;
  createdAt: string;
}
interface ServicingFluidValueAdmin {
  capacityMl: number | null;
  grade: string | null;
  notes: string | null;
  status: "verified" | "ai_draft" | "empty";
  verifiedBy: string | null;
  verifiedAt: string | null;
}
interface ServicingDetail {
  chassis: string | null;
  engine: string | null;
  fluids: { key: string; value: ServicingFluidValueAdmin }[];
  filters: {
    filterKey: string;
    partNumber: string | null;
    note: string | null;
    status: "verified" | "ai_draft" | "empty";
    verifiedBy: string | null;
    verifiedAt: string | null;
    source: string;
  }[];
}

const ADMIN_FLUID_KEYS = ["engineOil","gearbox","frontDiff","rearDiff","transferCase","cooling"] as const;
const ADMIN_FILTER_KEYS = ["engine_oil","cabin","air","fuel","transmission"] as const;

function ServicingAdminPanel() {
  const { toast } = useToast();
  const [chassis, setChassis] = useState("");
  const [engine, setEngine] = useState("");
  const [activeKey, setActiveKey] = useState<{ chassis: string; engine: string } | null>(null);

  const coverageQuery = useQuery<{ coverage: ServicingCoverageRow[] }>({
    queryKey: ["/api/admin/servicing"],
  });
  const requestsQuery = useQuery<{ requests: ServicingCoverageRequest[] }>({
    queryKey: ["/api/admin/servicing/coverage-requests"],
  });
  const detailQuery = useQuery<ServicingDetail>({
    queryKey: ["/api/admin/servicing", activeKey?.chassis, activeKey?.engine],
    enabled: !!activeKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/servicing/${activeKey!.chassis}/${activeKey!.engine}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      if (!activeKey) throw new Error("Pick a chassis+engine first");
      return apiRequest("POST", `/api/admin/servicing/${activeKey.chassis}/${activeKey.engine}/ai-draft`, {});
    },
    onSuccess: () => {
      toast({ title: "AI draft generated", description: "Empty / draft fields filled in. Verified entries were preserved." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servicing"] });
    },
    onError: (e: any) => toast({ title: "AI draft failed", description: e?.message || "Unknown error", variant: "destructive" }),
  });

  const fluidMutation = useMutation({
    mutationFn: async (args: { fluidKey: string; body: any }) => {
      if (!activeKey) throw new Error("No selection");
      return apiRequest("PUT", `/api/admin/servicing/${activeKey!.chassis}/${activeKey!.engine}/fluid/${args.fluidKey}`, args.body);
    },
    onSuccess: () => {
      toast({ title: "Fluid saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servicing"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" }),
  });

  const filterMutation = useMutation({
    mutationFn: async (args: { filterKey: string; body: any }) => {
      if (!activeKey) throw new Error("No selection");
      return apiRequest("PUT", `/api/admin/servicing/${activeKey.chassis}/${activeKey.engine}/filter/${args.filterKey}`, args.body);
    },
    onSuccess: () => {
      toast({ title: "Filter saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servicing"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" }),
  });

  const filterDeleteMutation = useMutation({
    mutationFn: async (filterKey: string) => {
      if (!activeKey) throw new Error("No selection");
      return apiRequest("DELETE", `/api/admin/servicing/${activeKey.chassis}/${activeKey.engine}/filter/${filterKey}`);
    },
    onSuccess: () => {
      toast({ title: "Filter cleared" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servicing"] });
    },
  });

  function selectCombo() {
    const c = chassis.trim().toUpperCase();
    const e = engine.trim().toUpperCase();
    if (!c || !e) {
      toast({ title: "Enter chassis and engine", variant: "destructive" });
      return;
    }
    setActiveKey({ chassis: c, engine: e });
  }

  return (
    <div className="space-y-6" data-testid="panel-servicing-admin">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" /> Quick Servicing Info — Curation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Chassis</label>
              <Input
                value={chassis} onChange={e => setChassis(e.target.value)}
                placeholder="F10" className="w-28 uppercase" data-testid="input-servicing-chassis"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Engine</label>
              <Input
                value={engine} onChange={e => setEngine(e.target.value)}
                placeholder="N55" className="w-28 uppercase" data-testid="input-servicing-engine"
              />
            </div>
            <Button onClick={selectCombo} data-testid="button-load-servicing">Load</Button>
            {activeKey && (
              <Button
                variant="outline"
                onClick={() => aiDraftMutation.mutate()}
                disabled={aiDraftMutation.isPending}
                data-testid="button-generate-ai-draft"
              >
                {aiDraftMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Generate AI draft
              </Button>
            )}
          </div>

          {activeKey && detailQuery.isLoading && <Skeleton className="h-32" />}
          {activeKey && detailQuery.data && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Fluids — {activeKey.chassis} / {activeKey.engine}</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {ADMIN_FLUID_KEYS.map(fk => {
                    const entry = detailQuery.data!.fluids.find(f => f.key === fk);
                    const v = entry?.value || { capacityMl: null, grade: null, notes: null, status: "empty" as const, verifiedBy: null, verifiedAt: null };
                    return <FluidEditor key={`${activeKey!.chassis}-${activeKey!.engine}-${fk}`} fluidKey={fk} value={v} onSave={(body) => fluidMutation.mutate({ fluidKey: fk, body })} pending={fluidMutation.isPending} />;
                  })}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Filter part numbers</h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {ADMIN_FILTER_KEYS.map(fk => {
                    const entry = detailQuery.data!.filters.find(f => f.filterKey === fk);
                    return (
                      <FilterEditor
                        key={`${activeKey!.chassis}-${activeKey!.engine}-${fk}`} filterKey={fk}
                        partNumber={entry?.partNumber ?? ""} note={entry?.note ?? ""}
                        status={entry?.status === "verified" ? "verified" : entry?.status === "ai_draft" ? "ai_draft" : "empty"}
                        source={entry?.source ?? "none"}
                        onSave={(body) => filterMutation.mutate({ filterKey: fk, body })}
                        onClear={() => filterDeleteMutation.mutate(fk)}
                        pending={filterMutation.isPending}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Coverage</CardTitle></CardHeader>
        <CardContent>
          {coverageQuery.isLoading ? <Skeleton className="h-24" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground text-xs">
                    <th className="py-1 pr-3">Chassis</th><th className="pr-3">Engine</th>
                    <th className="pr-3">Fluids ✓ / draft</th><th className="pr-3">Filters ✓ / draft</th>
                    <th className="pr-3">Updated</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {(coverageQuery.data?.coverage || []).map(row => (
                    <tr key={`${row.chassis}-${row.engine}`} className="border-t" data-testid={`row-coverage-${row.chassis}-${row.engine}`}>
                      <td className="py-1.5 pr-3 font-mono">{row.chassis}</td>
                      <td className="pr-3 font-mono">{row.engine}</td>
                      <td className="pr-3">{row.fluidsVerified} / {row.fluidsAiDraft}</td>
                      <td className="pr-3">{row.filtersVerified} / {row.filtersAiDraft}</td>
                      <td className="pr-3 text-xs text-muted-foreground">{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}</td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => { setChassis(row.chassis); setEngine(row.engine); setActiveKey({ chassis: row.chassis, engine: row.engine }); }} data-testid={`button-edit-${row.chassis}-${row.engine}`}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                  {(coverageQuery.data?.coverage || []).length === 0 && (
                    <tr><td colSpan={6} className="py-3 text-muted-foreground italic">No servicing data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Coverage requests from users</CardTitle></CardHeader>
        <CardContent>
          {requestsQuery.isLoading ? <Skeleton className="h-24" /> : (
            <div className="space-y-1 text-sm">
              {(requestsQuery.data?.requests || []).map(r => (
                <div key={r.id} className="flex justify-between items-center py-1 border-b text-xs" data-testid={`request-${r.id}`}>
                  <div><span className="font-mono">{r.chassis}/{r.engine}</span>{r.vin && <span className="text-muted-foreground"> · VIN {r.vin}</span>}{r.email && <span className="text-muted-foreground"> · {r.email}</span>}</div>
                  <div className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {(requestsQuery.data?.requests || []).length === 0 && (
                <div className="text-muted-foreground italic">No coverage requests yet.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FluidEditor({ fluidKey, value, onSave, pending }: {
  fluidKey: string; value: ServicingFluidValueAdmin;
  onSave: (body: any) => void; pending: boolean;
}) {
  const [capacity, setCapacity] = useState(value.capacityMl?.toString() ?? "");
  const [grade, setGrade] = useState(value.grade ?? "");
  const [notes, setNotes] = useState(value.notes ?? "");
  return (
    <div className="border rounded-md p-2 space-y-1" data-testid={`fluid-editor-${fluidKey}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{fluidKey}</div>
        <Badge variant="outline" className="text-[10px]">{value.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Input placeholder="Capacity (ml)" value={capacity} onChange={e => setCapacity(e.target.value)} className="h-7 text-xs" data-testid={`input-capacity-${fluidKey}`} />
        <Input placeholder="Grade" value={grade} onChange={e => setGrade(e.target.value)} className="h-7 text-xs" data-testid={`input-grade-${fluidKey}`} />
      </div>
      <Input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} className="h-7 text-xs" data-testid={`input-notes-${fluidKey}`} />
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" className="h-6 text-xs flex-1" disabled={pending} onClick={() => onSave({ status: "verified", capacityMl: capacity, grade, notes })} data-testid={`button-verify-${fluidKey}`}>Verify</Button>
        {value.status === "verified" && (
          <Button size="sm" variant="outline" className="h-6 text-xs" disabled={pending} onClick={() => onSave({ status: "ai_draft", capacityMl: capacity, grade, notes })} data-testid={`button-revert-${fluidKey}`}>
            Revert to draft
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-6 text-xs" disabled={pending} onClick={() => onSave({ status: "empty" })} data-testid={`button-clear-${fluidKey}`}>Clear</Button>
      </div>
    </div>
  );
}

function FilterEditor({ filterKey, partNumber, note, status, source, onSave, onClear, pending }: {
  filterKey: string; partNumber: string; note: string;
  status: "verified" | "ai_draft" | "empty"; source: string;
  onSave: (body: any) => void; onClear: () => void; pending: boolean;
}) {
  const [pn, setPn] = useState(partNumber);
  const [n, setN] = useState(note);
  return (
    <div className="border rounded-md p-2 space-y-1" data-testid={`filter-editor-${filterKey}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{filterKey}</div>
        <Badge variant="outline" className="text-[10px]">{status}{source === "catalog_match" && status === "empty" ? " (auto)" : ""}</Badge>
      </div>
      <Input placeholder="Part number" value={pn} onChange={e => setPn(e.target.value)} className="h-7 text-xs font-mono" data-testid={`input-partnumber-${filterKey}`} />
      <Input placeholder="Note" value={n} onChange={e => setN(e.target.value)} className="h-7 text-xs" data-testid={`input-filter-note-${filterKey}`} />
      <div className="flex gap-1 flex-wrap">
        <Button size="sm" className="h-6 text-xs flex-1" disabled={pending || !pn.trim()} onClick={() => onSave({ status: "verified", partNumber: pn, note: n })} data-testid={`button-verify-filter-${filterKey}`}>Verify</Button>
        {status === "verified" && (
          <Button size="sm" variant="outline" className="h-6 text-xs" disabled={pending || !pn.trim()} onClick={() => onSave({ status: "ai_draft", partNumber: pn, note: n })} data-testid={`button-revert-filter-${filterKey}`}>
            Revert to draft
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-6 text-xs" disabled={pending} onClick={onClear} data-testid={`button-clear-filter-${filterKey}`}>Clear</Button>
      </div>
    </div>
  );
}

// ---- ISTA+ 4.59.x admin panel (Task #124) -----------------------------------
function ISTAPanel() {
  const { toast } = useToast();
  const [showStdout, setShowStdout] = useState(false);

  const statusQuery = useQuery<any>({
    queryKey: ["/api/admin/ista/status"],
    refetchInterval: (q) => {
      const d = q.state.data as any;
      return d?.lastRunStatus === "running" ? 3000 : 15000;
    },
  });

  const importMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ista/import"),
    onSuccess: () => {
      toast({ title: "ISTA import started", description: "Running in background — page refreshes automatically." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ista/status"] });
    },
    onError: (e: any) => {
      toast({ title: "Import failed to start", description: e.message, variant: "destructive" });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/ista/import/dry-run"),
    onSuccess: () => {
      toast({ title: "Dry run started", description: "Checks S3 access and package structure without writing data." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ista/status"] });
    },
    onError: (e: any) => {
      toast({ title: "Dry run failed", description: e.message, variant: "destructive" });
    },
  });

  const s = statusQuery.data;
  const isRunning = s?.lastRunStatus === "running";
  const progress = s?.progress ?? {};

  function statusBadge(status: string | null) {
    if (!status) return <Badge variant="outline" className="text-xs">Never run</Badge>;
    if (status === "running") return <Badge variant="default" className="text-xs animate-pulse">Running</Badge>;
    if (status === "complete") return <Badge className="text-xs bg-green-600 hover:bg-green-700">Complete</Badge>;
    if (status === "failed") return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }

  return (
    <div className="space-y-6" data-testid="panel-ista-admin">
      {/* Header / trigger card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5" /> ISTA+ 4.59.x Data Import
              </CardTitle>
              <CardDescription className="mt-1">
                Mine ISTA-DATA SQLite files and BLP/SDP-DELTA KIS.script files for
                ECU–part mappings across 21 BRV chassis groups.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => dryRunMutation.mutate()}
                disabled={dryRunMutation.isPending || isRunning}
                data-testid="button-ista-dry-run"
              >
                {dryRunMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                Dry Run
              </Button>
              <Button
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending || isRunning}
                data-testid="button-ista-import"
              >
                {isRunning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                {isRunning ? "Importing…" : "Run Import"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status row */}
          <div className="flex flex-wrap gap-4 items-start text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              {statusBadge(s?.lastRunStatus)}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Version</div>
              <span className="font-mono text-xs" data-testid="text-ista-version">{s?.version ?? "—"}</span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Last completed</div>
              <span className="text-xs" data-testid="text-ista-last-run">
                {s?.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"}
              </span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Job ID</div>
              <span className="font-mono text-xs" data-testid="text-ista-job-id">{s?.jobId ?? "—"}</span>
            </div>
          </div>

          {/* ISTA-contributed row counts (rows written by the most recent import) */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Rows contributed by last ISTA import</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { key: "ista_ecu_parts",   label: "ECU–part rows",    testId: "text-ista-ecu-parts-count" },
                { key: "sa_codes",         label: "SA codes",          testId: "text-ista-sa-codes-count" },
                { key: "paint_codes",      label: "Paint codes",       testId: "text-ista-paint-codes-count" },
                { key: "upholstery_codes", label: "Upholstery codes",  testId: "text-ista-upholstery-codes-count" },
              ] as const).map(({ key, label, testId }) => (
                <div key={key} className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold" data-testid={testId}>
                    {((s?.istaContributed as any)?.[key] ?? "—").toLocaleString?.() ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Global DB totals (all sources, for context) */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Current DB totals (all sources)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { key: "ista_ecu_parts",   label: "ECU–part rows",   testId: "text-db-ecu-parts-count" },
                { key: "sa_codes",         label: "SA codes",         testId: "text-db-sa-codes-count" },
                { key: "paint_codes",      label: "Paint codes",      testId: "text-db-paint-codes-count" },
                { key: "upholstery_codes", label: "Upholstery codes", testId: "text-db-upholstery-codes-count" },
              ] as const).map(({ key, label, testId }) => (
                <div key={key} className="rounded-md border p-3 text-center bg-muted/30">
                  <div className="text-lg font-medium" data-testid={testId}>
                    {((s?.dbTotals as any)?.[key] ?? 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live progress */}
          {isRunning && progress.phase && (
            <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1" data-testid="ista-progress-block">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="font-medium capitalize">{progress.phase}</span>
              </div>
              {progress.kisFilesParsed > 0 && (
                <div className="text-muted-foreground">KIS files parsed: {progress.kisFilesParsed}</div>
              )}
              {progress.upserted > 0 && (
                <div className="text-muted-foreground">Upserted: {progress.upserted.toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Last run summary */}
          {!isRunning && progress.ecuPartsRowsAfter !== undefined && (
            <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-0.5" data-testid="ista-last-summary">
              <div>ECU-part rows: {(progress.ecuPartsRowsBefore ?? 0).toLocaleString()} → {(progress.ecuPartsRowsAfter ?? 0).toLocaleString()}</div>
              {progress.completedAt && (
                <div className="text-muted-foreground">Completed at {new Date(progress.completedAt).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Log toggle */}
          {progress.stdout && (
            <div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => setShowStdout(v => !v)}
                data-testid="button-ista-toggle-log"
              >
                {showStdout ? "Hide" : "Show"} import log
              </Button>
              {showStdout && (
                <pre className="mt-2 text-[10px] leading-relaxed font-mono bg-muted rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap" data-testid="ista-log-output">
                  {progress.stdout}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Package inventory with per-package import telemetry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Package Inventory — ISTA+ 4.59.1x (DELTA)</CardTitle>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? <Skeleton className="h-40" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-4 font-medium">Package</th>
                    <th className="py-1.5 pr-3 font-medium">Category</th>
                    <th className="py-1.5 pr-3 font-medium">Import status</th>
                    <th className="py-1.5 font-medium">Rows contributed</th>
                  </tr>
                </thead>
                <tbody>
                  {(s?.packages ?? []).map((pkg: any, i: number) => {
                    const categoryColor: Record<string, string> = {
                      kis:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                      sqlite: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                      meta:   "bg-muted text-muted-foreground",
                    };
                    const rowsCell = (() => {
                      if (pkg.category === "kis" && pkg.ecuPartsUpserted !== undefined) {
                        return `${pkg.ecuPartsUpserted.toLocaleString()} ECU-part rows (${pkg.brvCount ?? 0} BRV groups)`;
                      }
                      if (pkg.category === "sqlite") {
                        const parts = [];
                        if (pkg.saCodesUpserted) parts.push(`${pkg.saCodesUpserted} SA`);
                        if (pkg.paintCodesUpserted) parts.push(`${pkg.paintCodesUpserted} paint`);
                        if (pkg.upholsteryCodesUpserted) parts.push(`${pkg.upholsteryCodesUpserted} upholstery`);
                        return parts.length ? parts.join(" · ") : "—";
                      }
                      return "—";
                    })();
                    return (
                      <tr key={i} className="border-b last:border-0" data-testid={`row-ista-pkg-${i}`}>
                        <td className="py-2 pr-4 font-mono text-[10px] break-all max-w-[260px] align-top">
                          <span title={pkg.description}>{pkg.name}</span>
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryColor[pkg.category] ?? ""}`}>
                            {pkg.type}
                          </span>
                        </td>
                        <td className="py-2 pr-3 align-top whitespace-nowrap" data-testid={`text-pkg-status-${i}`}>
                          {pkg.status === "imported" ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">Imported</span>
                          ) : pkg.status === "skipped" ? (
                            <span className="text-muted-foreground">Skipped</span>
                          ) : (
                            <span className="text-muted-foreground">Not yet run</span>
                          )}
                        </td>
                        <td className="py-2 align-top text-muted-foreground" data-testid={`text-pkg-rows-${i}`}>
                          {rowsCell}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BRV chassis coverage (populated after import) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">BRV Chassis Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(s?.brvCoverage ?? {}).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-4 font-medium">BRV</th>
                    <th className="py-1.5 pr-4 font-medium">ECU-parts upserted</th>
                    <th className="py-1.5 font-medium">STEUERGERAET entries</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.brvCoverage as Record<string, any>).map(([brv, cov]: [string, any]) => (
                    <tr key={brv} className="border-b last:border-0" data-testid={`row-brv-${brv}`}>
                      <td className="py-1.5 pr-4 font-mono font-semibold" data-testid={`badge-brv-${brv}`}>{brv}</td>
                      <td className="py-1.5 pr-4">{(cov.ecuPartsUpserted ?? 0).toLocaleString()}</td>
                      <td className="py-1.5 text-muted-foreground">{(cov.steuergeraet ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {["F001","F010","F020","F025","F056","G045","G070","I001","I020","J001","K001","KE01","KS01","NA05","RR21","S15A","S15C","S18A","U006","X001","XS01"].map(brv => (
                  <Badge key={brv} variant="secondary" className="font-mono text-xs" data-testid={`badge-brv-${brv}`}>{brv}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Run the import to populate chassis coverage. Each BRV maps to a psdzdata/kiswb/&lt;BRV&gt;/KIS.script within the BLP and SDP-DELTA packages.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const VALID_TABS = ["management", "data-tools", "analytics", "features", "seo", "bmv-vin", "seo-engine", "backups", "servicing", "ista", "bimmerwork", "proxy", "seo-publisher"] as const;
type AdminTab = typeof VALID_TABS[number];

function getTabFromSearch(search: string): AdminTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = params.get("tab");
  return (VALID_TABS as readonly string[]).includes(tab ?? "") ? (tab as AdminTab) : "management";
}

export default function Admin() {
  const { isAdmin } = useAuth();
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const defaultTab = getTabFromSearch(search);

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

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, API access, and platform features</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CatalogStatusChip />
          <Link
            href="/admin/realoem-backfill"
            className="text-xs px-3 py-2 rounded border hover:bg-accent transition-colors"
            data-testid="link-realoem-backfill"
          >
            RealOEM Backfill →
          </Link>
        </div>
      </div>

      <CatalogCoverageCard />

      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="overflow-x-auto">
        <TabsList className="w-full flex justify-start whitespace-nowrap h-auto" data-testid="tabs-admin">
          <TabsTrigger value="management" data-testid="tab-management" className="shrink-0">
            <Users className="w-4 h-4 mr-1.5" /> Management
          </TabsTrigger>
          <TabsTrigger value="data-tools" data-testid="tab-data-tools" className="shrink-0">
            <Database className="w-4 h-4 mr-1.5" /> Data Tools
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics" className="shrink-0">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features" className="shrink-0">
            <Star className="w-4 h-4 mr-1.5" /> Features
          </TabsTrigger>
          <TabsTrigger value="seo" data-testid="tab-seo" className="shrink-0">
            <FileText className="w-4 h-4 mr-1.5" /> SEO
          </TabsTrigger>
          <TabsTrigger value="bmv-vin" data-testid="tab-bmv-vin" className="shrink-0">
            <BookOpen className="w-4 h-4 mr-1.5" /> BMV.VIN
          </TabsTrigger>
          <TabsTrigger value="backups" data-testid="tab-backups" className="shrink-0">
            <DatabaseBackup className="w-4 h-4 mr-1.5" /> Backups
          </TabsTrigger>
          <TabsTrigger value="servicing" data-testid="tab-servicing" className="shrink-0">
            <Wrench className="w-4 h-4 mr-1.5" /> Servicing
          </TabsTrigger>
          <TabsTrigger value="seo-engine" data-testid="tab-seo-engine" className="shrink-0">
            SEO Engine
          </TabsTrigger>
          <TabsTrigger value="ista" data-testid="tab-ista" className="shrink-0">
            <Cpu className="w-4 h-4 mr-1.5" /> ISTA+
          </TabsTrigger>
          <TabsTrigger value="bimmerwork" data-testid="tab-bimmerwork" className="shrink-0">
            <Search className="w-4 h-4 mr-1.5" /> BW Discovery
          </TabsTrigger>
          <TabsTrigger value="vin-enrichment-queue" data-testid="tab-vin-enrichment-queue" className="shrink-0">
            <Database className="w-4 h-4 mr-1.5" /> VIN Enrichment
          </TabsTrigger>
          <TabsTrigger value="proxy" data-testid="tab-proxy" className="shrink-0">
            <Network className="w-4 h-4 mr-1.5" /> Proxy
          </TabsTrigger>
          <TabsTrigger value="ai-faq" data-testid="tab-ai-faq" className="shrink-0">
            <Brain className="w-4 h-4 mr-1.5" /> AI FAQs
          </TabsTrigger>
          <TabsTrigger value="seo-growth" data-testid="tab-seo-growth" className="shrink-0">
            <TrendingUp className="w-4 h-4 mr-1.5" /> SEO Growth
          </TabsTrigger>
          <TabsTrigger value="seo-pages" data-testid="tab-seo-pages" className="shrink-0">
            <FileText className="w-4 h-4 mr-1.5" /> SEO AI Pages
          </TabsTrigger>
          <TabsTrigger value="seo-publisher" data-testid="tab-seo-publisher" className="shrink-0">
            <Globe className="w-4 h-4 mr-1.5" /> Publisher
          </TabsTrigger>
        </TabsList>
        </div>
        <TabsContent value="management" className="space-y-8 mt-6">
          <UserManagement />
          <ApiKeyManagement />
        </TabsContent>
        <TabsContent value="data-tools" className="mt-6">
          <DataToolsPanel />
        </TabsContent>
        <TabsContent value="analytics" className="mt-6">
          <LinkClicksPanel />
        </TabsContent>
        <TabsContent value="features" className="mt-6">
          <FeaturesAndBenefits />
        </TabsContent>
        <TabsContent value="seo" className="mt-6 space-y-8">
          <SearchConsolePanel />
          <div className="border-t pt-6">
            <SeoEditorialPanel />
          </div>
        </TabsContent>
        <TabsContent value="bmv-vin" className="mt-6">
          <BmvVinContentPanel />
        </TabsContent>
        <TabsContent value="seo-engine" className="mt-6">
          <BmvVinSeoPanel />
        </TabsContent>
        <TabsContent value="backups" className="mt-6">
          <BackupsPanel />
        </TabsContent>
        <TabsContent value="servicing" className="mt-6">
          <ServicingAdminPanel />
        </TabsContent>
        <TabsContent value="ista" className="mt-6">
          <IstaIngestPanel />
        </TabsContent>
        <TabsContent value="bimmerwork" className="mt-6">
          <BimmerWorkDiscoveryPanel />
        </TabsContent>
        <TabsContent value="vin-enrichment-queue" className="mt-6">
          <VinEnrichmentQueuePanel />
        </TabsContent>
        <TabsContent value="proxy" className="mt-6">
          <ProxyDashboardPanel />
        </TabsContent>
        <TabsContent value="ai-faq" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">AI-Generated FAQ Cache</h2>
            <p className="text-sm text-muted-foreground mt-1">Browse, preview, and force-refresh GPT-4o-generated FAQ pairs cached in <code>ai_faq_cache</code>. FAQs are generated lazily on first SSR hit per (page, locale) and cached permanently unless regenerated.</p>
          </div>
          <AiFaqAdminPanel />
        </TabsContent>
        <TabsContent value="seo-growth" className="mt-6">
          <SeoGrowthPanel />
        </TabsContent>
        <TabsContent value="seo-pages" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" /> SEO AI Pages
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Every page generated by the AI SEO engine across bmv.parts and bmv.vin, with scheduler control.
            </p>
          </div>
          <SeoPagesCatalogPanel />
        </TabsContent>
        <TabsContent value="seo-publisher" className="mt-6">
          <SeoPublisherPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
