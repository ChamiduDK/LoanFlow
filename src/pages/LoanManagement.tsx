import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatLKR, installmentHistory } from "@/data/mockData";
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
  Clock3,
  Download,
  Landmark,
  PieChart,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";

export default function LoanManagement() {
  const paidCount = installmentHistory.filter((item) => item.status === "paid").length;
  const totalInstallments = 36;
  const repaymentProgress = Math.round((paidCount / totalInstallments) * 100);

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
            <p className="text-2xl font-semibold text-foreground">{formatLKR(15000000)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Commercial Bank | Biz Growth Loan</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Monthly EMI</p>
            <p className="text-2xl font-semibold text-primary">{formatLKR(125000)}</p>
            <p className="mt-1 text-xs text-muted-foreground">36 months at 13.5%</p>
          </CardContent>
        </Card>

        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-warning/20">
              <Clock3 className="h-4 w-4 text-warning-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Next Due Date</p>
            <p className="text-2xl font-semibold text-foreground">Mar 5</p>
            <p className="mt-1 text-xs font-medium text-warning-foreground">14 days remaining</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
              <PieChart className="h-4 w-4 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">Remaining Balance</p>
            <p className="text-2xl font-semibold text-foreground">{formatLKR(14750000)}</p>
            <p className="mt-1 text-xs text-muted-foreground">34 installments left</p>
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
            <span className="text-sm font-semibold text-primary">{repaymentProgress}%</span>
          </div>
          <Progress value={repaymentProgress} />
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
                  <TableHead>Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installmentHistory.map((installment) => (
                  <TableRow key={installment.month}>
                    <TableCell className="font-medium">{installment.month}</TableCell>
                    <TableCell>{formatLKR(installment.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{installment.date}</TableCell>
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
                Your next installment of {formatLKR(125000)} is due on March 5, 2025.
                Ensure sufficient balance in your linked repayment account.
              </p>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full">
            <Download className="h-4 w-4" />
            Export Repayment Plan
          </Button>
          <Button variant="outline" className="w-full">
            <Calendar className="h-4 w-4" />
            Set Payment Reminders
          </Button>
        </div>
      </div>
    </div>
  );
}
