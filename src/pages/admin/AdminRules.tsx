import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercent,
  Banknote,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Plus,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminLoanProduct } from "@/types/admin";
import { useToast } from "@/hooks/use-toast";

type EligibilityRulesForm = {
  min_years_active: string;
  allowed_business_types: string[];
  allowed_purposes: string[];
  allowed_turnover_bands: string[];
  min_turnover: string;
  max_amount_ratio_turnover: string;
  collateral_required: boolean;
  min_monthly_income: string;
  max_existing_obligations_ratio: string;
};

type LoanTermDraft = {
  term_label: string;
  min_tenure_months: string;
  max_tenure_months: string;
  interest_rate_min: string;
  interest_rate_max: string;
  processing_fee_pct: string;
  late_fee_pct: string;
  prepayment_allowed: boolean;
  extra_terms_json: string;
};

const defaultRulesForm: EligibilityRulesForm = {
  min_years_active: "1",
  allowed_business_types: ["Sole Proprietorship", "Partnership", "Private Limited Company"],
  allowed_purposes: ["Working Capital", "Business Expansion"],
  allowed_turnover_bands: [],
  min_turnover: "0",
  max_amount_ratio_turnover: "1",
  collateral_required: false,
  min_monthly_income: "0",
  max_existing_obligations_ratio: "0.6",
};

function createDefaultTermDraft(): LoanTermDraft {
  return {
    term_label: "Standard",
    min_tenure_months: "6",
    max_tenure_months: "60",
    interest_rate_min: "12",
    interest_rate_max: "18",
    processing_fee_pct: "1",
    late_fee_pct: "2",
    prepayment_allowed: true,
    extra_terms_json: "{}",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error("Invalid number value");
  return parsed;
}

function toRequiredNumber(value: string, field: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) throw new Error(`${field} is required`);
  return parsed;
}

function toOptionalPercent(value: string, field: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new Error(`${field} must be between 0 and 100`);
  return parsed;
}

function parseExtraTerms(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error("Extra terms JSON must be an object");
  return parsed;
}

function buildRulePayload(form: EligibilityRulesForm): Record<string, unknown> {
  const payload: Record<string, unknown> = { collateral_required: form.collateral_required };
  const minYearsActive = toOptionalNumber(form.min_years_active);
  if (minYearsActive !== undefined) payload.min_years_active = minYearsActive;
  const minTurnover = toOptionalNumber(form.min_turnover);
  if (minTurnover !== undefined) payload.min_turnover = minTurnover;
  const maxAmountRatioTurnover = toOptionalNumber(form.max_amount_ratio_turnover);
  if (maxAmountRatioTurnover !== undefined) payload.max_amount_ratio_turnover = maxAmountRatioTurnover;
  const minMonthlyIncome = toOptionalNumber(form.min_monthly_income);
  if (minMonthlyIncome !== undefined) payload.min_monthly_income = minMonthlyIncome;
  const maxObligationRatio = toOptionalNumber(form.max_existing_obligations_ratio);
  if (maxObligationRatio !== undefined) {
    if (maxObligationRatio < 0 || maxObligationRatio > 1)
      throw new Error("Max existing obligations ratio must be between 0 and 1");
    payload.max_existing_obligations_ratio = maxObligationRatio;
  }
  const businessTypes = form.allowed_business_types.map((v) => v.trim()).filter(Boolean);
  if (businessTypes.length > 0) payload.allowed_business_types = businessTypes;
  const purposes = form.allowed_purposes.map((v) => v.trim()).filter(Boolean);
  if (purposes.length > 0) payload.allowed_purposes = purposes;
  const turnoverBands = form.allowed_turnover_bands.map((v) => v.trim()).filter(Boolean);
  if (turnoverBands.length > 0) payload.allowed_turnover_bands = turnoverBands;
  return payload;
}

// ── Tag Input ─────────────────────────────────────────────────────────────────
type TagInputProps = {
  label: string;
  hint?: string;
  placeholder: string;
  items: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  icon?: React.ReactNode;
};

function TagInput({ label, hint, placeholder, items, draft, onDraftChange, onAdd, onRemove, icon }: TagInputProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <div>
          <p className="text-sm font-semibold">{label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onAdd(); }
          }}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={onAdd} className="shrink-0">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No options added yet</p>
        ) : (
          items.map((item, index) => (
            <Badge key={`${item}-${index}`} variant="secondary" className="gap-1 pl-2.5 pr-1.5 py-1 text-xs">
              {item}
              <button
                type="button"
                className="ml-0.5 inline-flex items-center rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${item}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

// ── Loan Term Card ────────────────────────────────────────────────────────────
type TermCardProps = {
  term: LoanTermDraft;
  index: number;
  onUpdate: (patch: Partial<LoanTermDraft>) => void;
  onRemove: () => void;
};

function LoanTermCard({ term, index, onUpdate, onRemove }: TermCardProps) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{term.term_label || `Term ${index + 1}`}</p>
          <div className="flex flex-wrap gap-2 mt-0.5 text-[11px] text-muted-foreground">
            {term.min_tenure_months && term.max_tenure_months && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {term.min_tenure_months}–{term.max_tenure_months} mo
              </span>
            )}
            {term.interest_rate_min && term.interest_rate_max && (
              <span className="flex items-center gap-0.5">
                <BadgePercent className="h-3 w-3" />
                {term.interest_rate_min}–{term.interest_rate_max}%
              </span>
            )}
            <Badge variant={term.prepayment_allowed ? "default" : "secondary"} className="text-[10px] px-1.5">
              {term.prepayment_allowed ? "Prepay ✓" : "No Prepay"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onRemove} aria-label="Remove term">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((e) => !e)} aria-label="Toggle">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-5 pt-4 space-y-5">
          {/* Term label */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Term Label</Label>
            <Input
              value={term.term_label}
              onChange={(e) => onUpdate({ term_label: e.target.value })}
              placeholder="e.g. Standard, Premium, Short-Term"
            />
          </div>

          {/* Tenure + Interest side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Tenure (Months)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Minimum</Label>
                  <Input
                    type="number"
                    min={1}
                    value={term.min_tenure_months}
                    onChange={(e) => onUpdate({ min_tenure_months: e.target.value })}
                    placeholder="e.g. 6"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Maximum</Label>
                  <Input
                    type="number"
                    min={1}
                    value={term.max_tenure_months}
                    onChange={(e) => onUpdate({ max_tenure_months: e.target.value })}
                    placeholder="e.g. 60"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BadgePercent className="h-3.5 w-3.5" />
                Interest Rate (%)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Minimum</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={term.interest_rate_min}
                    onChange={(e) => onUpdate({ interest_rate_min: e.target.value })}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Maximum</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={term.interest_rate_max}
                    onChange={(e) => onUpdate({ interest_rate_max: e.target.value })}
                    placeholder="e.g. 18"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Fees */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" />
              Fee Structure (%)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Processing Fee %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={term.processing_fee_pct}
                  onChange={(e) => onUpdate({ processing_fee_pct: e.target.value })}
                  placeholder="e.g. 1"
                />
                <p className="text-[11px] text-muted-foreground">Charged on loan disbursal</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Late Payment Fee %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={term.late_fee_pct}
                  onChange={(e) => onUpdate({ late_fee_pct: e.target.value })}
                  placeholder="e.g. 2"
                />
                <p className="text-[11px] text-muted-foreground">Penalty per overdue EMI</p>
              </div>
            </div>
          </div>

          {/* Prepayment toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Allow Early Repayment</p>
              <p className="text-xs text-muted-foreground">Borrower can repay the loan before the term ends without penalty</p>
            </div>
            <Switch
              checked={term.prepayment_allowed}
              onCheckedChange={(checked) => onUpdate({ prepayment_allowed: checked })}
            />
          </div>

          {/* Extra terms JSON */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra Terms (JSON)</Label>
            <Textarea
              className="min-h-[80px] font-mono text-xs resize-none"
              value={term.extra_terms_json}
              onChange={(e) => onUpdate({ extra_terms_json: e.target.value })}
              placeholder='{}'
            />
            <p className="text-[11px] text-muted-foreground">Optional additional parameters as a JSON object</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminRules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [productId, setProductId] = useState("");
  const [rulesForm, setRulesForm] = useState<EligibilityRulesForm>(defaultRulesForm);
  const [terms, setTerms] = useState<LoanTermDraft[]>([createDefaultTermDraft()]);
  const [businessTypeDraft, setBusinessTypeDraft] = useState("");
  const [purposeDraft, setPurposeDraft] = useState("");
  const [turnoverBandDraft, setTurnoverBandDraft] = useState("");

  const productsQuery = useQuery({
    queryKey: ["admin-loan-products"],
    queryFn: () => apiFetch<AdminLoanProduct[]>("/api/admin/loan-products"),
  });

  useEffect(() => {
    if (!productId && (productsQuery.data?.length ?? 0) > 0) {
      setProductId(productsQuery.data?.[0].id ?? "");
    }
  }, [productId, productsQuery.data]);

  const productDetailQuery = useQuery({
    queryKey: ["loan-product-detail", productId],
    enabled: Boolean(productId),
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/loan-products/${productId}`),
  });

  useEffect(() => {
    if (!productDetailQuery.data) return;

    const eligibilityRuleContainer = isRecord(productDetailQuery.data.eligibility_rule)
      ? (productDetailQuery.data.eligibility_rule as Record<string, unknown>)
      : null;
    const rulePayload = isRecord(eligibilityRuleContainer?.rules_json)
      ? (eligibilityRuleContainer.rules_json as Record<string, unknown>)
      : {};

    setRulesForm({
      min_years_active: rulePayload.min_years_active != null ? String(rulePayload.min_years_active) : "",
      allowed_business_types: toStringArray(rulePayload.allowed_business_types),
      allowed_purposes: toStringArray(rulePayload.allowed_purposes),
      allowed_turnover_bands: toStringArray(rulePayload.allowed_turnover_bands),
      min_turnover: rulePayload.min_turnover != null ? String(rulePayload.min_turnover) : "",
      max_amount_ratio_turnover: rulePayload.max_amount_ratio_turnover != null ? String(rulePayload.max_amount_ratio_turnover) : "",
      collateral_required: Boolean(rulePayload.collateral_required ?? false),
      min_monthly_income: rulePayload.min_monthly_income != null ? String(rulePayload.min_monthly_income) : "",
      max_existing_obligations_ratio:
        rulePayload.max_existing_obligations_ratio != null ? String(rulePayload.max_existing_obligations_ratio) : "",
    });

    const termRows = Array.isArray(productDetailQuery.data.loan_terms)
      ? (productDetailQuery.data.loan_terms as Record<string, unknown>[])
      : [];
    if (termRows.length === 0) { setTerms([createDefaultTermDraft()]); return; }
    setTerms(termRows.map((term) => ({
      term_label: String(term.term_label ?? ""),
      min_tenure_months: String(term.min_tenure_months ?? ""),
      max_tenure_months: String(term.max_tenure_months ?? ""),
      interest_rate_min: String(term.interest_rate_min ?? ""),
      interest_rate_max: String(term.interest_rate_max ?? ""),
      processing_fee_pct: term.processing_fee_pct == null ? "" : String(term.processing_fee_pct),
      late_fee_pct: term.late_fee_pct == null ? "" : String(term.late_fee_pct),
      prepayment_allowed: Boolean(term.prepayment_allowed ?? true),
      extra_terms_json: JSON.stringify(isRecord(term.extra_terms) ? term.extra_terms : {}, null, 2),
    })));
  }, [productDetailQuery.data]);

  const selectedProduct = useMemo(
    () => (productsQuery.data ?? []).find((item) => item.id === productId) ?? null,
    [productId, productsQuery.data],
  );

  const saveRulesMutation = useMutation({
    mutationFn: () => {
      const payload = buildRulePayload(rulesForm);
      return apiFetch(`/api/admin/eligibility-rules/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ rules_json: payload, is_active: true }),
      });
    },
    onSuccess: () => {
      toast({ title: "Eligibility rules saved" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save eligibility rules", variant: "destructive" });
    },
  });

  const saveTermsMutation = useMutation({
    mutationFn: () => {
      if (terms.length === 0) throw new Error("Add at least one loan term");
      const payload = terms.map((term, index) => {
        const label = term.term_label.trim();
        if (label.length < 2) throw new Error(`Term ${index + 1}: Label must be at least 2 characters`);
        const minTenure = toRequiredNumber(term.min_tenure_months, `Term ${index + 1}: Min tenure`);
        const maxTenure = toRequiredNumber(term.max_tenure_months, `Term ${index + 1}: Max tenure`);
        if (maxTenure < minTenure) throw new Error(`Term ${index + 1}: Max tenure must be ≥ min tenure`);
        const minRate = toRequiredNumber(term.interest_rate_min, `Term ${index + 1}: Min interest rate`);
        const maxRate = toRequiredNumber(term.interest_rate_max, `Term ${index + 1}: Max interest rate`);
        if (maxRate < minRate) throw new Error(`Term ${index + 1}: Max rate must be ≥ min rate`);
        return {
          term_label: label,
          min_tenure_months: minTenure,
          max_tenure_months: maxTenure,
          interest_rate_min: minRate,
          interest_rate_max: maxRate,
          processing_fee_pct: toOptionalPercent(term.processing_fee_pct, `Term ${index + 1}: Processing fee`),
          late_fee_pct: toOptionalPercent(term.late_fee_pct, `Term ${index + 1}: Late fee`),
          prepayment_allowed: term.prepayment_allowed,
          extra_terms: parseExtraTerms(term.extra_terms_json),
        };
      });
      return apiFetch(`/api/admin/loan-terms/${productId}`, { method: "PUT", body: JSON.stringify({ terms: payload }) });
    },
    onSuccess: () => {
      toast({ title: "Loan terms saved" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save loan terms", variant: "destructive" });
    },
  });

  function addListValue(field: "allowed_business_types" | "allowed_purposes" | "allowed_turnover_bands", rawValue: string) {
    const value = rawValue.trim();
    if (!value) return;
    setRulesForm((prev) => {
      if (prev[field].some((item) => item.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [field]: [...prev[field], value] };
    });
  }

  function removeListValue(field: "allowed_business_types" | "allowed_purposes" | "allowed_turnover_bands", index: number) {
    setRulesForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  }

  function updateTerm(index: number, patch: Partial<LoanTermDraft>) {
    setTerms((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeTerm(index: number) {
    setTerms((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [createDefaultTermDraft()];
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eligibility Rules"
        subtitle="Configure borrower criteria and loan terms for each loan product."
      />

      {/* Product selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan Product</Label>
              <select
                id="admin-rules-product-select"
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                {(productsQuery.data ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.banks?.name ?? "–"})
                  </option>
                ))}
              </select>
            </div>
            {selectedProduct && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm font-medium text-primary">{selectedProduct.name}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Eligibility Criteria ── */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Eligibility Criteria</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Define the minimum borrower requirements. These rules are applied automatically during loan matching.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => saveRulesMutation.mutate()}
              disabled={saveRulesMutation.isPending || !productId}
              className="shrink-0"
            >
              <Save className="h-4 w-4" />
              {saveRulesMutation.isPending ? "Saving…" : "Save Criteria"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-5">

          {/* Numeric criteria grid */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial Thresholds</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Business Age Requirement
                </div>
                <Input
                  type="number"
                  min={0}
                  value={rulesForm.min_years_active}
                  onChange={(e) => setRulesForm((prev) => ({ ...prev, min_years_active: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Minimum years the business must have been active</p>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5" />
                  Min Annual Turnover (LKR)
                </div>
                <Input
                  type="number"
                  min={0}
                  value={rulesForm.min_turnover}
                  onChange={(e) => setRulesForm((prev) => ({ ...prev, min_turnover: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Minimum annual revenue in Sri Lankan Rupees</p>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Target className="h-3.5 w-3.5" />
                  Max Loan / Turnover Ratio
                </div>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={rulesForm.max_amount_ratio_turnover}
                  onChange={(e) => setRulesForm((prev) => ({ ...prev, max_amount_ratio_turnover: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Loan amount ÷ annual turnover (e.g. 1 = 100% of turnover)</p>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Banknote className="h-3.5 w-3.5" />
                  Min Monthly Income (LKR)
                </div>
                <Input
                  type="number"
                  min={0}
                  value={rulesForm.min_monthly_income}
                  onChange={(e) => setRulesForm((prev) => ({ ...prev, min_monthly_income: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Applicant's minimum net monthly income</p>
              </div>
            </div>
          </div>

          {/* Debt ratio + Collateral */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BadgePercent className="h-3.5 w-3.5" />
                Max Debt Obligations Ratio (0–1)
              </div>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={rulesForm.max_existing_obligations_ratio}
                onChange={(e) => setRulesForm((prev) => ({ ...prev, max_existing_obligations_ratio: e.target.value }))}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Existing debt payments ÷ monthly income. E.g. 0.6 means existing EMIs cannot exceed 60% of income.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Collateral Required</p>
                <p className="text-xs text-muted-foreground">
                  Borrower must pledge an asset (property, vehicle, etc.) as security for this loan
                </p>
              </div>
              <Switch
                checked={rulesForm.collateral_required}
                onCheckedChange={(checked) => setRulesForm((prev) => ({ ...prev, collateral_required: checked }))}
              />
            </div>
          </div>

          {/* Tag lists */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allowed Categories</p>
            <div className="grid gap-4 lg:grid-cols-3">
              <TagInput
                label="Business Types"
                hint="Who can apply based on legal structure"
                placeholder="e.g. Sole Proprietorship"
                items={rulesForm.allowed_business_types}
                draft={businessTypeDraft}
                onDraftChange={setBusinessTypeDraft}
                icon={<Building2 className="h-4 w-4" />}
                onAdd={() => { addListValue("allowed_business_types", businessTypeDraft); setBusinessTypeDraft(""); }}
                onRemove={(i) => removeListValue("allowed_business_types", i)}
              />
              <TagInput
                label="Loan Purposes"
                hint="Eligible purposes for borrowing"
                placeholder="e.g. Working Capital"
                items={rulesForm.allowed_purposes}
                draft={purposeDraft}
                onDraftChange={setPurposeDraft}
                icon={<Target className="h-4 w-4" />}
                onAdd={() => { addListValue("allowed_purposes", purposeDraft); setPurposeDraft(""); }}
                onRemove={(i) => removeListValue("allowed_purposes", i)}
              />
              <TagInput
                label="Turnover Bands"
                hint="Revenue ranges that qualify for this product"
                placeholder="e.g. 10M–25M"
                items={rulesForm.allowed_turnover_bands}
                draft={turnoverBandDraft}
                onDraftChange={setTurnoverBandDraft}
                icon={<Banknote className="h-4 w-4" />}
                onAdd={() => { addListValue("allowed_turnover_bands", turnoverBandDraft); setTurnoverBandDraft(""); }}
                onRemove={(i) => removeListValue("allowed_turnover_bands", i)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Loan Terms ── */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Loan Terms</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Define rate structures and tenure options. Each term set represents a distinct loan plan offered under this product.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setTerms((prev) => [...prev, createDefaultTermDraft()])}>
                <Plus className="h-4 w-4" />
                Add Term
              </Button>
              <Button
                size="sm"
                onClick={() => saveTermsMutation.mutate()}
                disabled={saveTermsMutation.isPending || !productId}
              >
                <Save className="h-4 w-4" />
                {saveTermsMutation.isPending ? "Saving…" : "Save Terms"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {terms.map((term, index) => (
            <LoanTermCard
              key={`term-${index}`}
              term={term}
              index={index}
              onUpdate={(patch) => updateTerm(index, patch)}
              onRemove={() => removeTerm(index)}
            />
          ))}
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Keep at least one term row. Saving validates tenure and interest rate ranges plus JSON syntax.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
