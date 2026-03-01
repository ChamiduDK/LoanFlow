import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

type EmiPayload = {
  principal: number;
  annual_rate: number;
  tenure_months: number;
  min_rate?: number;
  max_rate?: number;
  min_tenure_months?: number;
  max_tenure_months?: number;
  include_formatted: boolean;
};

type EmiResponse = {
  emi: {
    monthlyEmi: number;
    totalInterest: number;
    totalPayable: number;
  };
  range: {
    minEmi: number;
    maxEmi: number;
  } | null;
};

export default function EMICalculator() {
  const { toast } = useToast();

  const defaultScenario = {
    principal: "5000000",
    annual_rate: "14",
    tenure_months: "36",
    min_rate: "12",
    max_rate: "18",
    min_tenure_months: "24",
    max_tenure_months: "60",
  };

  const [form, setForm] = useState({
    ...defaultScenario,
  });
  const [request, setRequest] = useState<EmiPayload>({
    principal: 5_000_000,
    annual_rate: 14,
    tenure_months: 36,
    min_rate: 12,
    max_rate: 18,
    min_tenure_months: 24,
    max_tenure_months: 60,
    include_formatted: false,
  });

  const resultQuery = useQuery({
    queryKey: ["emi-calculator", request],
    queryFn: () =>
      apiFetch<EmiResponse>("/api/calculator/emi", {
        method: "POST",
        body: JSON.stringify(request),
      }),
  });

  const runCalculation = () => {
    const next: EmiPayload = {
      principal: Number(form.principal),
      annual_rate: Number(form.annual_rate),
      tenure_months: Number(form.tenure_months),
      min_rate: Number(form.min_rate),
      max_rate: Number(form.max_rate),
      min_tenure_months: Number(form.min_tenure_months),
      max_tenure_months: Number(form.max_tenure_months),
      include_formatted: false,
    };

    if (!Number.isFinite(next.principal) || next.principal <= 0) {
      toast({ title: "Invalid principal amount" });
      return;
    }

    if (!Number.isFinite(next.annual_rate) || next.annual_rate < 0) {
      toast({ title: "Invalid interest rate" });
      return;
    }

    if (!Number.isFinite(next.tenure_months) || next.tenure_months <= 0) {
      toast({ title: "Invalid tenure" });
      return;
    }

    setRequest(next);
  };

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="EMI Calculator"
        subtitle="Estimate monthly installments with different rates and tenures before you apply."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calculation Inputs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="principal">Loan Amount (LKR)</Label>
              <Input
                id="principal"
                type="number"
                value={form.principal}
                onChange={(event) => setForm((prev) => ({ ...prev, principal: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Current input: {formatLKR(Number(form.principal || 0))}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="annual_rate">Interest Rate (%)</Label>
                <Input
                  id="annual_rate"
                  type="number"
                  step="0.01"
                  value={form.annual_rate}
                  onChange={(event) => setForm((prev) => ({ ...prev, annual_rate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenure_months">Tenure (Months)</Label>
                <Input
                  id="tenure_months"
                  type="number"
                  value={form.tenure_months}
                  onChange={(event) => setForm((prev) => ({ ...prev, tenure_months: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="min_rate">Min Rate (%)</Label>
                <Input
                  id="min_rate"
                  type="number"
                  step="0.01"
                  value={form.min_rate}
                  onChange={(event) => setForm((prev) => ({ ...prev, min_rate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_rate">Max Rate (%)</Label>
                <Input
                  id="max_rate"
                  type="number"
                  step="0.01"
                  value={form.max_rate}
                  onChange={(event) => setForm((prev) => ({ ...prev, max_rate: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="min_tenure">Min Tenure (Months)</Label>
                <Input
                  id="min_tenure"
                  type="number"
                  value={form.min_tenure_months}
                  onChange={(event) => setForm((prev) => ({ ...prev, min_tenure_months: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tenure">Max Tenure (Months)</Label>
                <Input
                  id="max_tenure"
                  type="number"
                  value={form.max_tenure_months}
                  onChange={(event) => setForm((prev) => ({ ...prev, max_tenure_months: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={runCalculation} disabled={resultQuery.isFetching}>
                <Calculator className="h-4 w-4" />
                {resultQuery.isFetching ? "Calculating..." : "Calculate EMI"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setForm(defaultScenario)}
                disabled={resultQuery.isFetching}
              >
                Reset Defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
              <p className="text-xs text-muted-foreground">Monthly EMI</p>
              <p className="mt-1 text-2xl font-semibold text-primary">
                {formatLKR(resultQuery.data?.emi.monthlyEmi ?? 0)}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-4">
                <p className="text-xs text-muted-foreground">Total Interest</p>
                <p className="mt-1 text-lg font-semibold">{formatLKR(resultQuery.data?.emi.totalInterest ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-border/70 p-4">
                <p className="text-xs text-muted-foreground">Total Payable</p>
                <p className="mt-1 text-lg font-semibold">{formatLKR(resultQuery.data?.emi.totalPayable ?? 0)}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 p-4">
              <p className="text-xs text-muted-foreground">EMI Range (Scenario)</p>
              <p className="mt-1 text-sm text-foreground">
                {resultQuery.data?.range
                  ? `${formatLKR(resultQuery.data.range.minEmi)} - ${formatLKR(resultQuery.data.range.maxEmi)}`
                  : "Range unavailable"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
