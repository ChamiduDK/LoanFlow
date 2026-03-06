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
import type { AdminBank, AdminLoanProduct } from "@/types/admin";
import { formatLKR } from "@/lib/currency";

type Draft = {
  id?: string;
  bank_id: string;
  name: string;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
  is_active: boolean;
};

const emptyDraft: Draft = {
  bank_id: "",
  name: "",
  min_amount: 0,
  max_amount: 0,
  rate_min: 0,
  rate_max: 0,
  tenure_min_months: 6,
  tenure_max_months: 60,
  collateral_required: false,
  is_active: true,
};

function toSafeText(value: unknown): string {
  return String(value ?? "").trim();
}

export default function AdminSchemes() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const banksQuery = useQuery({
    queryKey: ["admin-banks"],
    queryFn: () => apiFetch<AdminBank[]>("/api/admin/banks"),
  });

  const schemesQuery = useQuery({
    queryKey: ["admin-loan-products"],
    queryFn: () => apiFetch<AdminLoanProduct[]>("/api/admin/loan-products"),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Draft) => {
      const body = {
        bank_id: payload.bank_id,
        name: payload.name,
        min_amount: payload.min_amount,
        max_amount: payload.max_amount,
        rate_min: payload.rate_min,
        rate_max: payload.rate_max,
        tenure_min_months: payload.tenure_min_months,
        tenure_max_months: payload.tenure_max_months,
        collateral_required: payload.collateral_required,
        is_active: payload.is_active,
      };

      if (payload.id) {
        return apiFetch(`/api/admin/loan-products/${payload.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }

      return apiFetch("/api/admin/loan-products", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: "Loan product saved" });
      setOpen(false);
      setDraft(emptyDraft);
      void queryClient.invalidateQueries({ queryKey: ["admin-loan-products"] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/loan-products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Loan product deleted" });
      void queryClient.invalidateQueries({ queryKey: ["admin-loan-products"] });
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
    const source = (schemesQuery.data ?? []).map((row) => ({
      ...row,
      name: toSafeText(row.name),
      banks: row.banks ? { ...row.banks, name: toSafeText(row.banks.name) } : row.banks,
    }));
    if (!term) return source;

    return source.filter((row) =>
      row.name.toLowerCase().includes(term) ||
      String(row.banks?.name ?? "").toLowerCase().includes(term),
    );
  }, [schemesQuery.data, search]);

  const saveDisabled = saveMutation.isPending || draft.bank_id.trim().length === 0 || draft.name.trim().length < 2;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan Schemes"
        subtitle="Manage live loan products and pricing ranges used by recommendation engine."
        actions={(
          <Button onClick={() => { setDraft(emptyDraft); setOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Scheme
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Loan Scheme" : "Add Loan Scheme"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bank</Label>
              <select
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm"
                value={draft.bank_id}
                onChange={(e) => setDraft((prev) => ({ ...prev, bank_id: e.target.value }))}
              >
                <option value="">Select bank</option>
                {(banksQuery.data ?? []).map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Scheme Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Min Amount</Label>
                <Input type="number" value={draft.min_amount} onChange={(e) => setDraft((prev) => ({ ...prev, min_amount: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Max Amount</Label>
                <Input type="number" value={draft.max_amount} onChange={(e) => setDraft((prev) => ({ ...prev, max_amount: Number(e.target.value || 0) }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Rate Min (%)</Label>
                <Input type="number" value={draft.rate_min} onChange={(e) => setDraft((prev) => ({ ...prev, rate_min: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Rate Max (%)</Label>
                <Input type="number" value={draft.rate_max} onChange={(e) => setDraft((prev) => ({ ...prev, rate_max: Number(e.target.value || 0) }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tenure Min (months)</Label>
                <Input type="number" value={draft.tenure_min_months} onChange={(e) => setDraft((prev) => ({ ...prev, tenure_min_months: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Tenure Max (months)</Label>
                <Input type="number" value={draft.tenure_max_months} onChange={(e) => setDraft((prev) => ({ ...prev, tenure_max_months: Number(e.target.value || 0) }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm text-foreground">Collateral Required</p>
              <Switch checked={draft.collateral_required} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, collateral_required: checked }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm text-foreground">Active</p>
              <Switch checked={draft.is_active} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, is_active: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saveDisabled} onClick={() => saveMutation.mutate(draft)}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Loan Product Catalog</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search products" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {schemesQuery.isError || banksQuery.isError ? (
            <div className="p-4 text-sm text-destructive">
              Failed to load bank or scheme data. Refresh and try again.
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Amount Range</TableHead>
                <TableHead>Rate Range</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.banks?.name ?? "-"}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{formatLKR(row.min_amount)} - {formatLKR(row.max_amount)}</TableCell>
                  <TableCell>{row.rate_min}% - {row.rate_max}%</TableCell>
                  <TableCell>{row.tenure_min_months} - {row.tenure_max_months} mo</TableCell>
                  <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setDraft({
                          id: row.id,
                          bank_id: row.bank_id,
                          name: row.name,
                          min_amount: row.min_amount,
                          max_amount: row.max_amount,
                          rate_min: row.rate_min,
                          rate_max: row.rate_max,
                          tenure_min_months: row.tenure_min_months,
                          tenure_max_months: row.tenure_max_months,
                          collateral_required: row.collateral_required,
                          is_active: row.is_active,
                        });
                        setOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(row.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No loan schemes found.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
