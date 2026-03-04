import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { apiFetch } from "@/lib/api/client";
import type { AdminLoanProduct } from "@/types/admin";
import { useToast } from "@/hooks/use-toast";

type RequiredDocumentDraft = {
  document_type: string;
  display_name: string;
  is_required: boolean;
  notes: string;
  accepted_formats: string[];
  verification_required_keywords: string;
  verification_forbidden_keywords: string;
  verification_min_text_length: string;
  verification_ai_instructions: string;
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

const DOCUMENT_FORMAT_OPTIONS = ["pdf", "jpg", "png"] as const;

type SriLankaDocumentPreset = {
  document_type: string;
  display_name: string;
  accepted_formats?: string[];
  required_keywords: string[];
  forbidden_keywords?: string[];
  min_text_length: number;
  ai_instructions: string;
  notes?: string;
};

const SRI_LANKA_DOCUMENT_PRESETS: Record<string, SriLankaDocumentPreset> = {
  nic: {
    document_type: "nic",
    display_name: "National Identity Card",
    accepted_formats: ["jpg", "png", "pdf"],
    required_keywords: [
      "national identity card",
      "identity card",
      "sri lanka",
      "name",
    ],
    forbidden_keywords: ["sample", "specimen", "dummy"],
    min_text_length: 45,
    ai_instructions:
      "Validate this as a Sri Lankan NIC. Accept both old (9 digits + V/X) and new (12 digits) formats. Require clear holder identity details and reject blurred or cropped cards.",
    notes: "Prefer front-side NIC upload with full card visible.",
  },
  business_registration: {
    document_type: "business_registration",
    display_name: "Business Registration Certificate",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: [
      "certificate of registration",
      "registration number",
      "business",
      "sri lanka",
    ],
    forbidden_keywords: ["sample", "specimen", "training"],
    min_text_length: 80,
    ai_instructions:
      "Confirm this is an official Sri Lankan business registration document (ROC, provincial, or divisional authority). Check registration number, business name, and issuing authority consistency.",
    notes: "Document must match applicant legal business name.",
  },
  bank_statement: {
    document_type: "bank_statement",
    display_name: "Recent Bank Statement",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["statement", "account number", "balance", "transaction"],
    forbidden_keywords: ["sample", "dummy", "illustration"],
    min_text_length: 140,
    ai_instructions:
      "Verify this is a genuine Sri Lankan bank statement for the applicant account. Require bank identifier/header, account details, and transaction rows. Reject heavily redacted or partial screenshots.",
    notes: "Require latest 3-6 months where possible.",
  },
  utility_bill: {
    document_type: "utility_bill",
    display_name: "Utility Bill (Address Proof)",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["account number", "billing", "address", "invoice"],
    forbidden_keywords: ["sample", "specimen", "duplicate copy"],
    min_text_length: 90,
    ai_instructions:
      "Validate this as a Sri Lankan utility or telecom bill used for address proof. Require billing address and issue date. Prefer recent bill and matching applicant/business location.",
    notes: "Bill should usually be within last 3 months.",
  },
  tin_tax: {
    document_type: "tin_tax",
    display_name: "TIN / Inland Revenue Document",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["inland revenue", "tin", "tax", "sri lanka"],
    forbidden_keywords: ["sample", "specimen"],
    min_text_length: 70,
    ai_instructions:
      "Confirm this is a Sri Lankan Inland Revenue or tax registration document and extract taxpayer identity references where visible.",
    notes: "Use when tax-compliance proof is required.",
  },
  financial_statements: {
    document_type: "financial_statements",
    display_name: "Financial Statements",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: [
      "statement of financial position",
      "statement of profit",
      "financial year",
    ],
    forbidden_keywords: ["sample", "illustrative"],
    min_text_length: 180,
    ai_instructions:
      "Validate this as business financial statements (audited or management accounts). Require period coverage and core financial line items. Reject unrelated summaries without statements.",
    notes: "Prefer latest signed/audited set when available.",
  },
  form_20: {
    document_type: "form_20",
    display_name: "ROC Form 20 (Company Directors)",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["form 20", "companies act", "director", "registrar"],
    forbidden_keywords: ["sample", "specimen"],
    min_text_length: 80,
    ai_instructions:
      "Validate this as a Sri Lankan ROC Form 20 (directors). Check company identity and officer details are legible and plausible.",
    notes: "Useful for corporate ownership verification.",
  },
  form_1: {
    document_type: "form_1",
    display_name: "ROC Form 1 (Incorporation)",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["form 1", "certificate", "company", "sri lanka"],
    forbidden_keywords: ["sample", "specimen"],
    min_text_length: 80,
    ai_instructions:
      "Validate this as Sri Lankan incorporation-related ROC documentation and ensure company name/number are consistent across submitted documents.",
    notes: "Use for company incorporation verification.",
  },
  collateral_deed: {
    document_type: "collateral_deed",
    display_name: "Property Deed / Collateral Ownership",
    accepted_formats: ["pdf", "jpg", "png"],
    required_keywords: ["deed", "property", "land", "sri lanka"],
    forbidden_keywords: ["sample", "specimen"],
    min_text_length: 120,
    ai_instructions:
      "Validate this as Sri Lankan property ownership documentation used for collateral. Require owner identity or title details and reject unrelated property advertisements or valuation-only docs.",
    notes: "Use when collateral is required for the selected product.",
  },
};

function normalizePresetKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function resolveSriLankaPreset(row: RequiredDocumentDraft): SriLankaDocumentPreset | null {
  const docType = normalizePresetKey(row.document_type);
  const display = normalizePresetKey(row.display_name);
  const source = `${docType} ${display}`;

  if (!source) {
    return null;
  }

  if (source.includes("nic") || source.includes("national_identity")) return SRI_LANKA_DOCUMENT_PRESETS.nic;
  if (source.includes("business_registration") || source.includes("registration_certificate") || source.includes("br_certificate")) return SRI_LANKA_DOCUMENT_PRESETS.business_registration;
  if (source.includes("bank_statement")) return SRI_LANKA_DOCUMENT_PRESETS.bank_statement;
  if (source.includes("utility_bill") || source.includes("address_proof")) return SRI_LANKA_DOCUMENT_PRESETS.utility_bill;
  if (source.includes("tin") || source.includes("tax")) return SRI_LANKA_DOCUMENT_PRESETS.tin_tax;
  if (source.includes("financial_statement") || source.includes("financials")) return SRI_LANKA_DOCUMENT_PRESETS.financial_statements;
  if (source.includes("form_20")) return SRI_LANKA_DOCUMENT_PRESETS.form_20;
  if (source.includes("form_1")) return SRI_LANKA_DOCUMENT_PRESETS.form_1;
  if (source.includes("deed") || source.includes("collateral")) return SRI_LANKA_DOCUMENT_PRESETS.collateral_deed;

  return SRI_LANKA_DOCUMENT_PRESETS[docType] ?? null;
}

function createDefaultRequiredDocument(): RequiredDocumentDraft {
  return {
    document_type: "",
    display_name: "",
    is_required: true,
    notes: "",
    accepted_formats: ["pdf", "jpg", "png"],
    verification_required_keywords: "",
    verification_forbidden_keywords: "",
    verification_min_text_length: "",
    verification_ai_instructions: "",
  };
}

function createDefaultBenefit(): BenefitDraft {
  return {
    title: "",
    description: "",
    is_highlight: false,
  };
}

function createDefaultCollateral(): CollateralDraft {
  return {
    collateral_type: "",
    min_value_ratio: "",
    notes: "",
    is_optional: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNormalizedFormatArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["pdf", "jpg", "png"];
  }

  const formats = value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => DOCUMENT_FORMAT_OPTIONS.includes(entry as (typeof DOCUMENT_FORMAT_OPTIONS)[number]));

  return formats.length > 0 ? Array.from(new Set(formats)) : ["pdf", "jpg", "png"];
}

function parseKeywordListInput(value: string): string[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  ));
}

function toKeywordCsv(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0)
    .join(", ");
}

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
    if (!productDetailQuery.data) {
      return;
    }

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
            verification_required_keywords: toKeywordCsv(
              isRecord(doc.verification_rules_json) ? doc.verification_rules_json.required_keywords : [],
            ),
            verification_forbidden_keywords: toKeywordCsv(
              isRecord(doc.verification_rules_json) ? doc.verification_rules_json.forbidden_keywords : [],
            ),
            verification_min_text_length: isRecord(doc.verification_rules_json) && doc.verification_rules_json.min_text_length != null
              ? String(doc.verification_rules_json.min_text_length)
              : "",
            verification_ai_instructions: isRecord(doc.verification_rules_json) && doc.verification_rules_json.ai_instructions != null
              ? String(doc.verification_rules_json.ai_instructions)
              : "",
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

  const saveDocumentsMutation = useMutation({
    mutationFn: () => {
      if (requiredDocuments.length === 0) {
        throw new Error("Add at least one required document row");
      }

      const payload = requiredDocuments.map((doc, index) => {
        const documentType = doc.document_type.trim().toLowerCase();
        const displayName = doc.display_name.trim();
        const acceptedFormats = doc.accepted_formats
          .map((format) => format.trim().toLowerCase())
          .filter((format) => DOCUMENT_FORMAT_OPTIONS.includes(format as (typeof DOCUMENT_FORMAT_OPTIONS)[number]));
        const requiredKeywords = parseKeywordListInput(doc.verification_required_keywords);
        const forbiddenKeywords = parseKeywordListInput(doc.verification_forbidden_keywords);
        const aiInstructions = doc.verification_ai_instructions.trim();

        if (documentType.length < 2) {
          throw new Error(`Row ${index + 1}: Document type is required`);
        }
        if (displayName.length < 2) {
          throw new Error(`Row ${index + 1}: Display name is required`);
        }
        if (acceptedFormats.length === 0) {
          throw new Error(`Row ${index + 1}: Select at least one accepted format`);
        }

        let minTextLength: number | undefined;
        if (doc.verification_min_text_length.trim()) {
          const parsed = Number(doc.verification_min_text_length.trim());
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20000) {
            throw new Error(`Row ${index + 1}: Min OCR chars must be between 0 and 20000`);
          }
          minTextLength = Math.round(parsed);
        }

        const verificationRules: Record<string, unknown> = {};
        if (requiredKeywords.length > 0) {
          verificationRules.required_keywords = requiredKeywords;
        }
        if (forbiddenKeywords.length > 0) {
          verificationRules.forbidden_keywords = forbiddenKeywords;
        }
        if (minTextLength !== undefined) {
          verificationRules.min_text_length = minTextLength;
        }
        if (aiInstructions.length > 0) {
          verificationRules.ai_instructions = aiInstructions;
        }

        return {
          document_type: documentType,
          display_name: displayName,
          is_required: doc.is_required,
          notes: doc.notes.trim() || null,
          accepted_formats: Array.from(new Set(acceptedFormats)),
          verification_rules_json: verificationRules,
        };
      });

      return apiFetch(`/api/admin/required-documents/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ documents: payload }),
      });
    },
    onSuccess: () => {
      toast({ title: "Required documents updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save required documents",
        variant: "destructive",
      });
    },
  });

  const saveBenefitsMutation = useMutation({
    mutationFn: () => {
      if (benefits.length === 0) {
        throw new Error("Add at least one benefit row");
      }

      const payload = benefits.map((benefit, index) => {
        const title = benefit.title.trim();
        if (title.length < 2) {
          throw new Error(`Row ${index + 1}: Benefit title is required`);
        }

        return {
          title,
          description: benefit.description.trim() || null,
          is_highlight: benefit.is_highlight,
        };
      });

      return apiFetch(`/api/admin/benefits/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ benefits: payload }),
      });
    },
    onSuccess: () => {
      toast({ title: "Benefits updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save benefits",
        variant: "destructive",
      });
    },
  });

  const saveCollateralMutation = useMutation({
    mutationFn: () => {
      if (collateral.length === 0) {
        throw new Error("Add at least one collateral row");
      }

      const payload = collateral.map((entry, index) => {
        const collateralType = entry.collateral_type.trim();
        if (collateralType.length < 2) {
          throw new Error(`Row ${index + 1}: Collateral type is required`);
        }

        const minValueRatioText = entry.min_value_ratio.trim();
        let minValueRatio: number | null = null;
        if (minValueRatioText) {
          const parsed = Number(minValueRatioText);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 5) {
            throw new Error(`Row ${index + 1}: Min value ratio must be between 0 and 5`);
          }
          minValueRatio = parsed;
        }

        return {
          collateral_type: collateralType,
          min_value_ratio: minValueRatio,
          notes: entry.notes.trim() || null,
          is_optional: entry.is_optional,
        };
      });

      return apiFetch(`/api/admin/collateral/${productId}`, {
        method: "PUT",
        body: JSON.stringify({ collateral: payload }),
      });
    },
    onSuccess: () => {
      toast({ title: "Collateral updated" });
      void queryClient.invalidateQueries({ queryKey: ["loan-product-detail", productId] });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save collateral",
        variant: "destructive",
      });
    },
  });

  function updateRequiredDocument(index: number, patch: Partial<RequiredDocumentDraft>) {
    setRequiredDocuments((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRequiredDocument(index: number) {
    setRequiredDocuments((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createDefaultRequiredDocument()];
    });
  }

  function applySriLankaPresetForRow(index: number) {
    const row = requiredDocuments[index];
    if (!row) {
      return;
    }

    const preset = resolveSriLankaPreset(row);
    if (!preset) {
      toast({
        title: "Preset not found",
        description: "Set a recognizable document type first (for example: nic, bank_statement, business_registration).",
        variant: "destructive",
      });
      return;
    }

    setRequiredDocuments((prev) => prev.map((item, rowIndex) => {
      if (rowIndex !== index) {
        return item;
      }

      return {
        ...item,
        document_type: item.document_type.trim() || preset.document_type,
        display_name: item.display_name.trim() || preset.display_name,
        accepted_formats: preset.accepted_formats ?? item.accepted_formats,
        verification_required_keywords: preset.required_keywords.join(", "),
        verification_forbidden_keywords: (preset.forbidden_keywords ?? []).join(", "),
        verification_min_text_length: String(preset.min_text_length),
        verification_ai_instructions: preset.ai_instructions,
        notes: item.notes.trim() || preset.notes || "",
      };
    }));

    toast({
      title: "Sri Lanka preset applied",
      description: `Verification rules loaded for ${preset.display_name}.`,
    });
  }

  function applySriLankaPresetsForAllRows() {
    let applied = 0;

    setRequiredDocuments((prev) => prev.map((item) => {
      const preset = resolveSriLankaPreset(item);
      if (!preset) {
        return item;
      }

      applied += 1;
      return {
        ...item,
        document_type: item.document_type.trim() || preset.document_type,
        display_name: item.display_name.trim() || preset.display_name,
        accepted_formats: preset.accepted_formats ?? item.accepted_formats,
        verification_required_keywords: preset.required_keywords.join(", "),
        verification_forbidden_keywords: (preset.forbidden_keywords ?? []).join(", "),
        verification_min_text_length: String(preset.min_text_length),
        verification_ai_instructions: preset.ai_instructions,
        notes: item.notes.trim() || preset.notes || "",
      };
    }));

    if (applied === 0) {
      toast({
        title: "No matching rows",
        description: "No rows matched known Sri Lankan document keys.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sri Lanka presets applied",
      description: `Updated ${applied} row${applied === 1 ? "" : "s"} with recommended verification rules.`,
    });
  }

  function toggleDocumentFormat(index: number, format: (typeof DOCUMENT_FORMAT_OPTIONS)[number], checked: boolean) {
    setRequiredDocuments((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }

      const nextFormats = checked
        ? Array.from(new Set([...row.accepted_formats, format]))
        : row.accepted_formats.filter((item) => item !== format);

      return {
        ...row,
        accepted_formats: nextFormats,
      };
    }));
  }

  function updateBenefit(index: number, patch: Partial<BenefitDraft>) {
    setBenefits((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeBenefit(index: number) {
    setBenefits((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createDefaultBenefit()];
    });
  }

  function updateCollateral(index: number, patch: Partial<CollateralDraft>) {
    setCollateral((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeCollateral(index: number) {
    setCollateral((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [createDefaultCollateral()];
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents and Benefits"
        subtitle="Use tabular editors to maintain required documents, benefits, and collateral settings."
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

      <Tabs defaultValue="documents">
        <TabsList className="w-full flex-wrap justify-start gap-2 overflow-x-auto rounded-xl bg-muted/50 p-1">
          <TabsTrigger value="documents">Required Documents</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="collateral">Collateral</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Required Documents</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applySriLankaPresetsForAllRows}
                  disabled={!productId}
                >
                  <Sparkles className="h-4 w-4" />
                  Apply Sri Lanka Presets
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRequiredDocuments((prev) => [...prev, createDefaultRequiredDocument()])}>
                  <Plus className="h-4 w-4" />
                  Add Row
                </Button>
                <Button size="sm" onClick={() => saveDocumentsMutation.mutate()} disabled={saveDocumentsMutation.isPending || !productId}>
                  <Save className="h-4 w-4" />
                  {saveDocumentsMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden xl:block overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Document Type Key</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Accepted Formats</TableHead>
                      <TableHead>Verification Rules</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-40">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requiredDocuments.map((doc, index) => (
                      <TableRow key={`doc-${index}`}>
                        <TableCell>
                          <Input
                            value={doc.display_name}
                            onChange={(event) => updateRequiredDocument(index, { display_name: event.target.value })}
                            placeholder="National Identity Card"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={doc.document_type}
                            onChange={(event) => updateRequiredDocument(index, { document_type: event.target.value })}
                            placeholder="nic"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={doc.is_required}
                            onCheckedChange={(checked) => updateRequiredDocument(index, { is_required: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {DOCUMENT_FORMAT_OPTIONS.map((format) => (
                              <label key={format} className="inline-flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                                <Checkbox
                                  checked={doc.accepted_formats.includes(format)}
                                  onCheckedChange={(checked) => toggleDocumentFormat(index, format, checked === true)}
                                />
                                {format}
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Input
                              value={doc.verification_required_keywords}
                              onChange={(event) => updateRequiredDocument(index, { verification_required_keywords: event.target.value })}
                              placeholder="Required keywords (comma separated)"
                            />
                            <Input
                              value={doc.verification_forbidden_keywords}
                              onChange={(event) => updateRequiredDocument(index, { verification_forbidden_keywords: event.target.value })}
                              placeholder="Forbidden keywords (comma separated)"
                            />
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input
                                value={doc.verification_min_text_length}
                                onChange={(event) => updateRequiredDocument(index, { verification_min_text_length: event.target.value })}
                                placeholder="Min OCR chars"
                                inputMode="numeric"
                              />
                              <Input
                                value={doc.verification_ai_instructions}
                                onChange={(event) => updateRequiredDocument(index, { verification_ai_instructions: event.target.value })}
                                placeholder="Gemini instruction (optional)"
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={doc.notes}
                            onChange={(event) => updateRequiredDocument(index, { notes: event.target.value })}
                            placeholder="Optional note"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => applySriLankaPresetForRow(index)}>
                              <Sparkles className="h-3.5 w-3.5" />
                              Preset
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => removeRequiredDocument(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-4 p-4 xl:hidden">
                {requiredDocuments.map((doc, index) => (
                  <div
                    key={`doc-card-${index}`}
                    className="rounded-xl border border-border/70 bg-card p-4 shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="space-y-1">
                          <Label>Display Name</Label>
                          <Input
                            value={doc.display_name}
                            onChange={(event) => updateRequiredDocument(index, { display_name: event.target.value })}
                            placeholder="National Identity Card"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Document Type Key</Label>
                          <Input
                            value={doc.document_type}
                            onChange={(event) => updateRequiredDocument(index, { document_type: event.target.value })}
                            placeholder="nic"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => applySriLankaPresetForRow(index)}>
                          <Sparkles className="h-4 w-4" />
                          Preset
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeRequiredDocument(index)} aria-label="Remove row">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Required document</p>
                        <p className="text-xs text-muted-foreground">Toggle if applicant must provide it</p>
                      </div>
                      <Switch
                        checked={doc.is_required}
                        onCheckedChange={(checked) => updateRequiredDocument(index, { is_required: checked })}
                      />
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label className="text-sm font-semibold">Accepted Formats</Label>
                      <div className="flex flex-wrap gap-3">
                        {DOCUMENT_FORMAT_OPTIONS.map((format) => (
                          <label key={format} className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs font-medium uppercase text-muted-foreground">
                            <Checkbox
                              checked={doc.accepted_formats.includes(format)}
                              onCheckedChange={(checked) => toggleDocumentFormat(index, format, checked === true)}
                            />
                            {format}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Required keywords (comma separated)</Label>
                        <Input
                          value={doc.verification_required_keywords}
                          onChange={(event) => updateRequiredDocument(index, { verification_required_keywords: event.target.value })}
                          placeholder="national identity card, sri lanka"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Forbidden keywords</Label>
                        <Input
                          value={doc.verification_forbidden_keywords}
                          onChange={(event) => updateRequiredDocument(index, { verification_forbidden_keywords: event.target.value })}
                          placeholder="sample, specimen"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Min OCR chars</Label>
                        <Input
                          value={doc.verification_min_text_length}
                          onChange={(event) => updateRequiredDocument(index, { verification_min_text_length: event.target.value })}
                          placeholder="e.g. 80"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>AI verification instructions</Label>
                        <Input
                          value={doc.verification_ai_instructions}
                          onChange={(event) => updateRequiredDocument(index, { verification_ai_instructions: event.target.value })}
                          placeholder="Gemini instruction (optional)"
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-1">
                      <Label>Notes</Label>
                      <Input
                        value={doc.notes}
                        onChange={(event) => updateRequiredDocument(index, { notes: event.target.value })}
                        placeholder="Optional note for reviewers"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 text-xs text-muted-foreground">
                Use lowercase `document_type` keys (for example `nic`, `bank_statement`, `business_registration`, `utility_bill`, `tin_tax`, `financial_statements`). Apply Sri Lanka presets for strong OCR + Gemini verification defaults.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benefits">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Benefits</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setBenefits((prev) => [...prev, createDefaultBenefit()])}>
                  <Plus className="h-4 w-4" />
                  Add Row
                </Button>
                <Button size="sm" onClick={() => saveBenefitsMutation.mutate()} disabled={saveBenefitsMutation.isPending || !productId}>
                  <Save className="h-4 w-4" />
                  {saveBenefitsMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Highlight</TableHead>
                      <TableHead className="w-16">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benefits.map((benefit, index) => (
                      <TableRow key={`benefit-${index}`}>
                        <TableCell>
                          <Input
                            value={benefit.title}
                            onChange={(event) => updateBenefit(index, { title: event.target.value })}
                            placeholder="Low processing fee"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={benefit.description}
                            onChange={(event) => updateBenefit(index, { description: event.target.value })}
                            placeholder="Describe this benefit"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={benefit.is_highlight}
                            onCheckedChange={(checked) => updateBenefit(index, { is_highlight: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeBenefit(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {benefits.map((benefit, index) => (
                  <div
                    key={`benefit-card-${index}`}
                    className="rounded-xl border border-border/70 bg-card p-4 shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="space-y-1">
                          <Label>Title</Label>
                          <Input
                            value={benefit.title}
                            onChange={(event) => updateBenefit(index, { title: event.target.value })}
                            placeholder="Low processing fee"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Description</Label>
                          <Input
                            value={benefit.description}
                            onChange={(event) => updateBenefit(index, { description: event.target.value })}
                            placeholder="Describe this benefit"
                          />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeBenefit(index)} aria-label="Remove benefit">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Highlight</p>
                        <p className="text-xs text-muted-foreground">Surface this benefit in cards & promos</p>
                      </div>
                      <Switch
                        checked={benefit.is_highlight}
                        onCheckedChange={(checked) => updateBenefit(index, { is_highlight: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collateral">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Collateral Configuration</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCollateral((prev) => [...prev, createDefaultCollateral()])}>
                  <Plus className="h-4 w-4" />
                  Add Row
                </Button>
                <Button size="sm" onClick={() => saveCollateralMutation.mutate()} disabled={saveCollateralMutation.isPending || !productId}>
                  <Save className="h-4 w-4" />
                  {saveCollateralMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collateral Type</TableHead>
                    <TableHead>Min Value Ratio</TableHead>
                    <TableHead>Optional</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-16">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collateral.map((entry, index) => (
                    <TableRow key={`collateral-${index}`}>
                      <TableCell>
                        <Input
                          value={entry.collateral_type}
                          onChange={(event) => updateCollateral(index, { collateral_type: event.target.value })}
                          placeholder="Property"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          step={0.01}
                          value={entry.min_value_ratio}
                          onChange={(event) => updateCollateral(index, { min_value_ratio: event.target.value })}
                          placeholder="Optional"
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={entry.is_optional}
                          onCheckedChange={(checked) => updateCollateral(index, { is_optional: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={entry.notes}
                          onChange={(event) => updateCollateral(index, { notes: event.target.value })}
                          placeholder="Optional note"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeCollateral(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
