import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminLoanProduct } from "@/types/admin";
import { useToast } from "@/hooks/use-toast";

const defaultRules = {
  min_years_active: 1,
  allowed_business_types: ["Sole Proprietorship", "Partnership", "Private Limited Company"],
  allowed_purposes: ["Working Capital", "Business Expansion"],
  min_turnover: 0,
  max_amount_ratio_turnover: 1,
  collateral_required: false,
  min_monthly_income: 0,
  max_existing_obligations_ratio: 0.6,
};

const defaultTerms = [
  {
    term_label: "Standard",
    min_tenure_months: 6,
    max_tenure_months: 60,
    interest_rate_min: 12,
    interest_rate_max: 18,
    processing_fee_pct: 1,
    late_fee_pct: 2,
    prepayment_allowed: true,
    extra_terms: {},
  },
];

export default function AdminRules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [productId, setProductId] = useState("");
  const [rulesJson, setRulesJson] = useState(JSON.stringify(defaultRules, null, 2));
  const [termsJson, setTermsJson] = useState(JSON.stringify(defaultTerms, null, 2));

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

    const rule = (productDetailQuery.data.eligibility_rule as { rules_json?: Record<string, unknown> } | null)?.rules_json;
    const terms = productDetailQuery.data.loan_terms as Record<string, unknown>[] | undefined;

    setRulesJson(JSON.stringify(rule ?? defaultRules, null, 2));
    setTermsJson(JSON.stringify((terms && terms.length > 0) ? terms.map((term) => ({
      term_label: term.term_label,
      min_tenure_months: term.min_tenure_months,
      max_tenure_months: term.max_tenure_months,
      interest_rate_min: term.interest_rate_min,
      interest_rate_max: term.interest_rate_max,
      processing_fee_pct: term.processing_fee_pct,
      late_fee_pct: term.late_fee_pct,
      prepayment_allowed: term.prepayment_allowed,
      extra_terms: term.extra_terms,
    })) : defaultTerms, null, 2));
  }, [productDetailQuery.data]);

  const saveRulesMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
      return apiFetch(`/api/admin/eligibility-rules/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ rules_json: parsed, is_active: true }),
      });
    },
    onSuccess: () => {
      toast({ title: "Eligibility rules updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Invalid rules JSON",
        variant: "destructive",
      });
    },
  });

  const saveTermsMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(termsJson) as Array<Record<string, unknown>>;
      return apiFetch(`/api/admin/loan-terms/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ terms: parsed }),
      });
    },
    onSuccess: () => {
      toast({ title: "Loan terms updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Invalid terms JSON",
        variant: "destructive",
      });
    },
  });

  const selectedProduct = useMemo(
    () => (productsQuery.data ?? []).find((item) => item.id === productId) ?? null,
    [productId, productsQuery.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eligibility Rules"
        subtitle="Configure rule JSON and term structures for each loan product."
      />

      <Card>
        <CardContent className="p-4">
          <Label>Loan Product</Label>
          <select
            className="mt-2 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {(productsQuery.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>{product.name} ({product.banks?.name ?? "-"})</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">Selected: {selectedProduct?.name ?? "-"}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Eligibility Rules JSON</CardTitle>
            <Button size="sm" onClick={() => saveRulesMutation.mutate()} disabled={saveRulesMutation.isPending || !productId}>
              <Save className="h-4 w-4" />
              Save Rules
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} className="min-h-[420px] font-mono text-xs" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Loan Terms JSON Array</CardTitle>
            <Button size="sm" onClick={() => saveTermsMutation.mutate()} disabled={saveTermsMutation.isPending || !productId}>
              <Save className="h-4 w-4" />
              Save Terms
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea value={termsJson} onChange={(e) => setTermsJson(e.target.value)} className="min-h-[420px] font-mono text-xs" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
