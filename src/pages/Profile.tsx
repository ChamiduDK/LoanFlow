import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Edit2,
  Save,
  X,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Calendar,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { formatLKR } from "@/lib/currency";
import type { LoanApplication } from "@/types/backend";

type ProfileData = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  business_name?: string | null;
  business_type?: string | null;
  industry?: string | null;
  years_active?: number | null;
  annual_turnover?: number | null;
  district?: string | null;
  is_admin?: boolean;
};

type MePayload = {
  profile?: ProfileData | null;
};

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProfileData>>({});

  const meQuery = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => apiFetch<MePayload>("/api/me"),
    staleTime: 60_000,
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
  });

  const profile = meQuery.data?.profile;
  const applications = useMemo(
    () => applicationsQuery.data ?? [],
    [applicationsQuery.data],
  );

  const stats = useMemo(() => {
    const approved = applications.filter((a) => a.status === "approved").length;
    const totalRequested = applications.reduce((s, a) => s + (a.requested_amount ?? 0), 0);
    return [
      { label: "Applications", value: applications.length, icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
      { label: "Approved", value: approved, icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
      { label: "Total Requested", value: totalRequested > 0 ? formatLKR(totalRequested) : "N/A", icon: DollarSign, color: "text-violet-500 bg-violet-500/10" },
    ];
  }, [applications]);

  const initials = useMemo(() => {
    const name = profile?.full_name?.trim();
    if (name) return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
    return (profile?.email?.[0] ?? "U").toUpperCase();
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ProfileData>) =>
      apiFetch("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Profile updated successfully" });
      void queryClient.invalidateQueries({ queryKey: ["me-profile"] });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : "Could not update profile", variant: "destructive" });
    },
  });

  const startEdit = () => {
    setEditForm({
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      business_name: profile?.business_name ?? "",
      business_type: profile?.business_type ?? "",
      industry: profile?.industry ?? "",
      district: profile?.district ?? "",
      years_active: profile?.years_active ?? undefined,
      annual_turnover: profile?.annual_turnover ?? undefined,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      full_name: editForm.full_name?.trim() || null,
      phone: editForm.phone?.trim() || null,
      business_name: editForm.business_name?.trim() || null,
      business_type: editForm.business_type?.trim() || null,
      industry: editForm.industry?.trim() || null,
      district: editForm.district?.trim() || null,
      years_active: editForm.years_active ?? null,
      annual_turnover: editForm.annual_turnover ?? null,
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your business information and account settings.</p>
        </div>
        {!isEditing ? (
          <Button variant="outline" onClick={startEdit}>
            <Edit2 className="h-4 w-4" />
            Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      {/* Profile Hero Card */}
      <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-violet-500/10" />
        <CardContent className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12 mb-4 flex-wrap">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground text-2xl font-bold shadow-lg">
              {meQuery.isLoading ? <Skeleton className="h-20 w-20 rounded-xl" /> : initials}
            </div>
            <div className="pb-1">
              {meQuery.isLoading ? (
                <div className="space-y-1"><Skeleton className="h-6 w-36" /><Skeleton className="h-4 w-24" /></div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground">{profile?.full_name || "Set your name"}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm text-muted-foreground">{profile?.email}</span>
                    {profile?.is_admin && <Badge variant="secondary" className="text-[10px]"><ShieldCheck className="h-3 w-3 mr-1" />Admin</Badge>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${s.color}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-none">{String(s.value)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Personal Info */}
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</Label>
                  <Input id="full_name" value={editForm.full_name ?? ""} onChange={(e) => setEditForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</Label>
                  <Input id="phone" value={editForm.phone ?? ""} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="+94 7X XXX XXXX" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="district" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">District</Label>
                  <Input id="district" value={editForm.district ?? ""} onChange={(e) => setEditForm(p => ({ ...p, district: e.target.value }))} placeholder="Business district" />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {[
                  { icon: User, label: "Full Name", value: profile?.full_name },
                  { icon: Mail, label: "Email", value: profile?.email },
                  { icon: Phone, label: "Phone", value: profile?.phone },
                  { icon: MapPin, label: "District", value: profile?.district },
                ].map((field) => (
                  <div key={field.label} className="flex items-start gap-3 py-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <field.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{field.label}</p>
                      <p className="text-sm text-foreground font-medium mt-0.5">{field.value || <span className="text-muted-foreground italic">Not set</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Business Info */}
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Business Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Name</Label>
                  <Input value={editForm.business_name ?? ""} onChange={(e) => setEditForm(p => ({ ...p, business_name: e.target.value }))} placeholder="Your business name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Type</Label>
                    <Input value={editForm.business_type ?? ""} onChange={(e) => setEditForm(p => ({ ...p, business_type: e.target.value }))} placeholder="e.g. Sole Trader" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Industry</Label>
                    <Input value={editForm.industry ?? ""} onChange={(e) => setEditForm(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Retail" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Years Active</Label>
                    <Input type="number" value={editForm.years_active ?? ""} onChange={(e) => setEditForm(p => ({ ...p, years_active: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="e.g. 5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Annual Turnover (LKR)</Label>
                    <Input type="number" value={editForm.annual_turnover ?? ""} onChange={(e) => setEditForm(p => ({ ...p, annual_turnover: e.target.value === "" ? undefined : Number(e.target.value) }))} placeholder="e.g. 5000000" />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {[
                  { icon: Building2, label: "Business Name", value: profile?.business_name },
                  { icon: User, label: "Business Type", value: profile?.business_type },
                  { icon: TrendingUp, label: "Industry", value: profile?.industry },
                  { icon: Calendar, label: "Years Active", value: profile?.years_active ? `${profile.years_active} year(s)` : null },
                  { icon: DollarSign, label: "Annual Turnover", value: profile?.annual_turnover ? formatLKR(profile.annual_turnover) : null },
                ].map((field) => (
                  <div key={field.label} className="flex items-start gap-3 py-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <field.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{field.label}</p>
                      <p className="text-sm text-foreground font-medium mt-0.5">{field.value || <span className="text-muted-foreground italic">Not set</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
