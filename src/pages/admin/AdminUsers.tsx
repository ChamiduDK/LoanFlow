import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Search, Shield, ShieldCheck, User, Users } from "lucide-react";
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
import { USER_FEATURE_META, USER_FEATURE_ORDER, type UserFeatureKey } from "@/lib/feature-access";
import type { AdminUser } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getEnabledFeatureCount(user: AdminUser): number {
  return USER_FEATURE_ORDER.filter((featureKey) => user.feature_access?.[featureKey]).length;
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
  disabled,
  onToggle,
  compact = false,
}: {
  user: AdminUser;
  disabled: boolean;
  onToggle: (featureKey: UserFeatureKey, enabled: boolean) => void;
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
    <div className={compact ? "grid gap-2" : "grid gap-2 md:grid-cols-2"}>
      {USER_FEATURE_ORDER.map((featureKey) => (
        <div
          key={featureKey}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{USER_FEATURE_META[featureKey].shortTitle}</p>
            {!compact ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {user.feature_access?.[featureKey] ? "Enabled" : "Locked until admin grants access"}
              </p>
            ) : null}
          </div>
          <Switch
            checked={Boolean(user.feature_access?.[featureKey])}
            disabled={disabled}
            onCheckedChange={(checked) => onToggle(featureKey, checked)}
            aria-label={`Toggle ${USER_FEATURE_META[featureKey].shortTitle} access`}
          />
        </div>
      ))}
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
    mutationFn: ({ userId, featureKey, enabled }: { userId: string; featureKey: UserFeatureKey; enabled: boolean }) =>
      apiFetch(`/api/admin/users/${userId}/feature-access`, {
        method: "PUT",
        body: JSON.stringify({ feature_access: { [featureKey]: enabled } }),
      }),
    onSuccess: () => {
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
                Search a user, review account status, and update feature permissions without leaving the page.
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
                            <div className="grid grid-cols-2 gap-2 sm:min-w-[180px]">
                              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                                <p className="label-xs">Applications</p>
                                <p className="mt-1 text-lg font-semibold">{user.applications_total}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                                <p className="label-xs">Active</p>
                                <p className="mt-1 text-lg font-semibold">{user.applications_active}</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">Feature Access</p>
                              <Badge variant="outline">{user.is_admin ? "All Features" : `${getEnabledFeatureCount(user)} / ${USER_FEATURE_ORDER.length} enabled`}</Badge>
                            </div>
                            <div className="mt-3">
                              <FeatureAccessPanel
                                user={user}
                                disabled={featureAccessMutation.isPending}
                                compact
                                onToggle={(featureKey, enabled) => featureAccessMutation.mutate({ userId: user.id, featureKey, enabled })}
                              />
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
                      <TableHead>Total Apps</TableHead>
                      <TableHead>Active Apps</TableHead>
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
                              <Badge variant="outline">{user.is_admin ? "All Features" : `${getEnabledFeatureCount(user)} enabled`}</Badge>
                            </div>
                            <FeatureAccessPanel
                              user={user}
                              disabled={featureAccessMutation.isPending}
                              onToggle={(featureKey, enabled) => featureAccessMutation.mutate({ userId: user.id, featureKey, enabled })}
                            />
                          </TableCell>
                          <TableCell>{user.applications_total}</TableCell>
                          <TableCell>{user.applications_active}</TableCell>
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
