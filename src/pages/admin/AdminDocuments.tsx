import { useEffect, useState } from "react";
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

const defaultRequiredDocuments = [
  {
    document_type: "nic",
    display_name: "National Identity Card",
    is_required: true,
    notes: null,
    accepted_formats: ["pdf", "jpg", "png"],
  },
];

const defaultBenefits = [
  {
    title: "Standard Benefit",
    description: "Replace with product-specific benefit",
    is_highlight: false,
  },
];

const defaultCollateral = [
  {
    collateral_type: "Property",
    min_value_ratio: null,
    notes: null,
    is_optional: false,
  },
];

export default function AdminDocuments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [productId, setProductId] = useState("");
  const [docsJson, setDocsJson] = useState(JSON.stringify(defaultRequiredDocuments, null, 2));
  const [benefitsJson, setBenefitsJson] = useState(JSON.stringify(defaultBenefits, null, 2));
  const [collateralJson, setCollateralJson] = useState(JSON.stringify(defaultCollateral, null, 2));

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

    setDocsJson(JSON.stringify((productDetailQuery.data.required_documents as unknown[]) ?? defaultRequiredDocuments, null, 2));
    setBenefitsJson(JSON.stringify((productDetailQuery.data.benefits as unknown[]) ?? defaultBenefits, null, 2));
    setCollateralJson(JSON.stringify((productDetailQuery.data.collateral as unknown[]) ?? defaultCollateral, null, 2));
  }, [productDetailQuery.data]);

  const saveDocumentsMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(docsJson) as Array<Record<string, unknown>>;
      return apiFetch(`/api/admin/required-documents/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ documents: parsed }),
      });
    },
    onSuccess: () => {
      toast({ title: "Required documents updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Invalid required documents JSON",
        variant: "destructive",
      });
    },
  });

  const saveBenefitsMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(benefitsJson) as Array<Record<string, unknown>>;
      return apiFetch(`/api/admin/benefits/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ benefits: parsed }),
      });
    },
    onSuccess: () => {
      toast({ title: "Benefits updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Invalid benefits JSON",
        variant: "destructive",
      });
    },
  });

  const saveCollateralMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(collateralJson) as Array<Record<string, unknown>>;
      return apiFetch(`/api/admin/collateral/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ collateral: parsed }),
      });
    },
    onSuccess: () => {
      toast({ title: "Collateral updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Invalid collateral JSON",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents and Benefits"
        subtitle="Maintain required document definitions, product benefits, and collateral configuration."
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
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Required Documents</CardTitle>
            <Button size="sm" onClick={() => saveDocumentsMutation.mutate()} disabled={saveDocumentsMutation.isPending || !productId}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea value={docsJson} onChange={(e) => setDocsJson(e.target.value)} className="min-h-[420px] font-mono text-xs" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Benefits</CardTitle>
            <Button size="sm" onClick={() => saveBenefitsMutation.mutate()} disabled={saveBenefitsMutation.isPending || !productId}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea value={benefitsJson} onChange={(e) => setBenefitsJson(e.target.value)} className="min-h-[420px] font-mono text-xs" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Collateral</CardTitle>
            <Button size="sm" onClick={() => saveCollateralMutation.mutate()} disabled={saveCollateralMutation.isPending || !productId}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea value={collateralJson} onChange={(e) => setCollateralJson(e.target.value)} className="min-h-[420px] font-mono text-xs" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
