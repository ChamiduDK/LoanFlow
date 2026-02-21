import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
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

  const rows = (usersQuery.data ?? []).filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      String(user.full_name ?? "").toLowerCase().includes(term) ||
      String(user.email ?? "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage admin access and monitor user activity volume."
      />

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>User Directory</CardTitle>
          <Input className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Total Apps</TableHead>
                <TableHead>Active Apps</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name || "Unnamed"}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>{user.is_admin ? "Admin" : "User"}</TableCell>
                  <TableCell>{user.applications_total}</TableCell>
                  <TableCell>{user.applications_active}</TableCell>
                  <TableCell>{formatDate(user.created_at)}</TableCell>
                  <TableCell>
                    {user.is_admin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => roleMutation.mutate({ userId: user.id, is_admin: false })}
                        disabled={roleMutation.isPending}
                      >
                        <User className="h-4 w-4" />
                        Set User
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No users found.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
