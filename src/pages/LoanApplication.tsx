import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Landmark,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { districts, businessTypes, industries, loanPurposes } from "@/data/mockData";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";

const stepLabels = [
  { title: "Business Profile", hint: "Entity, sector, location", icon: Building2 },
  { title: "Loan Details", hint: "Amount and purpose", icon: Landmark },
  { title: "Financial Snapshot", hint: "Turnover and cash flow", icon: TrendingUp },
  { title: "Collateral & Docs", hint: "Security and uploads", icon: ShieldCheck },
  { title: "Review & Submit", hint: "Final confirmation", icon: ClipboardCheck },
];

export default function LoanApplication() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const progress = ((step + 1) / stepLabels.length) * 100;
  const StepIcon = stepLabels[step].icon;

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="New Loan Application"
        subtitle="Complete each step to generate lender recommendations tailored to your business profile."
      />

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-5">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-[760px] items-start">
              {stepLabels.map((item, i) => (
                <div key={item.title} className="flex min-w-0 flex-1 items-start">
                  <div className="flex min-w-[130px] flex-col items-start gap-2">
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold",
                        i < step && "border-success/20 bg-success/10 text-success",
                        i === step && "border-primary/30 bg-primary text-primary-foreground",
                        i > step && "border-border bg-muted/70 text-muted-foreground",
                      )}
                    >
                      {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <div className="space-y-0.5">
                      <p className={cn("text-sm font-semibold", i <= step ? "text-foreground" : "text-muted-foreground")}>
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                    </div>
                  </div>
                  {i < stepLabels.length - 1 ? (
                    <div className={cn("mt-4 h-px flex-1", i < step ? "bg-success/40" : "bg-border")} />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Step {step + 1} of {stepLabels.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <StepIcon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{stepLabels[step].title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{stepLabels[step].hint}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="business-name">Business Name</Label>
                  <Input id="business-name" placeholder="e.g., Perera Enterprises" />
                  <p className="text-xs text-muted-foreground">Use the registered legal business name.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Type</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {businessTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Industry / Sector</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>
                        {industries.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="years-operation">Years in Operation</Label>
                    <Input id="years-operation" type="number" placeholder="e.g., 5" />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>
                        {districts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="loan-amount">Loan Amount (LKR)</Label>
                  <Input id="loan-amount" type="number" placeholder="e.g., 5000000" />
                </div>
                <div className="space-y-2">
                  <Label>Loan Purpose</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      {loanPurposes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenure">Preferred Tenure (months)</Label>
                  <Input id="tenure" type="number" placeholder="e.g., 36" />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Annual Turnover Band</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="below_1m">Below LKR 1M</SelectItem>
                      <SelectItem value="1m_5m">LKR 1M - 5M</SelectItem>
                      <SelectItem value="5m_25m">LKR 5M - 25M</SelectItem>
                      <SelectItem value="25m_100m">LKR 25M - 100M</SelectItem>
                      <SelectItem value="above_100m">Above LKR 100M</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="monthly-income">Monthly Income Estimate (LKR)</Label>
                    <Input id="monthly-income" type="number" placeholder="e.g., 500000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="existing-loan">Existing Loan Obligations (LKR/month)</Label>
                    <Input id="existing-loan" type="number" placeholder="e.g., 50000" />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Collateral Available?</Label>
                  <RadioGroup defaultValue="no" className="grid gap-3 sm:grid-cols-2">
                    <Label htmlFor="yes" className="flex items-center gap-2 rounded-lg border border-border p-3">
                      <RadioGroupItem value="yes" id="yes" />
                      Yes, collateral available
                    </Label>
                    <Label htmlFor="no" className="flex items-center gap-2 rounded-lg border border-border p-3">
                      <RadioGroupItem value="no" id="no" />
                      No collateral
                    </Label>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Collateral Type (if applicable)</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="property">Property / Land</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="machinery">Machinery</SelectItem>
                      <SelectItem value="fd">Fixed Deposit</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="subtle-grid rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-10 text-center">
                  <p className="text-sm font-semibold text-foreground">Drag and drop documents here</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB per file</p>
                  <Button variant="outline" size="sm" className="mt-4">Select Files</Button>
                </div>
              </>
            )}

            {step === 4 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="surface-card-muted p-4">
                  <p className="label-xs">Business Summary</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Business</span><span className="font-medium">Perera Enterprises</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Industry</span><span className="font-medium">Retail & Wholesale</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">District</span><span className="font-medium">Colombo</span></div>
                  </div>
                </div>
                <div className="surface-card-muted p-4">
                  <p className="label-xs">Loan Request</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">LKR 5,000,000</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Purpose</span><span className="font-medium">Working Capital</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tenure</span><span className="font-medium">36 months</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Collateral</span><span className="font-medium">No</span></div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Application Guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Complete all mandatory fields to improve recommendation quality.</p>
            <p>Use accurate turnover and liabilities to get better approval probability predictions.</p>
            <p>Upload core verification documents early to avoid underwriting delays.</p>
          </CardContent>
        </Card>
      </div>

      <div className="desktop-sticky-actions flex items-center justify-between gap-3">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < stepLabels.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="success" onClick={() => navigate("/results")}>
            Submit Application
          </Button>
        )}
      </div>
    </div>
  );
}
