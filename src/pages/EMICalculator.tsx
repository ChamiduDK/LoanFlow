import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, RefreshCw, TrendingUp, Banknote, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

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
  emi: { monthlyEmi: number; totalInterest: number; totalPayable: number };
  range: { minEmi: number; maxEmi: number } | null;
};

const PRESETS = [
  { label: "Quick Loan", principal: 500_000, rate: 16, tenure: 24 },
  { label: "SME Starter", principal: 2_000_000, rate: 14, tenure: 36 },
  { label: "Business Scale", principal: 5_000_000, rate: 13, tenure: 48 },
  { label: "Large Project", principal: 10_000_000, rate: 12, tenure: 60 },
];

export default function EMICalculator() {
  const { toast } = useToast();

  const [principal, setPrincipal] = useState(5_000_000);
  const [rate, setRate] = useState(14);
  const [tenure, setTenure] = useState(36);
  const [request, setRequest] = useState<EmiPayload>({
    principal: 5_000_000,
    annual_rate: 14,
    tenure_months: 36,
    min_rate: 10,
    max_rate: 20,
    min_tenure_months: 12,
    max_tenure_months: 84,
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

  const interestPercent = useMemo(() => {
    const total = resultQuery.data?.emi.totalPayable ?? 0;
    const interest = resultQuery.data?.emi.totalInterest ?? 0;
    if (total === 0) return 0;
    return Math.round((interest / total) * 100);
  }, [resultQuery.data]);

  const runCalculation = () => {
    if (principal <= 0 || rate <= 0 || tenure <= 0) {
      toast({ title: "Please enter valid values", variant: "destructive" });
      return;
    }
    setRequest({
      principal,
      annual_rate: rate,
      tenure_months: tenure,
      min_rate: Math.max(rate - 4, 1),
      max_rate: rate + 4,
      min_tenure_months: Math.max(tenure - 12, 6),
      max_tenure_months: tenure + 24,
      include_formatted: false,
    });
  };

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">EMI Calculator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Estimate your monthly repayments before you apply for a loan.</p>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => { setPrincipal(preset.principal); setRate(preset.rate); setTenure(preset.tenure); }}
            className={`rounded-xl border px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 ${
              principal === preset.principal && rate === preset.rate && tenure === preset.tenure
                ? "border-primary/50 bg-primary/10"
                : "border-border/60 bg-muted/20"
            }`}
          >
            <p className="text-xs font-bold text-foreground">{preset.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{formatLKR(preset.principal)} | {preset.rate}% | {preset.tenure}mo</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Input Panel */}
        <Card className="border-border/70 bg-card shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-primary" />
              Loan Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Principal */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan Amount</Label>
                <span className="text-sm font-bold text-primary">{formatLKR(principal)}</span>
              </div>
              <Slider
                value={[principal]}
                min={100_000}
                max={20_000_000}
                step={100_000}
                onValueChange={([val]) => setPrincipal(val)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>LKR 100K</span>
                <span>LKR 20M</span>
              </div>
              <Input
                type="number"
                value={principal}
                onChange={(e) => setPrincipal(Number(e.target.value))}
                className="text-sm font-mono"
              />
            </div>

            {/* Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interest Rate</Label>
                <span className="text-sm font-bold text-amber-500">{rate}% p.a.</span>
              </div>
              <Slider
                value={[rate]}
                min={5}
                max={25}
                step={0.5}
                onValueChange={([val]) => setRate(val)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>5%</span>
                <span>25%</span>
              </div>
            </div>

            {/* Tenure */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan Tenure</Label>
                <span className="text-sm font-bold text-emerald-500">{tenure} months</span>
              </div>
              <Slider
                value={[tenure]}
                min={6}
                max={120}
                step={6}
                onValueChange={([val]) => setTenure(val)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>6 months</span>
                <span>10 years</span>
              </div>
            </div>

            <Button className="w-full" onClick={runCalculation} disabled={resultQuery.isFetching}>
              {resultQuery.isFetching ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Calculating...</>
              ) : (
                <><Calculator className="h-4 w-4" /> Calculate EMI</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {/* Monthly EMI Hero */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 shadow-sm">
            <CardContent className="p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-primary/70 mb-2">Monthly EMI</p>
              <p className="text-5xl font-black text-primary leading-none">
                {resultQuery.isLoading ? "..." : formatLKR(resultQuery.data?.emi.monthlyEmi ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Per month for {tenure} months</p>
              {resultQuery.data?.range && (
                <p className="text-xs text-muted-foreground mt-1">
                  Range: {formatLKR(resultQuery.data.range.minEmi)} - {formatLKR(resultQuery.data.range.maxEmi)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
                    <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Interest</p>
                </div>
                <p className="text-xl font-bold text-foreground">{formatLKR(resultQuery.data?.emi.totalInterest ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{interestPercent}% of total payable</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                    <Banknote className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Payable</p>
                </div>
                <p className="text-xl font-bold text-foreground">{formatLKR(resultQuery.data?.emi.totalPayable ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Principal + Interest</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress bars showing principal vs interest */}
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Payment Breakdown</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">Principal</span>
                  <span className="text-muted-foreground">{100 - interestPercent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${100 - interestPercent}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">Interest</span>
                  <span className="text-muted-foreground">{interestPercent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-500"
                    style={{ width: `${interestPercent}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <Button asChild variant="outline" className="w-full">
            <Link to="/apply">
              Ready to apply? Start your loan application
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
