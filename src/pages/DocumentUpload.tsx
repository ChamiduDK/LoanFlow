import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  FilePlus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { apiFetch, apiUpload } from "@/lib/api/client";
import { parseDocumentAnalysis, type ParsedDocumentAnalysis } from "@/lib/document-analysis";
import type {
  DocumentChecklistResponse,
  DocumentRow,
  DocumentScanResponse,
  EvaluationResult,
  LoanApplication,
} from "@/types/backend";
import { useToast } from "@/hooks/use-toast";

type UploadDocumentResponse = {
  document: DocumentRow;
  scan_result?: DocumentScanResponse;
};

type AggregatedChecklistRow = {
  document_type: string;
  display_name: string;
  required: boolean;
  is_available: boolean;
  has_uploaded_record: boolean;
};

type DocumentAnalysisCard = {
  id: string;
  file_name: string;
  document_type: string;
  signed_url: string | null;
  analysis: ParsedDocumentAnalysis | null;
  created_at: string;
};

type UploadRequirementOption = {
  value: string;
  product_id: string;
  product_name: string;
  bank_name: string | null;
  document_type: string;
  display_name: string;
  required: boolean;
};

type SaveAvailabilityResult = {
  refreshedEvaluation: EvaluationResult | null;
  evaluationRefreshFailed: boolean;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default function DocumentUpload() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const applicationIdFromUrl = searchParams.get("applicationId") ?? "";
  const [selectedUploadDocumentType, setSelectedUploadDocumentType] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [latestScanResult, setLatestScanResult] = useState<DocumentScanResponse | null>(null);
  const [availabilityState, setAvailabilityState] = useState<Record<string, boolean>>({});

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
    staleTime: 30_000,
  });

  const fallbackApplicationId = applicationsQuery.data?.[0]?.id ?? "";
  const applicationId = applicationIdFromUrl || fallbackApplicationId;
  const selectedApplication = useMemo(
    () => (applicationsQuery.data ?? []).find((application) => application.id === applicationId) ?? null,
    [applicationId, applicationsQuery.data],
  );

  useEffect(() => {
    if (!applicationIdFromUrl && fallbackApplicationId) {
      const next = new URLSearchParams(searchParams);
      next.set("applicationId", fallbackApplicationId);
      setSearchParams(next, { replace: true });
    }
  }, [applicationIdFromUrl, fallbackApplicationId, searchParams, setSearchParams]);

  useEffect(() => {
    setSelectedUploadDocumentType("");
    setLatestScanResult(null);
  }, [applicationId]);

  const documentsQuery = useQuery({
    queryKey: ["documents", applicationId],
    queryFn: () => apiFetch<DocumentRow[]>(`/api/applications/${applicationId}/documents`),
    enabled: Boolean(applicationId),
  });

  const checklistQuery = useQuery({
    queryKey: ["document-checklist", applicationId],
    queryFn: () => apiFetch<DocumentChecklistResponse>(`/api/applications/${applicationId}/documents/check`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
    enabled: Boolean(applicationId),
  });

  const checklistRows = useMemo<AggregatedChecklistRow[]>(() => {
    const aggregated = new Map<string, AggregatedChecklistRow>();

    for (const scheme of checklistQuery.data?.by_scheme ?? []) {
      for (const item of scheme.checklist) {
        const key = item.document_type.trim().toLowerCase();
        if (!key) {
          continue;
        }

        const existing = aggregated.get(key);
        if (existing) {
          existing.required = existing.required || item.required;
          existing.is_available = existing.is_available || item.is_available === true;
          existing.has_uploaded_record = existing.has_uploaded_record || item.has_uploaded_record === true;
          continue;
        }

        aggregated.set(key, {
          document_type: item.document_type,
          display_name: item.display_name,
          required: item.required,
          is_available: item.is_available === true,
          has_uploaded_record: item.has_uploaded_record === true,
        });
      }
    }

    return Array.from(aggregated.values()).sort((left, right) => {
      if (left.required !== right.required) {
        return left.required ? -1 : 1;
      }
      return left.display_name.localeCompare(right.display_name);
    });
  }, [checklistQuery.data?.by_scheme]);

  useEffect(() => {
    if (checklistRows.length === 0) {
      return;
    }

    setAvailabilityState(
      Object.fromEntries(
        checklistRows.map((row) => [row.document_type, row.is_available]),
      ),
    );
  }, [checklistRows]);

  const uploadTargets = useMemo<UploadRequirementOption[]>(() => {
    const options: UploadRequirementOption[] = [];
    const seen = new Set<string>();
    const selectedProductId = selectedApplication?.selected_product_id ?? "";

    for (const scheme of checklistQuery.data?.by_scheme ?? []) {
      for (const item of scheme.checklist) {
        const normalizedType = item.document_type.trim().toLowerCase();
        if (!normalizedType) {
          continue;
        }

        const value = `${scheme.product_id}::${normalizedType}`;
        if (seen.has(value)) {
          continue;
        }

        seen.add(value);
        options.push({
          value,
          product_id: scheme.product_id,
          product_name: scheme.product_name,
          bank_name: scheme.bank_name,
          document_type: item.document_type,
          display_name: item.display_name,
          required: item.required,
        });
      }
    }

    return options.sort((left, right) => {
      const leftSelected = left.product_id === selectedProductId;
      const rightSelected = right.product_id === selectedProductId;
      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }

      if (left.required !== right.required) {
        return left.required ? -1 : 1;
      }

      const leftSchemeLabel = `${left.bank_name ?? "Bank"} - ${left.product_name}`;
      const rightSchemeLabel = `${right.bank_name ?? "Bank"} - ${right.product_name}`;
      return leftSchemeLabel.localeCompare(rightSchemeLabel) || left.display_name.localeCompare(right.display_name);
    });
  }, [checklistQuery.data?.by_scheme, selectedApplication?.selected_product_id]);

  const selectedUploadTarget = useMemo(() => {
    const normalizedSelectedType = selectedUploadDocumentType.trim().toLowerCase();
    if (!normalizedSelectedType) {
      return null;
    }

    return uploadTargets.find(
      (option) => option.document_type.trim().toLowerCase() === normalizedSelectedType,
    ) ?? null;
  }, [selectedUploadDocumentType, uploadTargets]);

  const selectedUploadMatchesMultipleSchemes = useMemo(() => {
    if (!selectedUploadTarget) {
      return false;
    }

    const normalizedSelectedType = selectedUploadTarget.document_type.trim().toLowerCase();
    return uploadTargets.filter(
      (option) => option.document_type.trim().toLowerCase() === normalizedSelectedType,
    ).length > 1;
  }, [selectedUploadTarget, uploadTargets]);

  const shouldRefreshRecommendations = useMemo(() => {
    const status = selectedApplication?.status ?? "draft";
    return Boolean(selectedApplication?.selected_product_id) || [
      "evaluated",
      "applied",
      "under_review",
      "approved",
      "rejected",
    ].includes(status);
  }, [selectedApplication?.selected_product_id, selectedApplication?.status]);

  const uploadDocumentOptions = useMemo(
    () => checklistRows.map((row) => ({
      value: row.document_type,
      label: row.display_name,
    })),
    [checklistRows],
  );

  useEffect(() => {
    if (!selectedUploadDocumentType) {
      return;
    }

    if (!uploadTargets.some((option) => option.document_type.trim().toLowerCase() === selectedUploadDocumentType.trim().toLowerCase())) {
      setSelectedUploadDocumentType("");
    }
  }, [selectedUploadDocumentType, uploadTargets]);

  const saveAvailabilityMutation = useMutation({
    mutationFn: async (): Promise<SaveAvailabilityResult> => {
      await apiFetch(`/api/applications/${applicationId}/documents/availability`, {
        method: "POST",
        body: JSON.stringify({
          availabilities: checklistRows.map((row) => ({
            document_type: row.document_type,
            is_available: availabilityState[row.document_type] === true,
          })),
        }),
      });

      if (!shouldRefreshRecommendations) {
        return {
          refreshedEvaluation: null,
          evaluationRefreshFailed: false,
        };
      }

      try {
        const refreshedEvaluation = await apiFetch<EvaluationResult>(`/api/applications/${applicationId}/evaluate`, {
          method: "POST",
          body: JSON.stringify({}),
        });

        return {
          refreshedEvaluation,
          evaluationRefreshFailed: false,
        };
      } catch {
        return {
          refreshedEvaluation: null,
          evaluationRefreshFailed: true,
        };
      }
    },
    onSuccess: (result) => {
      if (result.refreshedEvaluation) {
        queryClient.setQueryData(["application-evaluation", applicationId], result.refreshedEvaluation);
      }

      toast({
        title: "Document availability saved",
        description: result.refreshedEvaluation
          ? "Loan recommendations were refreshed with your latest document readiness."
          : result.evaluationRefreshFailed
            ? "Availability was saved, but recommendations could not be refreshed automatically. Re-run evaluation from Loan Recommendations."
            : "Document readiness was saved. Re-run evaluation when you want refreshed lender recommendations.",
      });
      void queryClient.invalidateQueries({ queryKey: ["document-checklist", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["application-evaluation", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-page", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-re-evaluation", applicationId] });
    },
    onError: (error) => {
      toast({
        title: "Could not save availability",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, requirement }: { file: File; requirement: UploadRequirementOption }) => {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File size exceeds 10MB. Please upload a smaller file.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", requirement.document_type);
      formData.append("product_id", requirement.product_id);

      setUploadProgress(0);
      return apiUpload<UploadDocumentResponse>(
        `/api/applications/${applicationId}/documents/upload`,
        formData,
        (progress) => setUploadProgress(progress),
      );
    },
    onSuccess: (payload) => {
      setUploadProgress(0);
      setLatestScanResult(payload.scan_result ?? null);
      toast({
        title: "Document uploaded",
        description: "AI analysis is ready. This is guidance only and does not change prediction.",
      });
      void queryClient.invalidateQueries({ queryKey: ["documents", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["document-checklist", applicationId] });
    },
    onError: (error) => {
      setUploadProgress(0);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload document.",
        variant: "destructive",
      });
    },
  });

  const requiredRows = checklistRows.filter((row) => row.required);
  const selectedAvailableCount = requiredRows.filter((row) => availabilityState[row.document_type] === true).length;
  const readinessScore = requiredRows.length === 0
    ? 0
    : Math.round((selectedAvailableCount / requiredRows.length) * 100);
  const remainingRequired = Math.max(requiredRows.length - selectedAvailableCount, 0);

  const analysisCards = useMemo<DocumentAnalysisCard[]>(() => {
    const latestDocumentsByType = new Map<string, DocumentRow>();
    for (const row of documentsQuery.data ?? []) {
      const key = row.document_type.trim().toLowerCase();
      if (!key || latestDocumentsByType.has(key)) {
        continue;
      }
      latestDocumentsByType.set(key, row);
    }

    return Array.from(latestDocumentsByType.values()).map((row) => ({
      id: row.id,
      file_name: row.file_name,
      document_type: row.document_type,
      signed_url: row.signed_url,
      analysis: parseDocumentAnalysis(toRecord(row.extracted_json).ai_document_analysis),
      created_at: row.created_at,
    }));
  }, [documentsQuery.data]);

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Documents & Optional Verification"
          subtitle="Select an application before reviewing document readiness."
        />
        <EmptyState
          title="No applications found"
          description="Create your first application before managing document readiness."
          action={<Button onClick={() => navigate("/apply")}>Create Application</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Documents & Optional Verification"
        subtitle="Mark the documents you already have, then upload files only if you want AI guidance against bank requirements."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={applicationId}
              onValueChange={(value) => {
                const next = new URLSearchParams(searchParams);
                next.set("applicationId", value);
                setSearchParams(next);
              }}
            >
              <SelectTrigger className="min-w-[220px]">
                <SelectValue placeholder="Select application" />
              </SelectTrigger>
              <SelectContent>
                {(applicationsQuery.data ?? []).map((application) => (
                  <SelectItem key={application.id} value={application.id}>
                    {application.id.slice(0, 8)} - {application.purpose}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["documents", applicationId] });
                void queryClient.invalidateQueries({ queryKey: ["document-checklist", applicationId] });
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        )}
      />

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Guidance only</AlertTitle>
        <AlertDescription>
          Document availability improves prediction accuracy. Uploaded files are optional and AI analysis does not change eligibility scoring.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold text-foreground">Document Readiness</p>
            <p className="text-3xl font-semibold text-primary">{readinessScore}%</p>
            <Progress value={readinessScore} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold text-foreground">Preferred Docs Ready</p>
            <p className="text-3xl font-semibold text-foreground">{selectedAvailableCount}</p>
            <p className="text-xs text-muted-foreground">{requiredRows.length} preferred document(s) for the current bank list.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold text-foreground">Still Missing</p>
            <p className="text-3xl font-semibold text-foreground">{remainingRequired}</p>
            <p className="text-xs text-muted-foreground">Missing items reduce prediction confidence, but uploads are still optional.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Step 1 - Document Availability</CardTitle>
            <p className="text-sm text-muted-foreground">Select what you already have. No files are required here.</p>
          </div>
          <Button
            onClick={() => saveAvailabilityMutation.mutate()}
            disabled={saveAvailabilityMutation.isPending || checklistRows.length === 0}
          >
            {saveAvailabilityMutation.isPending ? "Saving..." : "Save Availability"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {checklistRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bank document requirements are available yet for this application.</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {checklistRows.map((row) => (
                  <label
                    key={row.document_type}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
                  >
                    <Checkbox
                      checked={availabilityState[row.document_type] === true}
                      onCheckedChange={(checked) =>
                        setAvailabilityState((current) => ({
                          ...current,
                          [row.document_type]: checked === true,
                        }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.display_name}</p>
                        <Badge variant={row.required ? "default" : "secondary"}>
                          {row.required ? "Preferred" : "Optional"}
                        </Badge>
                        {row.has_uploaded_record ? <Badge variant="outline">Uploaded</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{row.document_type}</p>
                    </div>
                  </label>
                ))}
              </div>

              {(checklistQuery.data?.by_scheme ?? []).length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {(checklistQuery.data?.by_scheme ?? []).map((scheme) => (
                    <div key={scheme.product_id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm font-semibold text-foreground">{scheme.bank_name ?? "Bank"} - {scheme.product_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Preferred documents: {scheme.checklist.filter((item) => item.required).length} | Ready: {scheme.checklist.filter((item) => item.is_available).length}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 - Optional Document Verification</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a file only if you want Gemini AI to compare it with the bank requirement and summarize what it contains.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">Upload for AI analysis</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the document you want to upload. We will compare it against the best matching bank requirement automatically.
              </p>
              <div className="mt-4 grid gap-3">
                <Select value={selectedUploadDocumentType} onValueChange={setSelectedUploadDocumentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose document to upload" />
                  </SelectTrigger>
                  <SelectContent>
                    {uploadDocumentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUploadTarget ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      Comparing against {(selectedUploadTarget.bank_name ?? "Bank")} - {selectedUploadTarget.product_name}.
                    </p>
                    {selectedUploadMatchesMultipleSchemes ? (
                      <p>The current selected product is used first when more than one bank asks for the same document.</p>
                    ) : null}
                  </div>
                ) : null}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    if (!selectedUploadTarget) {
                      toast({
                        title: "Select a document first",
                        description: "Choose which document you are uploading before selecting the file.",
                        variant: "destructive",
                      });
                      event.currentTarget.value = "";
                      return;
                    }
                    uploadMutation.mutate({ file, requirement: selectedUploadTarget });
                    event.currentTarget.value = "";
                  }}
                />
                {uploadMutation.isPending ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Uploading and analyzing</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-1" />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Latest AI run</p>
              {latestScanResult ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-muted-foreground">{latestScanResult.summary.total_documents} uploaded document(s) analyzed.</p>
                  <p className="text-muted-foreground">Informational summaries are ready below.</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No new analysis in this session yet.</p>
              )}
            </div>
          </div>

          {analysisCards.length === 0 ? (
            <EmptyState
              title="No uploaded documents yet"
              description="If you want optional AI guidance, upload a document and review the analysis here."
              action={(
                <Button variant="outline" disabled>
                  <FilePlus className="h-4 w-4" />
                  Waiting for upload
                </Button>
              )}
            />
          ) : (
            <div className="grid gap-4">
              {analysisCards.map((card) => (
                <div key={card.id} className="rounded-xl border border-border/70 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{card.file_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {card.analysis?.document_type ?? card.document_type} | Uploaded {new Date(card.created_at).toLocaleDateString("en-LK")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Guidance Only</Badge>
                      {card.signed_url ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={card.signed_url} target="_blank" rel="noreferrer">
                            <Upload className="h-4 w-4" />
                            View File
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {card.analysis ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 lg:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
                        <p className="mt-2 text-sm text-foreground">{card.analysis.summary}</p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Eligibility Hint</p>
                        <p className="mt-2 text-sm text-muted-foreground">{card.analysis.eligibility_hint}</p>
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extracted Information</p>
                          <div className="mt-2 space-y-2">
                            {card.analysis.extracted_information.length > 0 ? (
                              card.analysis.extracted_information.map((item) => (
                                <div key={`${card.id}-${item.label}`} className="text-sm">
                                  <span className="font-medium text-foreground">{item.label}:</span>{" "}
                                  <span className="text-muted-foreground">{item.value}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No structured details were extracted.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement Match</p>
                          <div className="mt-2 space-y-2">
                            {card.analysis.requirement_match.map((item, index) => (
                              <div key={`${card.id}-${index}`} className="flex items-start gap-2 text-sm">
                                {item.status === "match" ? (
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                                ) : (
                                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                                )}
                                <span className="text-muted-foreground">{item.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">AI analysis is not available for this file yet.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
