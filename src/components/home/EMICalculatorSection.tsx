import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section id="calculator" className="py-16 bg-muted/35">
      <div className="container px-2 md:px-0">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">EMI Calculator</h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Estimate your monthly installments and see the total cost of your loan clearly.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Loan Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Loan Amount (LKR)</Label>
                  <span className="text-sm font-bold text-primary">{formatLKR(amount)}</span>
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
                  className="h-10 bg-background"
                  onChange={(e) => setAmount(Math.min(50000000, Math.max(100000, Number(e.target.value) || 100000)))}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Interest Rate (%)</Label>
                  <span className="text-sm font-bold text-primary">{rate}%</span>
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
                  className="h-10 bg-background"
                  onChange={(e) => setRate(Math.min(30, Math.max(5, Number(e.target.value) || 5)))}
                />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Tenure (Months)</Label>
                  <span className="text-sm font-bold text-primary">{tenure} Months</span>
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
                  className="h-10 bg-background"
                  onChange={(e) => setTenure(Math.min(120, Math.max(6, Number(e.target.value) || 6)))}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border border-border/70 bg-[#f8f7f2] text-foreground dark:bg-muted/30">
                <CardContent className="p-5 flex flex-col items-center justify-center min-h-[100px]">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold text-center">Monthly EMI</p>
                  <p className="mt-2 text-2xl font-bold">{formatLKR(emi)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 border-2">
                <CardContent className="p-5 flex flex-col items-center justify-center min-h-[100px]">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold text-center">Total Payable</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{formatLKR(totalPayable)}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Repayment Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-muted-foreground">Principal</span>
                  </div>
                  <span className="font-semibold">{formatLKR(amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border border-border/80 bg-[#f3f2ed] dark:bg-muted/50" />
                    <span className="text-muted-foreground">Total Interest</span>
                  </div>
                  <span className="font-semibold text-foreground">{formatLKR(totalInterest)}</span>
                </div>

                <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${principalPct}%` }}
                  />
                  <div
                    className="absolute top-0 right-0 h-full border-l border-border/60 bg-[#f3f2ed] transition-all duration-500 dark:bg-muted/50"
                    style={{ left: `${principalPct}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>{principalPct.toFixed(1)}% Principal</span>
                  <span>{interestPct.toFixed(1)}% Interest</span>
                </div>
              </CardContent>
            </Card>
            
            <p className="text-xs text-center text-muted-foreground italic">
              * Calculations are estimates based on flat-reducing balance. Actual bank rates may vary.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
