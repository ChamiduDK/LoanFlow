import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
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
        <TabsList>
          <TabsTrigger value="documents">Required Documents</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="collateral">Collateral</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Required Documents</CardTitle>
              <div className="flex items-center gap-2">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Document Type Key</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Accepted Formats</TableHead>
                    <TableHead>Verification Rules</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-16">Action</TableHead>
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
                        <Button variant="ghost" size="icon" onClick={() => removeRequiredDocument(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-3 text-xs text-muted-foreground">
                Use lowercase `document_type` keys (for example `nic`, `bank_statement`). Add verification keywords so OCR + Gemini can auto-validate each document.
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
