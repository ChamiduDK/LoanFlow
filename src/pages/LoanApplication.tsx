import { useMemo, useState } from "react";
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
import { districts, businessTypes, industries, loanPurposes } from "@/data/referenceData";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";
import { formatLKR } from "@/lib/currency";
import type { LoanApplication } from "@/types/backend";

const stepLabels = [
  { title: "Business Profile", hint: "Entity, sector, location", icon: Building2 },
  { title: "Loan Details", hint: "Amount and purpose", icon: Landmark },
  { title: "Financial Snapshot", hint: "Turnover and cash flow", icon: TrendingUp },
  { title: "Collateral & Docs", hint: "Security and uploads", icon: ShieldCheck },
  { title: "Review & Submit", hint: "Final confirmation", icon: ClipboardCheck },
];

type FormState = {
  business_name: string;
  business_type: string;
  industry: string;
  years_active: string;
  district: string;
  requested_amount: string;
  purpose: string;
  preferred_tenure_months: string;
  turnover_band: string;
  monthly_income: string;
  existing_loan_obligations: string;
  collateral_available: boolean;
  collateral_type: string;
};

const initialForm: FormState = {
  business_name: "",
  business_type: "",
  industry: "",
  years_active: "",
  district: "",
  requested_amount: "",
  purpose: "",
  preferred_tenure_months: "",
  turnover_band: "",
  monthly_income: "",
  existing_loan_obligations: "",
  collateral_available: false,
  collateral_type: "",
};

export default function LoanApplication() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const navigate = useNavigate();
  const { toast } = useToast();

  const validateCurrentStep = (): boolean => {
    if (step === 0) {
      if (!form.business_name.trim()) {
        toast({ title: "Business name is required", variant: "destructive" });
        return false;
      }
      if (!form.business_type) {
        toast({ title: "Business type is required", variant: "destructive" });
        return false;
      }
      if (!form.industry) {
        toast({ title: "Industry / sector is required", variant: "destructive" });
        return false;
      }
    }
    if (step === 1) {
      const amount = Number(form.requested_amount);
      if (!amount || amount <= 0) {
        toast({ title: "A valid loan amount is required", variant: "destructive" });
        return false;
      }
      if (!form.purpose) {
        toast({ title: "Loan purpose is required", variant: "destructive" });
        return false;
      }
      const tenure = Number(form.preferred_tenure_months);
      if (!tenure || tenure <= 0) {
        toast({ title: "A valid preferred tenure is required", variant: "destructive" });
        return false;
      }
    }
    if (step === 2) {
      if (!form.turnover_band) {
        toast({ title: "Annual turnover band is required", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const progress = ((step + 1) / stepLabels.length) * 100;
  const StepIcon = stepLabels[step].icon;

  const parsedSummary = useMemo(() => {
    const amount = Number(form.requested_amount || 0);
    const tenure = Number(form.preferred_tenure_months || 0);

    return {
      amount,
      tenure,
      yearsActive: Number(form.years_active || 0),
      monthlyIncome: Number(form.monthly_income || 0),
      monthlyObligations: Number(form.existing_loan_obligations || 0),
    };
  }, [form]);

  const onSubmit = async () => {
    const amount = Number(form.requested_amount);
    const tenure = Number(form.preferred_tenure_months);

    if (!amount || !tenure || !form.purpose) {
      toast({
        title: "Missing required data",
        description: "Provide amount, purpose, and tenure before submission.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          business_name: form.business_name || null,
          business_type: form.business_type || null,
          industry: form.industry || null,
          years_active: form.years_active ? Number(form.years_active) : null,
          district: form.district || null,
          turnover_band: form.turnover_band || null,
          monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
          existing_loan_obligations: form.existing_loan_obligations ? Number(form.existing_loan_obligations) : null,
        }),
      });

      const application = await apiFetch<LoanApplication>("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          requested_amount: amount,
          purpose: form.purpose,
          preferred_tenure_months: tenure,
          collateral_available: form.collateral_available,
          collateral_type: form.collateral_type || null,
          status: "submitted",
          business_context: {
            turnover_band: form.turnover_band,
          },
        }),
      });

      await apiFetch(`/api/applications/${application.id}/evaluate`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      toast({
        title: "Application submitted",
        description: "Recommendations are ready.",
      });

      navigate(`/results?applicationId=${application.id}`);
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Unable to submit application",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

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
                  <Input id="business-name" value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Type</Label>
                    <Select value={form.business_type} onValueChange={(value) => setForm((f) => ({ ...f, business_type: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {businessTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Industry / Sector</Label>
                    <Select value={form.industry} onValueChange={(value) => setForm((f) => ({ ...f, industry: value }))}>
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
                    <Input id="years-operation" type="number" value={form.years_active} onChange={(e) => setForm((f) => ({ ...f, years_active: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Select value={form.district} onValueChange={(value) => setForm((f) => ({ ...f, district: value }))}>
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
                  <Input id="loan-amount" type="number" value={form.requested_amount} onChange={(e) => setForm((f) => ({ ...f, requested_amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Loan Purpose</Label>
                  <Select value={form.purpose} onValueChange={(value) => setForm((f) => ({ ...f, purpose: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      {loanPurposes.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenure">Preferred Tenure (months)</Label>
                  <Input id="tenure" type="number" value={form.preferred_tenure_months} onChange={(e) => setForm((f) => ({ ...f, preferred_tenure_months: e.target.value }))} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Annual Turnover Band</Label>
                  <Select value={form.turnover_band} onValueChange={(value) => setForm((f) => ({ ...f, turnover_band: value }))}>
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
                    <Input id="monthly-income" type="number" value={form.monthly_income} onChange={(e) => setForm((f) => ({ ...f, monthly_income: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="existing-loan">Existing Loan Obligations (LKR/month)</Label>
                    <Input id="existing-loan" type="number" value={form.existing_loan_obligations} onChange={(e) => setForm((f) => ({ ...f, existing_loan_obligations: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Collateral Available?</Label>
                  <RadioGroup
                    value={form.collateral_available ? "yes" : "no"}
                    onValueChange={(value) => setForm((f) => ({ ...f, collateral_available: value === "yes" }))}
                    className="grid gap-3 sm:grid-cols-2"
                  >
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
                  <Select value={form.collateral_type} onValueChange={(value) => setForm((f) => ({ ...f, collateral_type: value }))}>
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
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Document upload is handled after application creation in the Document Upload module.
                </div>
              </>
            )}

            {step === 4 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="surface-card-muted p-4">
                  <p className="label-xs">Business Summary</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Business</span><span className="font-medium">{form.business_name || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Industry</span><span className="font-medium">{form.industry || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">District</span><span className="font-medium">{form.district || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Years Active</span><span className="font-medium">{parsedSummary.yearsActive || 0}</span></div>
                  </div>
                </div>
                <div className="surface-card-muted p-4">
                  <p className="label-xs">Loan Request</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{formatLKR(parsedSummary.amount)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Purpose</span><span className="font-medium">{form.purpose || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tenure</span><span className="font-medium">{parsedSummary.tenure || 0} months</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Collateral</span><span className="font-medium">{form.collateral_available ? "Yes" : "No"}</span></div>
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
            <p>Upload verification documents after submission to improve approval confidence.</p>
          </CardContent>
        </Card>
      </div>

      <div className="desktop-sticky-actions flex items-center justify-between gap-3">
        <Button variant="outline" disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < stepLabels.length - 1 ? (
          <Button disabled={submitting} onClick={() => { if (validateCurrentStep()) setStep((s) => s + 1); }}>
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="success" disabled={submitting} onClick={onSubmit}>
            {submitting ? "Submitting..." : "Submit Application"}
          </Button>
        )}
      </div>
    </div>
  );
}
