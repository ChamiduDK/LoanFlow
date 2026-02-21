import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import type { AdminBank } from "@/types/admin";
import StatusBadge from "@/components/shared/StatusBadge";

type Draft = {
  id?: string;
  name: string;
  code: string;
  website: string;
  contact_email: string;
  is_active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  code: "",
  website: "",
  contact_email: "",
  is_active: true,
};

export default function AdminBanks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const banksQuery = useQuery({
    queryKey: ["admin-banks"],
    queryFn: () => apiFetch<AdminBank[]>("/api/admin/banks"),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Draft) => {
      const body = {
        name: payload.name,
        code: payload.code,
        website: payload.website || null,
        contact_email: payload.contact_email || null,
        is_active: payload.is_active,
      };

      if (payload.id) {
        return apiFetch(`/api/admin/banks/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }

      return apiFetch("/api/admin/banks", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: "Bank saved" });
      setOpen(false);
      setDraft(emptyDraft);
      void queryClient.invalidateQueries({ queryKey: ["admin-banks"] });
    },
    onError: (error) => {
      toast({
        title: "Bank save failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/banks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Bank deleted" });
      void queryClient.invalidateQueries({ queryKey: ["admin-banks"] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return banksQuery.data ?? [];

    return (banksQuery.data ?? []).filter((bank) =>
      bank.name.toLowerCase().includes(term) || bank.code.toLowerCase().includes(term),
    );
  }, [banksQuery.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banks"
        subtitle="Create and manage bank records used by recommendation and application modules."
        actions={(
          <Button onClick={() => { setDraft(emptyDraft); setOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Bank
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Bank" : "Add Bank"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={draft.code} onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={draft.website} onChange={(e) => setDraft((prev) => ({ ...prev, website: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input value={draft.contact_email} onChange={(e) => setDraft((prev) => ({ ...prev, contact_email: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm text-foreground">Active</p>
              <Switch checked={draft.is_active} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Bank Directory</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search by name or code" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((bank) => (
                <TableRow key={bank.id}>
                  <TableCell className="font-medium">{bank.name}</TableCell>
                  <TableCell>{bank.code}</TableCell>
                  <TableCell>{bank.contact_email || "-"}</TableCell>
                  <TableCell>{bank.website || "-"}</TableCell>
                  <TableCell><StatusBadge status={bank.is_active ? "active" : "inactive"} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDraft({
                            id: bank.id,
                            name: bank.name,
                            code: bank.code,
                            website: bank.website || "",
                            contact_email: bank.contact_email || "",
                            is_active: bank.is_active,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(bank.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No banks found.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
