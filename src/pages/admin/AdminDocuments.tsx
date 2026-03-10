import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Gift,
  Plus,
  Save,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminLoanProduct } from "@/types/admin";
import { useToast } from "@/hooks/use-toast";
import { SRI_LANKA_DOCUMENT_PRESETS } from "@/data/documentPresets";

type RequiredDocumentDraft = {
  document_type: string;
  display_name: string;
  is_required: boolean;
  notes: string;
  accepted_formats: string[];
};

type BenefitDraft = {
  title: string;
  description: string;
  is_highlight: boolean;
};

type CollateralDraft = {
  collateral_type: string;
  min_value_ratio: string;
  notes: string;
  is_optional: boolean;
};

const DEFAULT_DOCUMENT_FORMATS = ["pdf", "jpg", "jpeg", "png"] as const;

function createDefaultRequiredDocument(): RequiredDocumentDraft {
  return {
    document_type: "",
    display_name: "",
    is_required: true,
    notes: "",
    accepted_formats: [...DEFAULT_DOCUMENT_FORMATS],
  };
}

function createDefaultBenefit(): BenefitDraft {
  return { title: "", description: "", is_highlight: false };
}

function createDefaultCollateral(): CollateralDraft {
  return { collateral_type: "", min_value_ratio: "", notes: "", is_optional: false };
}

function toNormalizedFormatArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_DOCUMENT_FORMATS];
  const formats = value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => DEFAULT_DOCUMENT_FORMATS.includes(entry as (typeof DEFAULT_DOCUMENT_FORMATS)[number]));
  return formats.length > 0 ? Array.from(new Set(formats)) : [...DEFAULT_DOCUMENT_FORMATS];
}


// ─── Document Accordion Card ─────────────────────────────────────────────────
type DocCardProps = {
  doc: RequiredDocumentDraft;
  index: number;
  onUpdate: (_patch: Partial<RequiredDocumentDraft>) => void;
  onRemove: () => void;
};

function DocumentCard({ doc, index, onUpdate, onRemove }: DocCardProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const title = doc.display_name.trim() || doc.document_type.trim() || `Document ${index + 1}`;

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={doc.is_required ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
              {doc.is_required ? "Required" : "Optional"}
            </Badge>
            {doc.accepted_formats.length > 0 && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {doc.accepted_formats.join(" · ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onRemove} aria-label="Remove document">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded((e) => !e)} aria-label="Expand">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-5 pt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display Name</Label>
              <Input
                value={doc.display_name}
                onChange={(e) => onUpdate({ display_name: e.target.value })}
                placeholder="e.g. Business Registration Certificate"
              />
              <p className="text-[11px] text-muted-foreground">Shown to applicants and used in document guidance.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document Type Key</Label>
              <Input
                value={doc.document_type}
                onChange={(e) => onUpdate({ document_type: e.target.value })}
                placeholder="e.g. business_registration"
              />
              <p className="text-[11px] text-muted-foreground">Use lowercase keys such as `nic` or `bank_statement`.</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Preferred Bank Document</p>
              <p className="text-xs text-muted-foreground">Use this to tell applicants what they should ideally have ready.</p>
            </div>
            <Switch
              checked={doc.is_required}
              onCheckedChange={(checked) => onUpdate({ is_required: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Requirement Note <span className="font-normal normal-case">(optional)</span>
            </Label>
            <Input
              value={doc.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="e.g. Latest 3 months are preferred"
            />
            <p className="text-[11px] text-muted-foreground">This note is shown in optional AI document guidance for applicants.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Benefit Card ─────────────────────────────────────────────────────────────
type BenefitCardProps = {
  benefit: BenefitDraft;
  index: number;
  onUpdate: (_patch: Partial<BenefitDraft>) => void;
  onRemove: () => void;
};

function BenefitCard({ benefit, index, onUpdate, onRemove }: BenefitCardProps) {
  return (
    <div className={`relative rounded-xl border p-4 transition-all ${benefit.is_highlight ? "border-yellow-400/60 bg-yellow-50/40 dark:border-yellow-600/40 dark:bg-yellow-900/10 shadow-sm" : "border-border/60 bg-card"}`}>
      {benefit.is_highlight && (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
          Highlighted
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Benefit Title</Label>
              <Input
                value={benefit.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="e.g. Low processing fee"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
              <Input
                value={benefit.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Brief description of this benefit"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Highlight this benefit</p>
              <p className="text-xs text-muted-foreground">Features this perk prominently on loan cards</p>
            </div>
            <Switch checked={benefit.is_highlight} onCheckedChange={(checked) => onUpdate({ is_highlight: checked })} />
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10" onClick={onRemove} aria-label={`Remove benefit ${index + 1}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Collateral Card ──────────────────────────────────────────────────────────
type CollateralCardProps = {
  entry: CollateralDraft;
  index: number;
  onUpdate: (_patch: Partial<CollateralDraft>) => void;
  onRemove: () => void;
};

function CollateralCard({ entry, index, onUpdate, onRemove }: CollateralCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold">
            {entry.collateral_type.trim() || `Collateral ${index + 1}`}
          </p>
          {entry.is_optional && (
            <Badge variant="secondary" className="text-[10px]">Optional</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onRemove} aria-label={`Remove collateral ${index + 1}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collateral Type</Label>
          <Input
            value={entry.collateral_type}
            onChange={(e) => onUpdate({ collateral_type: e.target.value })}
            placeholder="e.g. Property, Vehicle"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Value Ratio</Label>
          <Input
            type="number"
            min={0}
            max={5}
            step={0.01}
            value={entry.min_value_ratio}
            onChange={(e) => onUpdate({ min_value_ratio: e.target.value })}
            placeholder="e.g. 1.25"
          />
          <p className="text-[11px] text-muted-foreground">Collateral value ÷ loan amount (0–5)</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
          <Input
            value={entry.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="Optional reviewer note"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">Mark as Optional</p>
          <p className="text-xs text-muted-foreground">Borrower may choose to provide or skip this collateral</p>
        </div>
        <Switch checked={entry.is_optional} onCheckedChange={(checked) => onUpdate({ is_optional: checked })} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminDocuments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [productId, setProductId] = useState("");
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocumentDraft[]>([createDefaultRequiredDocument()]);
  const [benefits, setBenefits] = useState<BenefitDraft[]>([createDefaultBenefit()]);
  const [collateral, setCollateral] = useState<CollateralDraft[]>([createDefaultCollateral()]);

  const productsQuery = useQuery({
    queryKey: ["admin-loan-products"],
    queryFn: () => apiFetch<AdminLoanProduct[]>("/api/admin/loan-products"),
  });

  useEffect(() => {
    if (!productId && (productsQuery.data?.length ?? 0) > 0) {
      setProductId(productsQuery.data?.[0].id ?? "");
    }
  }, [productId, productsQuery.data]);

  const selectedProduct = useMemo(
    () => (productsQuery.data ?? []).find((item) => item.id === productId) ?? null,
    [productId, productsQuery.data],
  );

  const productDetailQuery = useQuery({
    queryKey: ["loan-product-detail", productId],
    enabled: Boolean(productId),
    queryFn: () => apiFetch<Record<string, unknown>>(`/api/loan-products/${productId}`),
  });

  useEffect(() => {
    if (!productDetailQuery.data) return;

    const docRows = Array.isArray(productDetailQuery.data.required_documents)
      ? (productDetailQuery.data.required_documents as Record<string, unknown>[])
      : [];
    setRequiredDocuments(
      docRows.length > 0
        ? docRows.map((doc) => ({
            document_type: String(doc.document_type ?? ""),
            display_name: String(doc.display_name ?? ""),
            is_required: Boolean(doc.is_required ?? true),
            notes: doc.notes == null ? "" : String(doc.notes),
            accepted_formats: toNormalizedFormatArray(doc.accepted_formats),
          }))
        : [createDefaultRequiredDocument()],
    );

    const benefitRows = Array.isArray(productDetailQuery.data.benefits)
      ? (productDetailQuery.data.benefits as Record<string, unknown>[])
      : [];
    setBenefits(
      benefitRows.length > 0
        ? benefitRows.map((benefit) => ({
            title: String(benefit.title ?? ""),
            description: benefit.description == null ? "" : String(benefit.description),
            is_highlight: Boolean(benefit.is_highlight ?? false),
          }))
        : [createDefaultBenefit()],
    );

    const collateralRows = Array.isArray(productDetailQuery.data.collateral)
      ? (productDetailQuery.data.collateral as Record<string, unknown>[])
      : [];
    setCollateral(
      collateralRows.length > 0
        ? collateralRows.map((entry) => ({
            collateral_type: String(entry.collateral_type ?? ""),
            min_value_ratio: entry.min_value_ratio == null ? "" : String(entry.min_value_ratio),
            notes: entry.notes == null ? "" : String(entry.notes),
            is_optional: Boolean(entry.is_optional ?? false),
          }))
        : [createDefaultCollateral()],
    );
  }, [productDetailQuery.data]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveDocumentsMutation = useMutation({
    mutationFn: () => {
      if (requiredDocuments.length === 0) throw new Error("Add at least one required document row");
      const payload = requiredDocuments.map((doc, index) => {
        const documentType = doc.document_type.trim().toLowerCase();
        const displayName = doc.display_name.trim();
        if (documentType.length < 2) throw new Error(`Document ${index + 1}: Type key is required`);
        if (displayName.length < 2) throw new Error(`Document ${index + 1}: Display name is required`);

        return {
          document_type: documentType,
          display_name: displayName,
          is_required: doc.is_required,
          notes: doc.notes.trim() || null,
          accepted_formats: [...DEFAULT_DOCUMENT_FORMATS],
        };
      });
      return apiFetch(`/api/admin/required-documents/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ documents: payload }),
      });
    },
    onSuccess: () => {
      toast({ title: "Required documents saved" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save documents", variant: "destructive" });
    },
  });

  const saveBenefitsMutation = useMutation({
    mutationFn: () => {
      if (benefits.length === 0) throw new Error("Add at least one benefit");
      const payload = benefits.map((benefit, index) => {
        const title = benefit.title.trim();
        if (title.length < 2) throw new Error(`Benefit ${index + 1}: Title is required`);
        return { title, description: benefit.description.trim() || null, is_highlight: benefit.is_highlight };
      });
      return apiFetch(`/api/admin/benefits/${productId}`, { method: "PUT", body: JSON.stringify({ benefits: payload }) });
    },
    onSuccess: () => {
      toast({ title: "Benefits saved" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save benefits", variant: "destructive" });
    },
  });

  const saveCollateralMutation = useMutation({
    mutationFn: () => {
      if (collateral.length === 0) throw new Error("Add at least one collateral row");
      const payload = collateral.map((entry, index) => {
        const collateralType = entry.collateral_type.trim();
        if (collateralType.length < 2) throw new Error(`Collateral ${index + 1}: Type is required`);
        let minValueRatio: number | null = null;
        if (entry.min_value_ratio.trim()) {
          const parsed = Number(entry.min_value_ratio.trim());
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5)
            throw new Error(`Collateral ${index + 1}: Min value ratio must be 0–5`);
          minValueRatio = parsed;
        }
        return { collateral_type: collateralType, min_value_ratio: minValueRatio, notes: entry.notes.trim() || null, is_optional: entry.is_optional };
      });
      return apiFetch(`/api/admin/collateral/${productId}`, { method: "PUT", body: JSON.stringify({ collateral: payload }) });
    },
    onSuccess: () => {
      toast({ title: "Collateral saved" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Could not save collateral", variant: "destructive" });
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updateRequiredDocument(index: number, patch: Partial<RequiredDocumentDraft>) {
    setRequiredDocuments((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeRequiredDocument(index: number) {
    setRequiredDocuments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [createDefaultRequiredDocument()];
    });
  }
  function applySriLankaPresetsForAllRows() {
    setRequiredDocuments(
      SRI_LANKA_DOCUMENT_PRESETS.map((preset) => ({
        document_type: preset.document_type,
        display_name: preset.display_name,
        is_required: true,
        notes: preset.notes,
        accepted_formats: [...preset.accepted_formats],
      })),
    );
    toast({ title: "Sri Lanka presets applied", description: "Common SME document requirements were loaded for this loan product." });
  }
  function updateBenefit(index: number, patch: Partial<BenefitDraft>) {
    setBenefits((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeBenefit(index: number) {
    setBenefits((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [createDefaultBenefit()];
    });
  }
  function updateCollateral(index: number, patch: Partial<CollateralDraft>) {
    setCollateral((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeCollateral(index: number) {
    setCollateral((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [createDefaultCollateral()];
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents & Benefits"
        subtitle="Manage preferred applicant documents, loan perks, and collateral requirements for each loan product."
      />

      {/* Product selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan Product</Label>
              <select
                id="admin-docs-product-select"
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

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/60 shadow-xs">
  <TabsTrigger value="documents" className="flex items-center gap-2 rounded-lg py-2.5 text-sm">
    <FileText className="h-4 w-4" />
    <span className="text-sm font-medium">Documents ({requiredDocuments.length})</span>
  </TabsTrigger>
  <TabsTrigger value="benefits" className="flex items-center gap-2 rounded-lg py-2.5 text-sm">
    <Gift className="h-4 w-4" />
    <span className="text-sm font-medium">Benefits ({benefits.length})</span>
  </TabsTrigger>
  <TabsTrigger value="collateral" className="flex items-center gap-2 rounded-lg py-2.5 text-sm">
    <ShieldCheck className="h-4 w-4" />
    <span className="text-sm font-medium">Collateral ({collateral.length})</span>
  </TabsTrigger>
</TabsList>
        

        {/* ── Documents Tab ── */}
        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Required Documents</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Define the documents applicants should ideally have before applying. Keep the rules simple and editable.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={applySriLankaPresetsForAllRows} disabled={!productId}>
                    Apply All Presets (Sri Lanka)
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRequiredDocuments((prev) => [...prev, createDefaultRequiredDocument()])}>
                    <Plus className="h-4 w-4" />
                    Add Document
                  </Button>
                  <Button size="sm" onClick={() => saveDocumentsMutation.mutate()} disabled={saveDocumentsMutation.isPending || !productId}>
                    <Save className="h-4 w-4" />
                    {saveDocumentsMutation.isPending ? "Saving…" : "Save Documents"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">How this is used</p>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <p>Applicants can mark which documents they already have before applying.</p>
                  <p>That availability improves prediction accuracy, but uploads remain optional.</p>
                  <p>If applicants upload a file later, AI only gives guidance against these bank requirements.</p>
                </div>
              </div>

              {requiredDocuments.map((doc, index) => (
                <DocumentCard
                  key={`doc-${index}`}
                  doc={doc}
                  index={index}
                  onUpdate={(patch) => updateRequiredDocument(index, patch)}
                  onRemove={() => removeRequiredDocument(index)}
                />
              ))}
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                Suggested keys: `nic`, `business_registration`, `bank_statement`, `utility_bill`, `tin_tax`, `financial_statements`.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Benefits Tab ── */}
        <TabsContent value="benefits" className="mt-4">
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Loan Benefits</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Highlight perks and advantages of this loan product. Highlighted benefits appear prominently to applicants.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setBenefits((prev) => [...prev, createDefaultBenefit()])}>
                    <Plus className="h-4 w-4" />
                    Add Benefit
                  </Button>
                  <Button size="sm" onClick={() => saveBenefitsMutation.mutate()} disabled={saveBenefitsMutation.isPending || !productId}>
                    <Save className="h-4 w-4" />
                    {saveBenefitsMutation.isPending ? "Saving…" : "Save Benefits"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {benefits.map((benefit, index) => (
                <BenefitCard
                  key={`benefit-${index}`}
                  benefit={benefit}
                  index={index}
                  onUpdate={(patch) => updateBenefit(index, patch)}
                  onRemove={() => removeBenefit(index)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Collateral Tab ── */}
        <TabsContent value="collateral" className="mt-4">
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">Collateral Configuration</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Define accepted collateral types and minimum value ratios for this loan product.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setCollateral((prev) => [...prev, createDefaultCollateral()])}>
                    <Plus className="h-4 w-4" />
                    Add Collateral
                  </Button>
                  <Button size="sm" onClick={() => saveCollateralMutation.mutate()} disabled={saveCollateralMutation.isPending || !productId}>
                    <Save className="h-4 w-4" />
                    {saveCollateralMutation.isPending ? "Saving…" : "Save Collateral"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {collateral.map((entry, index) => (
                <CollateralCard
                  key={`collateral-${index}`}
                  entry={entry}
                  index={index}
                  onUpdate={(patch) => updateCollateral(index, patch)}
                  onRemove={() => removeCollateral(index)}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
