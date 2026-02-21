import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { calculateEMI, formatLKR } from "@/data/mockData";
import PageHeader from "@/components/shared/PageHeader";

export default function EMICalculator() {
  const [amount, setAmount] = useState(5000000);
  const [rate, setRate] = useState(14);
  const [tenure, setTenure] = useState(36);

  const emi = calculateEMI(amount, rate, tenure);
  const totalPayable = emi * tenure;
  const totalInterest = totalPayable - amount;

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="EMI Calculator"
        subtitle="Estimate monthly installments and total repayment before choosing a lender."
      />

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Loan Amount (LKR)</Label>
              <span className="text-sm font-medium text-primary">{formatLKR(amount)}</span>
            </div>
            <Slider
              value={[amount]}
              onValueChange={([v]) => setAmount(v)}
              min={100000} max={50000000} step={100000}
            />
            <Input
              type="number" value={amount}
              onChange={e => setAmount(Number(e.target.value))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Interest Rate (%)</Label>
              <span className="text-sm font-medium text-primary">{rate}%</span>
            </div>
            <Slider
              value={[rate]}
              onValueChange={([v]) => setRate(v)}
              min={5} max={30} step={0.5}
            />
            <Input
              type="number" value={rate} step="0.5"
              onChange={e => setRate(Number(e.target.value))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Tenure (months)</Label>
              <span className="text-sm font-medium text-primary">{tenure} months</span>
            </div>
            <Slider
              value={[tenure]}
              onValueChange={([v]) => setTenure(v)}
              min={6} max={120} step={6}
            />
            <Input
              type="number" value={tenure}
              onChange={e => setTenure(Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary text-primary-foreground shadow-lg">
          <CardContent className="p-5 text-center">
            <p className="text-sm opacity-80">Monthly EMI</p>
            <p className="mt-1 text-2xl font-semibold">{formatLKR(emi)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground">Total Payable</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{formatLKR(totalPayable)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground">Total Interest</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">{formatLKR(totalInterest)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repayment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Principal</span>
              <span className="text-foreground">{formatLKR(amount)}</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-l-full bg-primary"
                style={{ width: `${(amount / totalPayable) * 100}%` }}
              />
              <div
                className="h-full rounded-r-full bg-destructive/70"
                style={{ width: `${(totalInterest / totalPayable) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Principal ({((amount / totalPayable) * 100).toFixed(1)}%)</span>
              <span>Interest ({((totalInterest / totalPayable) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
