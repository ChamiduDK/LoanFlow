import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileText,
  Gift,
  Info,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
    required_keywords: ["national identity card", "identity card", "sri lanka", "name"],
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
    required_keywords: ["certificate of registration", "registration number", "business", "sri lanka"],
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
    required_keywords: ["statement of financial position", "statement of profit", "financial year"],
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

  if (!source) return null;
  if (source.includes("nic") || source.includes("national_identity")) return SRI_LANKA_DOCUMENT_PRESETS.nic;
  if (source.includes("business_registration") || source.includes("registration_certificate")) return SRI_LANKA_DOCUMENT_PRESETS.business_registration;
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
  return { title: "", description: "", is_highlight: false };
}

function createDefaultCollateral(): CollateralDraft {
  return { collateral_type: "", min_value_ratio: "", notes: "", is_optional: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNormalizedFormatArray(value: unknown): string[] {
  if (!Array.isArray(value)) return ["pdf", "jpg", "png"];
  const formats = value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => DOCUMENT_FORMAT_OPTIONS.includes(entry as (typeof DOCUMENT_FORMAT_OPTIONS)[number]));
  return formats.length > 0 ? Array.from(new Set(formats)) : ["pdf", "jpg", "png"];
}

function parseKeywordListInput(value: string): string[] {
  return Array.from(new Set(
    value.split(",").map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0),
  ));
}

function toKeywordCsv(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0).join(", ");
}

// ─── Document Accordion Card ─────────────────────────────────────────────────
type DocCardProps = {
  doc: RequiredDocumentDraft;
  index: number;
  onUpdate: (patch: Partial<RequiredDocumentDraft>) => void;
  onRemove: () => void;
  onPreset: () => void;
};

function DocumentCard({ doc, index, onUpdate, onRemove, onPreset }: DocCardProps) {
  const [expanded, setExpanded] = useState(index === 0);

  const hasName = doc.display_name.trim().length > 0 || doc.document_type.trim().length > 0;
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
          <Button variant="outline" size="sm" onClick={onPreset} className="h-7 gap-1 px-2 text-xs">
            <Sparkles className="h-3 w-3" />
            Preset
          </Button>
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
          {/* Basic info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display Name</Label>
              <Input
                value={doc.display_name}
                onChange={(e) => onUpdate({ display_name: e.target.value })}
                placeholder="e.g. National Identity Card"
              />
              <p className="text-[11px] text-muted-foreground">Shown to the applicant</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document Type Key</Label>
              <Input
                value={doc.document_type}
                onChange={(e) => onUpdate({ document_type: e.target.value })}
                placeholder="e.g. nic"
              />
              <p className="text-[11px] text-muted-foreground">Lowercase key used internally (e.g. nic, bank_statement)</p>
            </div>
          </div>

          {/* Required toggle + formats */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Mandatory Upload</p>
                <p className="text-xs text-muted-foreground">Applicant must provide this document</p>
              </div>
              <Switch
                checked={doc.is_required}
                onCheckedChange={(checked) => onUpdate({ is_required: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accepted File Formats</Label>
              <div className="flex flex-wrap gap-2">
                {DOCUMENT_FORMAT_OPTIONS.map((format) => (
                  <label key={format} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-medium uppercase hover:bg-muted/40 transition-colors">
                    <Checkbox
                      checked={doc.accepted_formats.includes(format)}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? Array.from(new Set([...doc.accepted_formats, format]))
                          : doc.accepted_formats.filter((f) => f !== format);
                        onUpdate({ accepted_formats: next });
                      }}
                    />
                    {format}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Verification rules */}
          <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">AI Verification Rules</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Required Keywords <span className="font-normal">(comma separated)</span></Label>
                <Input
                  value={doc.verification_required_keywords}
                  onChange={(e) => onUpdate({ verification_required_keywords: e.target.value })}
                  placeholder="e.g. national identity card, sri lanka"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Forbidden Keywords <span className="font-normal">(comma separated)</span></Label>
                <Input
                  value={doc.verification_forbidden_keywords}
                  onChange={(e) => onUpdate({ verification_forbidden_keywords: e.target.value })}
                  placeholder="e.g. sample, specimen"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Min OCR Characters</Label>
                <Input
                  value={doc.verification_min_text_length}
                  onChange={(e) => onUpdate({ verification_min_text_length: e.target.value })}
                  placeholder="e.g. 80"
                  inputMode="numeric"
                  className="bg-background"
                />
                <p className="text-[11px] text-muted-foreground">Minimum extracted text length to pass OCR check</p>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs text-muted-foreground">AI Instructions <span className="font-normal">(optional)</span></Label>
                <Textarea
                  value={doc.verification_ai_instructions}
                  onChange={(e) => onUpdate({ verification_ai_instructions: e.target.value })}
                  placeholder="Custom Gemini verification instruction..."
                  className="min-h-[70px] resize-none bg-background text-xs"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer Notes <span className="font-normal normal-case">(optional)</span></Label>
            <Input
              value={doc.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="e.g. Prefer front-side NIC upload with full card visible"
            />
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
  onUpdate: (patch: Partial<BenefitDraft>) => void;
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
  onUpdate: (patch: Partial<CollateralDraft>) => void;
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
            verification_required_keywords: toKeywordCsv(
              isRecord(doc.verification_rules_json) ? doc.verification_rules_json.required_keywords : [],
            ),
            verification_forbidden_keywords: toKeywordCsv(
              isRecord(doc.verification_rules_json) ? doc.verification_rules_json.forbidden_keywords : [],
            ),
            verification_min_text_length:
              isRecord(doc.verification_rules_json) && doc.verification_rules_json.min_text_length != null
                ? String(doc.verification_rules_json.min_text_length)
                : "",
            verification_ai_instructions:
              isRecord(doc.verification_rules_json) && doc.verification_rules_json.ai_instructions != null
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

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveDocumentsMutation = useMutation({
    mutationFn: () => {
      if (requiredDocuments.length === 0) throw new Error("Add at least one required document row");
      const payload = requiredDocuments.map((doc, index) => {
        const documentType = doc.document_type.trim().toLowerCase();
        const displayName = doc.display_name.trim();
        const acceptedFormats = doc.accepted_formats
          .map((f) => f.trim().toLowerCase())
          .filter((f) => DOCUMENT_FORMAT_OPTIONS.includes(f as (typeof DOCUMENT_FORMAT_OPTIONS)[number]));
        if (documentType.length < 2) throw new Error(`Document ${index + 1}: Type key is required`);
        if (displayName.length < 2) throw new Error(`Document ${index + 1}: Display name is required`);
        if (acceptedFormats.length === 0) throw new Error(`Document ${index + 1}: Select at least one format`);

        const requiredKeywords = parseKeywordListInput(doc.verification_required_keywords);
        const forbiddenKeywords = parseKeywordListInput(doc.verification_forbidden_keywords);
        const aiInstructions = doc.verification_ai_instructions.trim();
        let minTextLength: number | undefined;
        if (doc.verification_min_text_length.trim()) {
          const parsed = Number(doc.verification_min_text_length.trim());
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20000)
            throw new Error(`Document ${index + 1}: Min OCR chars must be 0–20000`);
          minTextLength = Math.round(parsed);
        }

        const verificationRules: Record<string, unknown> = {};
        if (requiredKeywords.length > 0) verificationRules.required_keywords = requiredKeywords;
        if (forbiddenKeywords.length > 0) verificationRules.forbidden_keywords = forbiddenKeywords;
        if (minTextLength !== undefined) verificationRules.min_text_length = minTextLength;
        if (aiInstructions.length > 0) verificationRules.ai_instructions = aiInstructions;

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
  function applySriLankaPresetForRow(index: number) {
    const row = requiredDocuments[index];
    if (!row) return;
    const preset = resolveSriLankaPreset(row);
    if (!preset) {
      toast({ title: "Preset not found", description: "Set a recognizable document type first (e.g. nic, bank_statement).", variant: "destructive" });
      return;
    }
    setRequiredDocuments((prev) =>
      prev.map((item, i) =>
        i !== index ? item : {
          ...item,
          document_type: item.document_type.trim() || preset.document_type,
          display_name: item.display_name.trim() || preset.display_name,
          accepted_formats: preset.accepted_formats ?? item.accepted_formats,
          verification_required_keywords: preset.required_keywords.join(", "),
          verification_forbidden_keywords: (preset.forbidden_keywords ?? []).join(", "),
          verification_min_text_length: String(preset.min_text_length),
          verification_ai_instructions: preset.ai_instructions,
          notes: item.notes.trim() || preset.notes || "",
        },
      ),
    );
    toast({ title: "Preset applied", description: `Loaded verification rules for ${preset.display_name}.` });
  }
  function applySriLankaPresetsForAllRows() {
    let applied = 0;
    setRequiredDocuments((prev) =>
      prev.map((item) => {
        const preset = resolveSriLankaPreset(item);
        if (!preset) return item;
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
      }),
    );
    if (applied === 0) {
      toast({ title: "No matching rows", description: "No rows matched known Sri Lankan document keys.", variant: "destructive" });
      return;
    }
    toast({ title: "Presets applied", description: `Updated ${applied} row${applied === 1 ? "" : "s"} with recommended rules.` });
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
        subtitle="Manage required documents, loan perks, and collateral requirements for each loan product."
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
    <FileCheck2 className="h-4 w-4" />
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
                    Define what documents applicants must upload. Use Sri Lanka presets to auto-fill AI verification rules.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={applySriLankaPresetsForAllRows} disabled={!productId}>
                    <Sparkles className="h-4 w-4" />
                    Apply All Presets
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
              {requiredDocuments.map((doc, index) => (
                <DocumentCard
                  key={`doc-${index}`}
                  doc={doc}
                  index={index}
                  onUpdate={(patch) => updateRequiredDocument(index, patch)}
                  onRemove={() => removeRequiredDocument(index)}
                  onPreset={() => applySriLankaPresetForRow(index)}
                />
              ))}
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Use lowercase document type keys: <code className="mx-1 rounded bg-muted px-1">nic</code>
                <code className="mr-1 rounded bg-muted px-1">bank_statement</code>
                <code className="mr-1 rounded bg-muted px-1">business_registration</code>
                <code className="rounded bg-muted px-1">utility_bill</code>
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
