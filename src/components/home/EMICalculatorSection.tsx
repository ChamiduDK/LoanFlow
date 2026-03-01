import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { calculateEmi } from "@/lib/loan";
import { formatLKR } from "@/lib/currency";

export default function EMICalculatorSection() {
  const [amount, setAmount] = useState(5000000);
  const [rate, setRate] = useState(14);
  const [tenure, setTenure] = useState(36);

  const { emi, totalPayable, totalInterest, principalPct, interestPct } = useMemo(() => {
    const monthlyEmi = calculateEmi(amount, rate, tenure);
    const payable = monthlyEmi * tenure;
    const interest = Math.max(0, payable - amount);
    const principalRatio = payable > 0 ? (amount / payable) * 100 : 0;
    const interestRatio = payable > 0 ? (interest / payable) * 100 : 0;

    return {
      emi: monthlyEmi,
      totalPayable: payable,
      totalInterest: interest,
      principalPct: principalRatio,
      interestPct: interestRatio,
    };
  }, [amount, rate, tenure]);

  return (
    <section id="calculator" className="py-16 sm:py-20">
      <div className="container px-2 md:px-0">
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/40 p-5 sm:p-8 ">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-8 max-w-3xl sm:mb-10">
              <p className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Financial Planning
              </p>
              <h2 className="mt-4 text-2xl font-semibold text-foreground sm:text-3xl lg:text-4xl">EMI Calculator</h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Estimate monthly installments instantly and understand your full repayment profile
                before choosing a loan.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
              <div className="space-y-7 rounded-2xl border border-border/80 bg-background/80 p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-semibold text-foreground">Loan Parameters</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Loan Amount (LKR)</Label>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {formatLKR(amount)}
                    </span>
                  </div>
                  <Slider
                    value={[amount]}
                    onValueChange={([v]) => setAmount(v)}
                    min={100000}
                    max={50000000}
                    step={100000}
                    className="py-2"
                  />
                  <Input
                    type="number"
                    value={amount}
                    min={100000}
                    max={50000000}
                    step={100000}
                    className="h-11 bg-card"
                    onChange={(e) => setAmount(Math.min(50000000, Math.max(100000, Number(e.target.value) || 100000)))}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Interest Rate (%)</Label>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {rate}%
                    </span>
                  </div>
                  <Slider
                    value={[rate]}
                    onValueChange={([v]) => setRate(v)}
                    min={5}
                    max={30}
                    step={0.5}
                    className="py-2"
                  />
                  <Input
                    type="number"
                    value={rate}
                    step="0.5"
                    min={5}
                    max={30}
                    className="h-11 bg-card"
                    onChange={(e) => setRate(Math.min(30, Math.max(5, Number(e.target.value) || 5)))}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Tenure (Months)</Label>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {tenure} Months
                    </span>
                  </div>
                  <Slider
                    value={[tenure]}
                    onValueChange={([v]) => setTenure(v)}
                    min={6}
                    max={120}
                    step={6}
                    className="py-2"
                  />
                  <Input
                    type="number"
                    value={tenure}
                    min={6}
                    max={120}
                    step={6}
                    className="h-11 bg-card"
                    onChange={(e) => setTenure(Math.min(120, Math.max(6, Number(e.target.value) || 6)))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Monthly EMI</p>
                  <p className="mt-2 text-3xl font-bold text-primary">{formatLKR(emi)}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total Interest</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatLKR(totalInterest)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total Payable</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatLKR(totalPayable)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-foreground">Repayment Breakdown</h3>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-primary" />
                      <span className="text-muted-foreground">Principal</span>
                    </div>
                    <span className="font-semibold">{formatLKR(amount)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-amber-400/90" />
                      <span className="text-muted-foreground">Interest</span>
                    </div>
                    <span className="font-semibold">{formatLKR(totalInterest)}</span>
                  </div>

                  <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted/50">
                    <div className="bg-primary transition-all duration-500" style={{ width: `${principalPct}%` }} />
                    <div className="bg-amber-400/90 transition-all duration-500" style={{ width: `${interestPct}%` }} />
                  </div>

                  <div className="mt-3 flex justify-between text-xs font-medium text-muted-foreground">
                    <span>{principalPct.toFixed(1)}% Principal</span>
                    <span>{interestPct.toFixed(1)}% Interest</span>
                  </div>
                </div>

                <p className="text-center text-xs italic text-muted-foreground">
                  * Calculations are estimates based on reducing-balance assumptions. Actual bank
                  terms may vary.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
