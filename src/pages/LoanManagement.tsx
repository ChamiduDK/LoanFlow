import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import type { TrackerSummary } from "@/types/backend";
import EmptyState from "@/components/shared/EmptyState";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function LoanManagement() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const applicationId = searchParams.get("applicationId") ?? "";

  const trackerQuery = useQuery({
    queryKey: ["tracker-summary", applicationId],
    queryFn: () => apiFetch<TrackerSummary>(`/api/applications/${applicationId}/tracker`),
    enabled: Boolean(applicationId),
  });

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Track repayments, monitor dues, and manage your approved facilities."
        />
        <EmptyState
          title="No application selected"
          description="Open /management?applicationId=<id> to view repayment tracking data."
          action={<Button onClick={() => navigate("/tracker")}>Open Tracker</Button>}
        />
      </div>
    );
  }

  if (trackerQuery.isLoading) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Loan Management"
          subtitle="Loading repayment data..."
        />
      </div>
    );
  }

  const tracker = trackerQuery.data;

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
      />

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
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
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
    </div>
  );
}
