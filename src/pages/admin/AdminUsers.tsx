import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CheckCircle2, Clock3, RotateCcw, Save, Search, Shield, ShieldCheck, User, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/useAuthSession";
import { apiFetch } from "@/lib/api/client";
import { Switch } from "@/components/ui/switch";
import { USER_FEATURE_META, USER_FEATURE_ORDER, type UserFeatureAccess, type UserFeatureKey } from "@/lib/feature-access";
import type { AdminUser } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEnabledFeatureCount(user: AdminUser): number {
  return getEnabledFeatureCountFromAccess(user.feature_access);
}

function getEnabledFeatureCountFromAccess(featureAccess: UserFeatureAccess): number {
  return USER_FEATURE_ORDER.filter((featureKey) => featureAccess[featureKey]).length;
}

function hasFeatureAccessChanges(user: AdminUser, featureAccess: UserFeatureAccess): boolean {
  return USER_FEATURE_ORDER.some((featureKey) => featureAccess[featureKey] !== user.feature_access[featureKey]);
}

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <Badge variant="default" className="gap-1.5">
      <ShieldCheck className="h-3.5 w-3.5" />
      Admin
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1.5">
      <User className="h-3.5 w-3.5" />
      User
    </Badge>
  );
}

function ApprovalBadge({ isApproved }: { isApproved: boolean }) {
  return isApproved ? (
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Approved
    </Badge>
  ) : (
    <Badge variant="warning" className="gap-1.5">
      <Clock3 className="h-3.5 w-3.5" />
      Pending
    </Badge>
  );
}

function FeatureAccessPanel({
  user,
  featureAccess,
  disabled,
  onToggle,
  onSelectAll,
  onClearAll,
  onReset,
  onSave,
  dirty,
  saving,
  compact = false,
}: {
  user: AdminUser;
  featureAccess: UserFeatureAccess;
  disabled: boolean;
  onToggle: (featureKey: UserFeatureKey, enabled: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onReset: () => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  compact?: boolean;
}) {
  if (user.is_admin) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        All features are available through the admin role.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`flex ${compact ? "flex-col items-stretch" : "flex-wrap items-center justify-between"} gap-2`}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onSelectAll} disabled={disabled}>
            <CheckCheck className="h-4 w-4" />
            Select All
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClearAll} disabled={disabled}>
            <X className="h-4 w-4" />
            Clear All
          </Button>
        </div>
        <Badge variant="outline" className="w-fit">
          {getEnabledFeatureCountFromAccess(featureAccess)} / {USER_FEATURE_ORDER.length} selected
        </Badge>
      </div>

      <div className={compact ? "grid gap-2" : "grid gap-2 md:grid-cols-2"}>
        {USER_FEATURE_ORDER.map((featureKey) => (
          <div
            key={featureKey}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{USER_FEATURE_META[featureKey].shortTitle}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {featureAccess[featureKey] ? "Selected for this user" : "Not selected"}
              </p>
            </div>
            <Switch
              checked={featureAccess[featureKey]}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(featureKey, checked)}
              aria-label={`Toggle ${USER_FEATURE_META[featureKey].shortTitle} access`}
            />
          </div>
        ))}
      </div>

      <div className={`flex ${compact ? "flex-col" : "justify-end"} gap-2`}>
        <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={disabled || !dirty}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={disabled || !dirty}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Access"}
        </Button>
      </div>
    </div>
  );
}

function UserActions({
  user,
  isCurrentUser,
  disableDemote,
  disableReason,
  rolePending,
  approvalPending,
  onRoleChange,
  onApprovalChange,
}: {
  user: AdminUser;
  isCurrentUser: boolean;
  disableDemote: boolean;
  disableReason?: string;
  rolePending: boolean;
  approvalPending: boolean;
  onRoleChange: (isAdmin: boolean) => void;
  onApprovalChange: (isApproved: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {user.is_admin ? (
        <Button
          size="sm"
          variant="outline"
          title={disableReason}
          onClick={() => onRoleChange(false)}
          disabled={disableDemote}
        >
          <User className="h-4 w-4" />
          {isCurrentUser ? "Current Admin" : "Set User"}
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => onRoleChange(true)}
          disabled={rolePending}
        >
          <Shield className="h-4 w-4" />
          Set Admin
        </Button>
      )}

      {user.is_approved ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onApprovalChange(false)}
          disabled={approvalPending}
        >
          Set Pending
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={() => onApprovalChange(true)}
          disabled={approvalPending}
        >
          Approve User
        </Button>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sessionQuery = useAuthSession();
  const [search, setSearch] = useState("");
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, UserFeatureAccess>>({});

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<AdminUser[]>("/api/admin/users"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, is_admin }: { userId: string; is_admin: boolean }) =>
      apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ is_admin }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["me-profile"] });
      toast({ title: "User role updated" });
    },
    onError: (error) => {
      toast({
        title: "Role update failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });
  const approvalMutation = useMutation({
    mutationFn: ({ userId, is_approved }: { userId: string; is_approved: boolean }) =>
      apiFetch(`/api/admin/users/${userId}/approval`, {
        method: "PUT",
        body: JSON.stringify({ is_approved }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["me-profile"] });
      toast({ title: "User approval updated" });
    },
    onError: (error) => {
      toast({
        title: "Approval update failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });
  const featureAccessMutation = useMutation({
    mutationFn: ({ userId, featureAccess }: { userId: string; featureAccess: UserFeatureAccess }) =>
      apiFetch(`/api/admin/users/${userId}/feature-access`, {
        method: "PUT",
        body: JSON.stringify({ feature_access: featureAccess }),
      }),
    onSuccess: (_data, variables) => {
      setFeatureDrafts((current) => {
        const next = { ...current };
        delete next[variables.userId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["me-profile"] });
      toast({ title: "User feature access updated" });
    },
    onError: (error) => {
      toast({
        title: "Feature access update failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const rows = (usersQuery.data ?? []).filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      String(user.full_name ?? "").toLowerCase().includes(term) ||
      String(user.email ?? "").toLowerCase().includes(term)
    );
  });
  const currentUserId = sessionQuery.data?.user.id ?? null;
  const adminCount = (usersQuery.data ?? []).filter((user) => user.is_admin).length;
  const updateFeatureDraft = (user: AdminUser, updater: (current: UserFeatureAccess) => UserFeatureAccess) => {
    setFeatureDrafts((current) => {
      const base = current[user.id] ? { ...current[user.id] } : { ...user.feature_access };
      const nextDraft = updater(base);

      if (!hasFeatureAccessChanges(user, nextDraft)) {
        const next = { ...current };
        delete next[user.id];
        return next;
      }

      return {
        ...current,
        [user.id]: nextDraft,
      };
    });
  };

  const resetFeatureDraft = (userId: string) => {
    setFeatureDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  };

  const selectAllFeatures = (user: AdminUser) => {
    updateFeatureDraft(user, (current) => ({
      ...current,
      ...Object.fromEntries(USER_FEATURE_ORDER.map((featureKey) => [featureKey, true])),
    }));
  };

  const clearAllFeatures = (user: AdminUser) => {
    updateFeatureDraft(user, (current) => ({
      ...current,
      ...Object.fromEntries(USER_FEATURE_ORDER.map((featureKey) => [featureKey, false])),
    }));
  };

  const saveFeatureDraft = (userId: string, featureAccess: UserFeatureAccess) => {
    featureAccessMutation.mutate({ userId, featureAccess });
  };

  const getFeatureDraft = (user: AdminUser): UserFeatureAccess => featureDrafts[user.id] ?? user.feature_access;

  const summary = useMemo(() => {
    const users = usersQuery.data ?? [];
    const approvedUsers = users.filter((user) => user.is_approved).length;
    const pendingUsers = users.filter((user) => !user.is_approved).length;
    const usersWithAccess = users.filter((user) => user.is_admin || getEnabledFeatureCount(user) > 0).length;

    return {
      totalUsers: users.length,
      approvedUsers,
      pendingUsers,
      admins: adminCount,
      usersWithAccess,
    };
  }, [adminCount, usersQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user approval, admin roles, and feature access in one responsive workspace."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card">
          <CardContent className="p-4">
            <p className="label-xs">Total Users</p>
            <p className="mt-1 text-2xl font-semibold">{summary.totalUsers}</p>
            <p className="mt-1 text-xs text-muted-foreground">All registered accounts</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="p-4">
            <p className="label-xs">Approved</p>
            <p className="mt-1 text-2xl font-semibold text-success">{summary.approvedUsers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Users cleared for access control</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="p-4">
            <p className="label-xs">Pending Approval</p>
            <p className="mt-1 text-2xl font-semibold text-warning">{summary.pendingUsers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting admin review</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card">
          <CardContent className="p-4">
            <p className="label-xs">Access Enabled</p>
            <p className="mt-1 text-2xl font-semibold">{summary.usersWithAccess}</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary.admins} admin accounts included</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                User Directory
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Search a user, choose any combination of features, then save the whole access set in one action.
              </p>
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {usersQuery.isLoading ? <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">Loading users...</div> : null}
          {!usersQuery.isLoading && rows.length === 0 ? <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">No users found.</div> : null}

          {rows.length > 0 ? (
            <>
              <div className="grid gap-4 xl:hidden">
                {rows.map((user) => {
                  const isCurrentUser = currentUserId === user.id;
                  const isLastAdmin = user.is_admin && adminCount <= 1;
                  const disableDemote = roleMutation.isPending || isCurrentUser || isLastAdmin;
                  const disableReason = isCurrentUser
                    ? "You cannot remove your own admin role"
                    : isLastAdmin
                      ? "At least one admin must remain"
                      : undefined;

                  return (
                    <Card key={user.id} className="border-border/70 bg-background/40 shadow-none">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-base font-semibold text-foreground">{user.full_name || "Unnamed"}</p>
                                <RoleBadge isAdmin={user.is_admin} />
                                <ApprovalBadge isApproved={user.is_approved} />
                              </div>
                              <p className="mt-1 break-all text-sm text-muted-foreground">{user.email || "-"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">Joined {formatDate(user.created_at)}</p>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">Feature Access</p>
                              <Badge variant="outline">
                                {user.is_admin ? "All Features" : `${getEnabledFeatureCountFromAccess(getFeatureDraft(user))} / ${USER_FEATURE_ORDER.length} enabled`}
                              </Badge>
                            </div>
                            <div className="mt-3">
                              {(() => {
                                const draft = getFeatureDraft(user);
                                const dirty = hasFeatureAccessChanges(user, draft);
                                const saving = featureAccessMutation.isPending && featureAccessMutation.variables?.userId === user.id;

                                return (
                                  <FeatureAccessPanel
                                    user={user}
                                    featureAccess={draft}
                                    dirty={dirty}
                                    saving={saving}
                                    disabled={featureAccessMutation.isPending}
                                    compact
                                    onToggle={(featureKey, enabled) =>
                                      updateFeatureDraft(user, (current) => ({
                                        ...current,
                                        [featureKey]: enabled,
                                      }))
                                    }
                                    onSelectAll={() => selectAllFeatures(user)}
                                    onClearAll={() => clearAllFeatures(user)}
                                    onReset={() => resetFeatureDraft(user.id)}
                                    onSave={() => saveFeatureDraft(user.id, draft)}
                                  />
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <UserActions
                              user={user}
                              isCurrentUser={isCurrentUser}
                              disableDemote={disableDemote}
                              disableReason={disableReason}
                              rolePending={roleMutation.isPending}
                              approvalPending={approvalMutation.isPending}
                              onRoleChange={(isAdmin) => roleMutation.mutate({ userId: user.id, is_admin: isAdmin })}
                              onApprovalChange={(isApproved) => approvalMutation.mutate({ userId: user.id, is_approved: isApproved })}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Feature Access</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((user) => {
                      const isCurrentUser = currentUserId === user.id;
                      const isLastAdmin = user.is_admin && adminCount <= 1;
                      const disableDemote = roleMutation.isPending || isCurrentUser || isLastAdmin;
                      const disableReason = isCurrentUser
                        ? "You cannot remove your own admin role"
                        : isLastAdmin
                          ? "At least one admin must remain"
                          : undefined;

                      return (
                        <TableRow key={user.id}>
                          <TableCell className="min-w-[220px]">
                            <div>
                              <p className="font-medium text-foreground">{user.full_name || "Unnamed"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{user.email || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="flex flex-col gap-2">
                              <RoleBadge isAdmin={user.is_admin} />
                              <ApprovalBadge isApproved={user.is_approved} />
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[360px]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Access Control</p>
                              <Badge variant="outline">{user.is_admin ? "All Features" : `${getEnabledFeatureCountFromAccess(getFeatureDraft(user))} enabled`}</Badge>
                            </div>
                            {(() => {
                              const draft = getFeatureDraft(user);
                              const dirty = hasFeatureAccessChanges(user, draft);
                              const saving = featureAccessMutation.isPending && featureAccessMutation.variables?.userId === user.id;

                              return (
                                <FeatureAccessPanel
                                  user={user}
                                  featureAccess={draft}
                                  dirty={dirty}
                                  saving={saving}
                                  disabled={featureAccessMutation.isPending}
                                  onToggle={(featureKey, enabled) =>
                                    updateFeatureDraft(user, (current) => ({
                                      ...current,
                                      [featureKey]: enabled,
                                    }))
                                  }
                                  onSelectAll={() => selectAllFeatures(user)}
                                  onClearAll={() => clearAllFeatures(user)}
                                  onReset={() => resetFeatureDraft(user.id)}
                                  onSave={() => saveFeatureDraft(user.id, draft)}
                                />
                              );
                            })()}
                          </TableCell>
                          <TableCell>{formatDate(user.created_at)}</TableCell>
                          <TableCell className="min-w-[220px]">
                            <UserActions
                              user={user}
                              isCurrentUser={isCurrentUser}
                              disableDemote={disableDemote}
                              disableReason={disableReason}
                              rolePending={roleMutation.isPending}
                              approvalPending={approvalMutation.isPending}
                              onRoleChange={(isAdmin) => roleMutation.mutate({ userId: user.id, is_admin: isAdmin })}
                              onApprovalChange={(isApproved) => approvalMutation.mutate({ userId: user.id, is_approved: isApproved })}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
