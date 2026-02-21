import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  Calendar,
  Download,
  Landmark,
  PieChart,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatLKR } from "@/lib/currency";
import { apiFetch } from "@/lib/api/client";
import type { LoanApplication, LoanManagementAccessResponse, TrackerSummary } from "@/types/backend";
import EmptyState from "@/components/shared/EmptyState";
import { useToast } from "@/hooks/use-toast";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function LoanManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applicationIdFromUrl = searchParams.get("applicationId") ?? "";
  const [installmentForm, setInstallmentForm] = useState({
    due_date: "",
    amount: "",
    status: "pending" as "pending" | "paid" | "late",
    paid_date: "",
    notes: "",
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
    staleTime: 30_000,
  });
  const fallbackApplicationId = applicationsQuery.data?.find((item) => item.status === "approved")?.id
    ?? applicationsQuery.data?.[0]?.id
    ?? "";
  const applicationId = applicationIdFromUrl || fallbackApplicationId;

  useEffect(() => {
    if (!applicationIdFromUrl && fallbackApplicationId) {
      const next = new URLSearchParams(searchParams);
      next.set("applicationId", fallbackApplicationId);
      setSearchParams(next, { replace: true });
    }
  }, [applicationIdFromUrl, fallbackApplicationId, searchParams, setSearchParams]);

  const loanManagementQuery = useQuery({
    queryKey: ["loan-management", applicationId],
    queryFn: () => apiFetch<LoanManagementAccessResponse>(`/api/applications/${applicationId}/loan-management`),
    enabled: Boolean(applicationId),
    retry: false,
  });

  const addInstallmentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/applications/${applicationId}/tracker/installments`, {
        method: "POST",
        body: JSON.stringify({
          due_date: installmentForm.due_date,
          amount: Number(installmentForm.amount),
          status: installmentForm.status,
          paid_date: installmentForm.status === "paid" ? installmentForm.paid_date || null : null,
          notes: installmentForm.notes.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Installment added" });
      setInstallmentForm({
        due_date: "",
        amount: "",
        status: "pending",
        paid_date: "",
        notes: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["loan-management", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-page", applicationId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to add installment",
        description: error instanceof Error ? error.message : "Could not add installment",
        variant: "destructive",
      });
    },
  });

  const handleAddInstallment = () => {
    if (!installmentForm.due_date) {
      toast({ title: "Due date is required", variant: "destructive" });
      return;
    }

    const amount = Number(installmentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Installment amount must be greater than zero", variant: "destructive" });
      return;
    }

    if (installmentForm.status === "paid" && !installmentForm.paid_date) {
      toast({ title: "Paid date is required for paid installments", variant: "destructive" });
      return;
    }

    addInstallmentMutation.mutate();
  };

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Track repayments, monitor dues, and manage your approved facilities."
        />
        <EmptyState
          title="No applications found"
          description="Create your first application to access loan management."
          action={<Button onClick={() => navigate("/apply")}>Create Application</Button>}
        />
      </div>
    );
  }

  if (loanManagementQuery.isLoading) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Loading repayment data..."
        />
      </div>
    );
  }

  if (loanManagementQuery.isError) {
    const isAccessLocked = loanManagementQuery.error instanceof Error &&
      loanManagementQuery.error.message.toLowerCase().includes("only after approval");

    if (isAccessLocked) {
      return (
        <div className="space-y-6 px-2 md:px-6">
          <PageHeader
            title="Loan Management"
            subtitle="Track repayments, monitor dues, and manage your approved facilities."
          />
          <EmptyState
            title="Repayment management is locked"
            description="This feature becomes available after the application is marked as approved."
            action={<Button onClick={() => navigate(`/tracker?applicationId=${applicationId}`)}>Open Tracker</Button>}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Track repayments, monitor dues, and manage your approved facilities."
        />
        <EmptyState
          title="Failed to load repayment data"
          description="There was an error loading tracker data for this application. Please try again."
          action={<Button onClick={() => void loanManagementQuery.refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const tracker = loanManagementQuery.data?.tracker_summary as TrackerSummary | undefined;

  if (!tracker) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Track repayments, monitor dues, and manage your approved facilities."
        />
        <EmptyState
          title="No tracker data"
          description="Update outcome status and installments to populate this view."
          action={<Button onClick={() => navigate(`/tracker?applicationId=${applicationId}`)}>Go to Tracker</Button>}
        />
      </div>
    );
  }

  const isApproved = loanManagementQuery.data?.unlocked === true;

  const totalInstallments = tracker.loanSummary.approvedTenureMonths ?? tracker.installmentHistory.length;
  const paidCount = tracker.installmentHistory.filter((item) => item.status === "paid").length;
  const remainingBalance =
    tracker.loanSummary.approvedAmount !== null &&
    totalInstallments > 0 &&
    tracker.loanSummary.emi !== null
      ? Math.max(tracker.loanSummary.approvedAmount - paidCount * tracker.loanSummary.emi, 0)
      : null;

  const exportRepaymentPlan = () => {
    const headers = ["Installment ID", "Due Date", "Amount", "Status", "Paid Date", "Notes"];
    const rows = tracker.installmentHistory.map((item) => [
      item.id,
      item.dueDate,
      item.amount.toString(),
      item.status,
      item.paidDate ?? "",
      item.notes ?? "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `repayment-plan-${applicationId.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Loan Management"
        subtitle="Track repayments, monitor dues, and manage your approved facilities."
        actions={(
          <Select
            value={applicationId}
            onValueChange={(value) => {
              const next = new URLSearchParams(searchParams);
              next.set("applicationId", value);
              setSearchParams(next);
            }}
          >
            <SelectTrigger className="min-w-[220px]">
              <SelectValue placeholder="Select application" />
            </SelectTrigger>
            <SelectContent>
              {(applicationsQuery.data ?? []).map((application) => (
                <SelectItem key={application.id} value={application.id}>
                  {application.id.slice(0, 8)} - {application.purpose}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {!isApproved ? (
        <EmptyState
          title="Repayment management is locked"
          description="This feature becomes available after the application is marked as approved."
          action={<Button onClick={() => navigate(`/tracker?applicationId=${applicationId}`)}>Open Tracker</Button>}
        />
      ) : null}

      {isApproved ? (
        <>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-info/10">
              <Landmark className="h-4 w-4 text-info" />
            </div>
            <p className="text-sm text-muted-foreground">Approved Amount</p>
            <p className="text-2xl font-semibold text-foreground">{formatLKR(tracker.loanSummary.approvedAmount ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Application {applicationId.slice(0, 8)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Monthly EMI</p>
            <p className="text-2xl font-semibold text-primary">{formatLKR(tracker.loanSummary.emi ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tracker.loanSummary.approvedTenureMonths ?? 0} months</p>
          </CardContent>
        </Card>

        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-warning/20">
              <Calendar className="h-4 w-4 text-warning-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Next Due Date</p>
            <p className="text-2xl font-semibold text-foreground">{formatDate(tracker.nextDueDate)}</p>
            <p className="mt-1 text-xs font-medium text-warning-foreground">Keep repayments on schedule</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <PieChart className="h-4 w-4 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">Remaining Balance</p>
            <p className="text-2xl font-semibold text-foreground">{formatLKR(remainingBalance ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{Math.max(totalInstallments - paidCount, 0)} installments left</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repayment Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{paidCount} of {totalInstallments} installments paid</span>
            <span className="text-sm font-semibold text-primary">{tracker.progressPercent.toFixed(1)}%</span>
          </div>
          <Progress value={tracker.progressPercent} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-3">
        <Card className="data-table-wrap xl:col-span-2">
          <CardHeader>
            <CardTitle>Installment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracker.installmentHistory.map((installment) => (
                  <TableRow key={installment.id}>
                    <TableCell className="font-medium">{formatDate(installment.dueDate)}</TableCell>
                    <TableCell>{formatLKR(installment.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(installment.paidDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={installment.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {tracker.installmentHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No installments recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Installment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Due date</Label>
                <Input
                  type="date"
                  value={installmentForm.due_date}
                  onChange={(event) => setInstallmentForm((prev) => ({ ...prev, due_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Amount (LKR)</Label>
                <Input
                  type="number"
                  value={installmentForm.amount}
                  onChange={(event) => setInstallmentForm((prev) => ({ ...prev, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select
                  value={installmentForm.status}
                  onValueChange={(value) => setInstallmentForm((prev) => ({ ...prev, status: value as "pending" | "paid" | "late" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {installmentForm.status === "paid" ? (
                <div className="space-y-2">
                  <Label className="text-xs">Paid date</Label>
                  <Input
                    type="date"
                    value={installmentForm.paid_date}
                    onChange={(event) => setInstallmentForm((prev) => ({ ...prev, paid_date: event.target.value }))}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={installmentForm.notes}
                  onChange={(event) => setInstallmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Optional note"
                />
              </div>
              <Button
                className="w-full"
                disabled={addInstallmentMutation.isPending}
                onClick={handleAddInstallment}
              >
                {addInstallmentMutation.isPending ? "Saving..." : "Add Installment"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-warning" />
                <span className="text-sm font-semibold text-foreground">Payment Reminder</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Next due installment is on {formatDate(tracker.nextDueDate)}. Keep sufficient balance in your repayment account.
              </p>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={exportRepaymentPlan}>
            <Download className="h-4 w-4" />
            Export Repayment Plan
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate(`/tracker?applicationId=${applicationId}`)}>
            <Calendar className="h-4 w-4" />
            Open Tracker
          </Button>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
