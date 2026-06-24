import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { useLocalizedHref } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { UserCar, Car } from "@shared/schema";
import { SEO } from "@/components/SEO";
import {
  Plus, Trash2, Car as CarIcon, Calendar, Cpu, KeyRound,
  Pencil, Check, X, ExternalLink, LogIn, Loader2, Hash, Globe
} from "lucide-react";

type UserCarWithMatch = UserCar & { matchedCar?: Car | null };

interface VinData {
  vin?: string;
  chassis?: string;
  series?: string;
  modelName?: string;
  modelYear?: number;
  engine?: string;
  engineFamily?: string;
  bodyType?: string;
  driveType?: string;
  plant?: { city: string; country: string } | null;
  generation?: string;
}

function CarCard({ car, onDelete, onUpdateNickname }: {
  car: UserCarWithMatch;
  onDelete: (id: number) => void;
  onUpdateNickname: (id: number, nickname: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(car.nickname || "");
  const [, navigate] = useLocation();
  const localize = useLocalizedHref();
  const vinData = car.vinData as VinData | null;

  const handleSaveNickname = () => {
    onUpdateNickname(car.id, nickname);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setNickname(car.nickname || "");
    setEditing(false);
  };

  const carLink = localize(car.matchedCar
    ? `/car/${car.matchedCar.slug || car.matchedCar.id}`
    : `/vin/${car.vin}`);

  const handleCardClick = () => {
    navigate(carLink);
  };

  const stopProp = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const displayTitle = car.nickname || car.modelName || car.chassis || "Unknown Vehicle";
  const subtitle = car.modelYear
    ? `${car.modelYear} ${car.modelName || car.chassis || ""}`
    : car.chassis || "";

  return (
    <Card
      className="p-4 cursor-pointer hover-elevate"
      data-testid={`card-car-${car.id}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <CarIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2 mb-1" onClick={stopProp}>
                <Input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="Nickname (e.g. My Daily)"
                  className="h-8 text-sm"
                  data-testid={`input-nickname-${car.id}`}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSaveNickname();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                />
                <Button size="icon" variant="ghost" onClick={(e) => { stopProp(e); handleSaveNickname(); }} data-testid={`button-save-nickname-${car.id}`}>
                  <Check className="w-4 h-4 text-green-500" />
                </Button>
                <Button size="icon" variant="ghost" onClick={(e) => { stopProp(e); handleCancelEdit(); }} data-testid={`button-cancel-nickname-${car.id}`}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-sm" data-testid={`text-car-name-${car.id}`}>{displayTitle}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => { stopProp(e); setEditing(true); }}
                  data-testid={`button-edit-nickname-${car.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            {!editing && car.nickname && subtitle && (
              <div className="text-xs text-muted-foreground mb-1" data-testid={`text-car-subtitle-${car.id}`}>{subtitle}</div>
            )}
            <div className="font-mono text-xs text-muted-foreground" data-testid={`text-vin-${car.id}`}>
              <Hash className="w-3 h-3 inline mr-1" />
              {car.vin}
            </div>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive shrink-0"
          onClick={(e) => { stopProp(e); onDelete(car.id); }}
          data-testid={`button-delete-car-${car.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {car.chassis && (
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-chassis-${car.id}`}>
            <CarIcon className="w-3 h-3 shrink-0" />
            <span>{car.chassis}</span>
          </div>
        )}
        {car.modelYear && (
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-year-${car.id}`}>
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{car.modelYear}</span>
          </div>
        )}
        {(vinData?.engine || vinData?.engineFamily) && (
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-engine-${car.id}`}>
            <Cpu className="w-3 h-3 shrink-0" />
            <span>{vinData.engine || vinData.engineFamily}</span>
          </div>
        )}
        {vinData?.driveType && (
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-drive-${car.id}`}>
            <Globe className="w-3 h-3 shrink-0" />
            <span>{vinData.driveType}</span>
          </div>
        )}
      </div>

      {car.matchedCar && (
        <div className="mt-3 pt-3 border-t">
          <Link
            href={carLink!}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            data-testid={`link-parts-${car.id}`}
            onClick={stopProp}
          >
            <span>Browse {car.matchedCar.totalParts?.toLocaleString() || 0} parts</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Badge variant="secondary" className="ml-2 text-xs" data-testid={`badge-matched-${car.id}`}>
            {car.matchedCar.displayName}
          </Badge>
        </div>
      )}

      {!car.matchedCar && (
        <div className="mt-3 pt-3 border-t">
          <Link
            href={localize(`/vin/${car.vin}`)}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            data-testid={`link-vin-${car.id}`}
            onClick={stopProp}
          >
            <span>View vehicle details</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          {car.chassis && (
            <span className="text-xs text-muted-foreground ml-2">No catalog match for {car.chassis}</span>
          )}
        </div>
      )}
    </Card>
  );
}

export default function MyCars() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [newVin, setNewVin] = useState("");
  const [newNickname, setNewNickname] = useState("");

  const { data: cars = [], isLoading } = useQuery<UserCarWithMatch[]>({
    queryKey: ["/api/my-cars"],
    enabled: isAuthenticated,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/my-cars", {
        vin: newVin.trim(),
        nickname: newNickname.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      setNewVin("");
      setNewNickname("");
      toast({ title: "Car added", description: "Your vehicle has been saved to your garage." });
    },
    onError: (err: any) => {
      const msg = err.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : err.message;
      let errorText = msg;
      try { errorText = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Failed to add car", description: errorText, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/my-cars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({ title: "Car removed" });
    },
  });

  const updateNicknameMutation = useMutation({
    mutationFn: async ({ id, nickname }: { id: number; nickname: string }) => {
      await apiRequest("PATCH", `/api/my-cars/${id}`, { nickname });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({ title: "Nickname updated" });
    },
  });

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center space-y-3">
          <CarIcon className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold" data-testid="text-sign-in-prompt">Sign in to access My Cars</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Save your vehicles by VIN to quickly access parts catalogs for your specific BMWs.
          </p>
          <Link href="/login">
            <Button data-testid="button-go-login">
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <SEO title="My BMW Garage — BMV.parts" path="/my-cars" noIndex />
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-my-cars-title">My Cars</h1>
        <p className="text-sm text-muted-foreground">Save your vehicles by VIN for quick parts access</p>
      </div>

      <Card className="p-4 space-y-3" data-testid="form-add-car">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add a Vehicle
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-3">
          <div>
            <Input
              value={newVin}
              onChange={e => setNewVin(e.target.value.toUpperCase())}
              placeholder="Enter VIN (e.g. WBS73AK00PCJ00695)"
              className="font-mono"
              maxLength={17}
              data-testid="input-add-vin"
            />
          </div>
          <div>
            <Input
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              placeholder="Nickname (optional)"
              data-testid="input-add-nickname"
            />
          </div>
          <div>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newVin.trim() || newVin.trim().length < 7 || addMutation.isPending}
              data-testid="button-add-car"
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Car
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          VIN will be decoded automatically to identify your vehicle and match it to our parts catalog.
        </p>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : cars.length === 0 ? (
        <div className="text-center py-12">
          <KeyRound className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-cars">No cars saved yet. Add one above using your VIN.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="list-cars">
          {cars.map(car => (
            <CarCard
              key={car.id}
              car={car}
              onDelete={id => deleteMutation.mutate(id)}
              onUpdateNickname={(id, nick) => updateNicknameMutation.mutate({ id, nickname: nick })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
