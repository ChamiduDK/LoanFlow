import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import type { AdminApplicationRow } from "@/types/admin";

type DecisionStatus = "under_review" | "approved" | "rejected";

type DecisionForm = {
  status: DecisionStatus;
  approved_amount: string;
  approved_rate: string;
  approved_tenure_months: string;
  notes: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDecisionPayload(form: DecisionForm) {
  return {
    status: form.status,
    approved_amount: form.status === "approved" ? Number(form.approved_amount || 0) : null,
    approved_rate: form.status === "approved" ? Number(form.approved_rate || 0) : null,
    approved_tenure_months: form.status === "approved" ? Number(form.approved_tenure_months || 0) : null,
    notes: form.notes.trim() || null,
  };
}

export default function AdminApplications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [formsByAppId, setFormsByAppId] = useState<Record<string, DecisionForm>>({});

  const applicationsQuery = useQuery({
    queryKey: ["admin-applications"],
    queryFn: () => apiFetch<AdminApplicationRow[]>("/api/admin/applications"),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ applicationId, form }: { applicationId: string; form: DecisionForm }) =>
      apiFetch(`/api/admin/applications/${applicationId}/decision`, {
        method: "PUT",
        body: JSON.stringify(toDecisionPayload(form)),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      toast({ title: "Application decision updated" });
    },
    onError: (error) => {
      toast({
        title: "Decision update failed",
        description: error instanceof Error ? error.message : "Could not update application decision",
        variant: "destructive",
      });
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = applicationsQuery.data ?? [];
    if (!term) {
      return source;
    }

    return source.filter((item) => {
      const applicantName = item.user_profile?.full_name ?? "";
      const applicantEmail = item.user_profile?.email ?? "";
      return (
        item.id.toLowerCase().includes(term) ||
        item.purpose.toLowerCase().includes(term) ||
        applicantName.toLowerCase().includes(term) ||
        applicantEmail.toLowerCase().includes(term)
      );
    });
  }, [applicationsQuery.data, search]);

  const getFormForApp = (application: AdminApplicationRow): DecisionForm => {
    const cached = formsByAppId[application.id];
    if (cached) {
      return cached;
    }

    return {
      status: (application.outcome?.status as DecisionStatus | undefined) ?? "under_review",
      approved_amount: application.outcome?.approved_amount?.toString() ?? "",
      approved_rate: application.outcome?.approved_rate?.toString() ?? "",
      approved_tenure_months: application.outcome?.approved_tenure_months?.toString() ?? "",
      notes: "",
    };
  };

  const updateForm = (applicationId: string, current: DecisionForm, next: Partial<DecisionForm>) => {
    setFormsByAppId((prev) => ({
      ...prev,
      [applicationId]: {
        ...(prev[applicationId] ?? current),
        ...next,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Review submitted applications and set final admin decisions."
      />

      <Card className="data-table-wrap">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Decision Queue</CardTitle>
          <Input
            className="max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by applicant, email, purpose, or app ID"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Decision Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((application) => {
                const form = getFormForApp(application);
                const requiresApprovalTerms = form.status === "approved";
                const submitting = decisionMutation.isPending;

                return (
                  <TableRow key={application.id}>
                    <TableCell>
                      <p className="font-mono text-xs">{application.id.slice(0, 8)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{application.purpose}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{application.user_profile?.full_name ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{application.user_profile?.email ?? "-"}</p>
                    </TableCell>
                    <TableCell>{formatLKR(application.requested_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={application.outcome?.status ?? application.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(application.updated_at)}</TableCell>
                    <TableCell className="min-w-[340px]">
                      <div className="space-y-2 rounded-lg border border-border/60 p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Decision</Label>
                            <Select
                              value={form.status}
                              onValueChange={(value) => updateForm(application.id, form, { status: value as DecisionStatus })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="under_review">Under Review</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Notes</Label>
                            <Input
                              className="h-9"
                              value={form.notes}
                              onChange={(event) => updateForm(application.id, form, { notes: event.target.value })}
                              placeholder="Optional note"
                            />
                          </div>
                        </div>

                        {requiresApprovalTerms ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input
                              className="h-9"
                              type="number"
                              placeholder="Approved amount"
                              value={form.approved_amount}
                              onChange={(event) => updateForm(application.id, form, { approved_amount: event.target.value })}
                            />
                            <Input
                              className="h-9"
                              type="number"
                              step="0.01"
                              placeholder="Rate %"
                              value={form.approved_rate}
                              onChange={(event) => updateForm(application.id, form, { approved_rate: event.target.value })}
                            />
                            <Input
                              className="h-9"
                              type="number"
                              placeholder="Tenure months"
                              value={form.approved_tenure_months}
                              onChange={(event) => updateForm(application.id, form, { approved_tenure_months: event.target.value })}
                            />
                          </div>
                        ) : null}

                        <Button
                          className="w-full"
                          size="sm"
                          disabled={submitting}
                          onClick={() =>
                            decisionMutation.mutate({
                              applicationId: application.id,
                              form,
                            })
                          }
                        >
                          {submitting ? "Saving..." : "Save Decision"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {(rows.length === 0 && !applicationsQuery.isLoading) ? (
            <div className="p-4 text-sm text-muted-foreground">No applications found.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
