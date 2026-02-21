import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { apiFetch } from "@/lib/api/client";
import type { Bank, LoanProduct } from "@/types/backend";
import { formatLKR } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import EmptyState from "@/components/shared/EmptyState";

export default function AdminBanks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [openSchemeModal, setOpenSchemeModal] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({
    bank_id: "",
    name: "",
    min_amount: 0,
    max_amount: 0,
    rate_min: 0,
    rate_max: 0,
    tenure_min_months: 6,
    tenure_max_months: 60,
    collateral_required: false,
  });

  const banksQuery = useQuery({
    queryKey: ["admin-banks"],
    queryFn: () => apiFetch<Bank[]>("/api/banks"),
  });

  const productsQuery = useQuery({
    queryKey: ["admin-products", banksQuery.data?.map((b) => b.id).join(",")],
    enabled: (banksQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const result = await Promise.all(
        (banksQuery.data ?? []).map(async (bank) => {
          const products = await apiFetch<LoanProduct[]>(`/api/banks/${bank.id}/products`);
          return products.map((item) => ({
            ...item,
            bank_name: bank.name,
          }));
        }),
      );
      return result.flat();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!draft.bank_id || !draft.name) {
        throw new Error("Bank and scheme name are required");
      }

      return apiFetch("/api/admin/loan-products", {
        method: "POST",
        body: JSON.stringify({
          bank_id: draft.bank_id,
          name: draft.name,
          min_amount: draft.min_amount,
          max_amount: draft.max_amount,
          rate_min: draft.rate_min,
          rate_max: draft.rate_max,
          tenure_min_months: draft.tenure_min_months,
          tenure_max_months: draft.tenure_max_months,
          collateral_required: draft.collateral_required,
          description: null,
          purpose_category: null,
          processing_days_min: null,
          processing_days_max: null,
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Scheme created",
        description: "Loan product was saved.",
      });
      setOpenSchemeModal(false);
      setDraft({
        bank_id: "",
        name: "",
        min_amount: 0,
        max_amount: 0,
        rate_min: 0,
        rate_max: 0,
        tenure_min_months: 6,
        tenure_max_months: 60,
        collateral_required: false,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create scheme",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const filteredSchemes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return productsQuery.data ?? [];

    return (productsQuery.data ?? []).filter(
      (scheme) =>
        String((scheme as LoanProduct & { bank_name?: string }).bank_name ?? "").toLowerCase().includes(term) ||
        scheme.name.toLowerCase().includes(term),
    );
  }, [productsQuery.data, search]);

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Banks and Loan Schemes"
        subtitle="Manage lender profiles, scheme terms, and underwriting visibility."
        actions={(
          <Button onClick={() => setOpenSchemeModal(true)}>
            <Plus className="h-4 w-4" />
            Add Scheme
          </Button>
        )}
      />

      <Dialog open={openSchemeModal} onOpenChange={setOpenSchemeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Loan Scheme</DialogTitle>
            <DialogDescription>
              Configure base rate bands, amount limits, tenure, and collateral requirement.
            </DialogDescription>
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
                {(banksQuery.data ?? []).map((bank) => (
                  <option key={bank.id} value={bank.id}>{bank.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Scheme Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Amount (LKR)</Label>
                <Input type="number" value={draft.min_amount} onChange={(e) => setDraft((prev) => ({ ...prev, min_amount: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Maximum Amount (LKR)</Label>
                <Input type="number" value={draft.max_amount} onChange={(e) => setDraft((prev) => ({ ...prev, max_amount: Number(e.target.value || 0) }))} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Interest (%)</Label>
                <Input type="number" value={draft.rate_min} onChange={(e) => setDraft((prev) => ({ ...prev, rate_min: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Maximum Interest (%)</Label>
                <Input type="number" value={draft.rate_max} onChange={(e) => setDraft((prev) => ({ ...prev, rate_max: Number(e.target.value || 0) }))} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Tenure (months)</Label>
                <Input type="number" value={draft.tenure_min_months} onChange={(e) => setDraft((prev) => ({ ...prev, tenure_min_months: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Maximum Tenure (months)</Label>
                <Input type="number" value={draft.tenure_max_months} onChange={(e) => setDraft((prev) => ({ ...prev, tenure_max_months: Number(e.target.value || 0) }))} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Collateral Required</p>
                <p className="text-xs text-muted-foreground">Enable if this scheme needs security documents.</p>
              </div>
              <Switch checked={draft.collateral_required} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, collateral_required: checked }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSchemeModal(false)}>Cancel</Button>
            <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Saving..." : "Save Scheme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Registered Banks</CardTitle>
        </CardHeader>
        <CardContent>
          {(banksQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No banks configured" description="Create bank records before adding schemes." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {(banksQuery.data ?? []).map((bank) => (
                <div key={bank.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-xs font-semibold text-muted-foreground">
                    {bank.code}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{bank.name}</p>
                    <p className="text-xs text-muted-foreground">{bank.code}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Loan Schemes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage live lending products.</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by bank or scheme"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Scheme</TableHead>
                <TableHead>Amount Range</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Collateral</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchemes.map((scheme) => (
                <TableRow key={scheme.id}>
                  <TableCell className="font-medium">{(scheme as LoanProduct & { bank_name?: string }).bank_name ?? scheme.bank_id}</TableCell>
                  <TableCell>{scheme.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatLKR(scheme.min_amount)} - {formatLKR(scheme.max_amount)}</TableCell>
                  <TableCell>{scheme.rate_min}% - {scheme.rate_max}%</TableCell>
                  <TableCell>{scheme.tenure_min_months} - {scheme.tenure_max_months} mo</TableCell>
                  <TableCell>
                    <StatusBadge status={scheme.collateral_required ? "needs review" : "valid"} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status="active" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
