import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/hooks/useAuthSession";
import { apiFetch } from "@/lib/api/client";
import type { AdminUser } from "@/types/admin";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage admin access and monitor user activity volume."
      />

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>User Directory</CardTitle>
          <Input className="w-full sm:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Approval</TableHead>
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
                    <TableCell className="font-medium">{user.full_name || "Unnamed"}</TableCell>
                    <TableCell>{user.email || "-"}</TableCell>
                    <TableCell>{user.is_admin ? "Admin" : "User"}</TableCell>
                    <TableCell>
                      {user.is_approved ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-4 w-4" />
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <Clock3 className="h-4 w-4" />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{user.applications_total}</TableCell>
                    <TableCell>{user.applications_active}</TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {user.is_admin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            title={disableReason}
                            onClick={() => roleMutation.mutate({ userId: user.id, is_admin: false })}
                            disabled={disableDemote}
                          >
                            <User className="h-4 w-4" />
                            {isCurrentUser ? "Current Admin" : "Set User"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => roleMutation.mutate({ userId: user.id, is_admin: true })}
                            disabled={roleMutation.isPending}
                          >
                            <Shield className="h-4 w-4" />
                            Set Admin
                          </Button>
                        )}
                        {user.is_approved ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approvalMutation.mutate({ userId: user.id, is_approved: false })}
                            disabled={approvalMutation.isPending}
                          >
                            Set Pending
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => approvalMutation.mutate({ userId: user.id, is_approved: true })}
                            disabled={approvalMutation.isPending}
                          >
                            Approve User
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {usersQuery.isLoading ? <div className="p-4 text-sm text-muted-foreground">Loading users...</div> : null}
          {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No users found.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
