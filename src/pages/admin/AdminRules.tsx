import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid number value");
  }

  return parsed;
}

function toRequiredNumber(value: string, field: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

function toOptionalPercent(value: string, field: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${field} must be between 0 and 100`);
  }

  return parsed;
}

function parseExtraTerms(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Extra terms JSON must be an object");
  }

  return parsed;
}

function buildRulePayload(form: EligibilityRulesForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    collateral_required: form.collateral_required,
  };

  const minYearsActive = toOptionalNumber(form.min_years_active);
  if (minYearsActive !== undefined) {
    payload.min_years_active = minYearsActive;
  }

  const minTurnover = toOptionalNumber(form.min_turnover);
  if (minTurnover !== undefined) {
    payload.min_turnover = minTurnover;
  }

  const maxAmountRatioTurnover = toOptionalNumber(form.max_amount_ratio_turnover);
  if (maxAmountRatioTurnover !== undefined) {
    payload.max_amount_ratio_turnover = maxAmountRatioTurnover;
  }

  const minMonthlyIncome = toOptionalNumber(form.min_monthly_income);
  if (minMonthlyIncome !== undefined) {
    payload.min_monthly_income = minMonthlyIncome;
  }

  const maxObligationRatio = toOptionalNumber(form.max_existing_obligations_ratio);
  if (maxObligationRatio !== undefined) {
    if (maxObligationRatio < 0 || maxObligationRatio > 1) {
      throw new Error("Max existing obligations ratio must be between 0 and 1");
    }
    payload.max_existing_obligations_ratio = maxObligationRatio;
  }

  const businessTypes = form.allowed_business_types.map((value) => value.trim()).filter(Boolean);
  if (businessTypes.length > 0) {
    payload.allowed_business_types = businessTypes;
  }

  const purposes = form.allowed_purposes.map((value) => value.trim()).filter(Boolean);
  if (purposes.length > 0) {
    payload.allowed_purposes = purposes;
  }

  const turnoverBands = form.allowed_turnover_bands.map((value) => value.trim()).filter(Boolean);
  if (turnoverBands.length > 0) {
    payload.allowed_turnover_bands = turnoverBands;
  }

  return payload;
}

type ListEditorProps = {
  label: string;
  placeholder: string;
  items: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

function ListEditor({
  label,
  placeholder,
  items,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
}: ListEditorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <Button variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No options added</p>
        ) : (
          items.map((item, index) => (
            <Badge key={`${item}-${index}`} variant="secondary" className="gap-1">
              {item}
              <button
                type="button"
                className="inline-flex items-center"
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
    if (!productDetailQuery.data) {
      return;
    }

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
    if (termRows.length === 0) {
      setTerms([createDefaultTermDraft()]);
      return;
    }

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
      toast({ title: "Eligibility rules updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save eligibility rules",
        variant: "destructive",
      });
    },
  });

  const saveTermsMutation = useMutation({
    mutationFn: () => {
      if (terms.length === 0) {
        throw new Error("Add at least one loan term");
      }

      const payload = terms.map((term, index) => {
        const label = term.term_label.trim();
        if (label.length < 2) {
          throw new Error(`Row ${index + 1}: Term label must be at least 2 characters`);
        }

        const minTenure = toRequiredNumber(term.min_tenure_months, `Row ${index + 1}: Min tenure`);
        const maxTenure = toRequiredNumber(term.max_tenure_months, `Row ${index + 1}: Max tenure`);
        if (maxTenure < minTenure) {
          throw new Error(`Row ${index + 1}: Max tenure must be greater than or equal to min tenure`);
        }

        const minRate = toRequiredNumber(term.interest_rate_min, `Row ${index + 1}: Min interest rate`);
        const maxRate = toRequiredNumber(term.interest_rate_max, `Row ${index + 1}: Max interest rate`);
        if (maxRate < minRate) {
          throw new Error(`Row ${index + 1}: Max interest rate must be greater than or equal to min rate`);
        }

        return {
          term_label: label,
          min_tenure_months: minTenure,
          max_tenure_months: maxTenure,
          interest_rate_min: minRate,
          interest_rate_max: maxRate,
          processing_fee_pct: toOptionalPercent(term.processing_fee_pct, `Row ${index + 1}: Processing fee`),
          late_fee_pct: toOptionalPercent(term.late_fee_pct, `Row ${index + 1}: Late fee`),
          prepayment_allowed: term.prepayment_allowed,
          extra_terms: parseExtraTerms(term.extra_terms_json),
        };
      });

      return apiFetch(`/api/admin/loan-terms/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ terms: payload }),
      });
    },
    onSuccess: () => {
      toast({ title: "Loan terms updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save loan terms",
        variant: "destructive",
      });
    },
  });

  function addListValue(field: "allowed_business_types" | "allowed_purposes" | "allowed_turnover_bands", rawValue: string) {
    const value = rawValue.trim();
    if (!value) {
      return;
    }

    setRulesForm((prev) => {
      if (prev[field].some((item) => item.toLowerCase() === value.toLowerCase())) {
        return prev;
      }

      return {
        ...prev,
        [field]: [...prev[field], value],
      };
    });
  }

  function removeListValue(field: "allowed_business_types" | "allowed_purposes" | "allowed_turnover_bands", index: number) {
    setRulesForm((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  function updateTerm(index: number, patch: Partial<LoanTermDraft>) {
    setTerms((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeTerm(index: number) {
    setTerms((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createDefaultTermDraft()];
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eligibility Rules"
        subtitle="Configure borrower criteria and loan terms using guided inputs and editable rows."
      />

      <Card>
        <CardContent className="p-4">
          <Label>Loan Product</Label>
          <select
            className="mt-2 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            {(productsQuery.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.banks?.name ?? "-"})
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">Selected: {selectedProduct?.name ?? "-"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Eligibility Criteria</CardTitle>
          <Button
            size="sm"
            onClick={() => saveRulesMutation.mutate()}
            disabled={saveRulesMutation.isPending || !productId}
          >
            <Save className="h-4 w-4" />
            {saveRulesMutation.isPending ? "Saving..." : "Save Criteria"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Min Years Active</Label>
              <Input
                type="number"
                min={0}
                value={rulesForm.min_years_active}
                onChange={(event) => setRulesForm((prev) => ({ ...prev, min_years_active: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min Turnover (LKR)</Label>
              <Input
                type="number"
                min={0}
                value={rulesForm.min_turnover}
                onChange={(event) => setRulesForm((prev) => ({ ...prev, min_turnover: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Amount / Turnover</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={rulesForm.max_amount_ratio_turnover}
                onChange={(event) => setRulesForm((prev) => ({ ...prev, max_amount_ratio_turnover: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min Monthly Income (LKR)</Label>
              <Input
                type="number"
                min={0}
                value={rulesForm.min_monthly_income}
                onChange={(event) => setRulesForm((prev) => ({ ...prev, min_monthly_income: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Max Existing Obligations Ratio (0-1)</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={rulesForm.max_existing_obligations_ratio}
                onChange={(event) => setRulesForm((prev) => ({ ...prev, max_existing_obligations_ratio: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <p className="text-sm font-medium text-foreground">Collateral Required</p>
              <Switch
                checked={rulesForm.collateral_required}
                onCheckedChange={(checked) => setRulesForm((prev) => ({ ...prev, collateral_required: checked }))}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ListEditor
              label="Allowed Business Types"
              placeholder="e.g. Sole Proprietorship"
              items={rulesForm.allowed_business_types}
              draft={businessTypeDraft}
              onDraftChange={setBusinessTypeDraft}
              onAdd={() => {
                addListValue("allowed_business_types", businessTypeDraft);
                setBusinessTypeDraft("");
              }}
              onRemove={(index) => removeListValue("allowed_business_types", index)}
            />
            <ListEditor
              label="Allowed Purposes"
              placeholder="e.g. Working Capital"
              items={rulesForm.allowed_purposes}
              draft={purposeDraft}
              onDraftChange={setPurposeDraft}
              onAdd={() => {
                addListValue("allowed_purposes", purposeDraft);
                setPurposeDraft("");
              }}
              onRemove={(index) => removeListValue("allowed_purposes", index)}
            />
            <ListEditor
              label="Allowed Turnover Bands"
              placeholder="e.g. 10M-25M"
              items={rulesForm.allowed_turnover_bands}
              draft={turnoverBandDraft}
              onDraftChange={setTurnoverBandDraft}
              onAdd={() => {
                addListValue("allowed_turnover_bands", turnoverBandDraft);
                setTurnoverBandDraft("");
              }}
              onRemove={(index) => removeListValue("allowed_turnover_bands", index)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Loan Terms</CardTitle>
          <div className="flex items-center gap-2">
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
              {saveTermsMutation.isPending ? "Saving..." : "Save Terms"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead>Tenure (Months)</TableHead>
                  <TableHead>Interest (%)</TableHead>
                  <TableHead>Fees (%)</TableHead>
                  <TableHead>Prepayment</TableHead>
                  <TableHead>Extra Terms JSON</TableHead>
                  <TableHead className="w-16">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((term, index) => (
                  <TableRow key={`term-${index}`}>
                    <TableCell>
                      <Input
                        value={term.term_label}
                        onChange={(event) => updateTerm(index, { term_label: event.target.value })}
                        placeholder="Standard"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={term.min_tenure_months}
                          onChange={(event) => updateTerm(index, { min_tenure_months: event.target.value })}
                          placeholder="Min"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={term.max_tenure_months}
                          onChange={(event) => updateTerm(index, { max_tenure_months: event.target.value })}
                          placeholder="Max"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={term.interest_rate_min}
                          onChange={(event) => updateTerm(index, { interest_rate_min: event.target.value })}
                          placeholder="Min"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={term.interest_rate_max}
                          onChange={(event) => updateTerm(index, { interest_rate_max: event.target.value })}
                          placeholder="Max"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={term.processing_fee_pct}
                          onChange={(event) => updateTerm(index, { processing_fee_pct: event.target.value })}
                          placeholder="Processing"
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={term.late_fee_pct}
                          onChange={(event) => updateTerm(index, { late_fee_pct: event.target.value })}
                          placeholder="Late"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={term.prepayment_allowed}
                        onCheckedChange={(checked) => updateTerm(index, { prepayment_allowed: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        className="min-h-20 font-mono text-xs"
                        value={term.extra_terms_json}
                        onChange={(event) => updateTerm(index, { extra_terms_json: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeTerm(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-4 p-4 lg:hidden">
            {terms.map((term, index) => (
              <div
                key={`term-card-${index}`}
                className="rounded-xl border border-border/70 bg-card p-4 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Term Label</Label>
                    <Input
                      value={term.term_label}
                      onChange={(event) => updateTerm(index, { term_label: event.target.value })}
                      placeholder="Standard"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTerm(index)} aria-label="Remove term">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Tenure Min (months)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={term.min_tenure_months}
                      onChange={(event) => updateTerm(index, { min_tenure_months: event.target.value })}
                      placeholder="Min months"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tenure Max (months)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={term.max_tenure_months}
                      onChange={(event) => updateTerm(index, { max_tenure_months: event.target.value })}
                      placeholder="Max months"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Interest Min (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={term.interest_rate_min}
                      onChange={(event) => updateTerm(index, { interest_rate_min: event.target.value })}
                      placeholder="Min %"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Interest Max (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={term.interest_rate_max}
                      onChange={(event) => updateTerm(index, { interest_rate_max: event.target.value })}
                      placeholder="Max %"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Processing Fee (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={term.processing_fee_pct}
                      onChange={(event) => updateTerm(index, { processing_fee_pct: event.target.value })}
                      placeholder="Processing %"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Late Fee (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={term.late_fee_pct}
                      onChange={(event) => updateTerm(index, { late_fee_pct: event.target.value })}
                      placeholder="Late %"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Prepayment allowed</p>
                    <p className="text-xs text-muted-foreground">Toggle if borrower can prepay without penalty</p>
                  </div>
                  <Switch
                    checked={term.prepayment_allowed}
                    onCheckedChange={(checked) => updateTerm(index, { prepayment_allowed: checked })}
                  />
                </div>

                <div className="mt-3 space-y-1">
                  <Label>Extra Terms JSON</Label>
                  <Textarea
                    className="min-h-24 font-mono text-xs"
                    value={term.extra_terms_json}
                    onChange={(event) => updateTerm(index, { extra_terms_json: event.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 text-xs text-muted-foreground">
            Keep at least one term row. Save validates tenure/rate ranges and JSON format.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
