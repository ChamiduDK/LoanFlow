import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  Upload,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { apiFetch } from "@/lib/api/client";
import type { DocumentChecklistResponse, DocumentRow, LoanApplication } from "@/types/backend";
import { useToast } from "@/hooks/use-toast";
import EmptyState from "@/components/shared/EmptyState";

type DocStatus = "uploaded" | "missing" | "needs_review" | "verified" | "processing" | "rejected";
type ValidationStatus = "valid" | "invalid" | "unclear";

const statusConfig: Record<DocStatus, { icon: typeof CheckCircle2 }> = {
  verified: { icon: CheckCircle2 },
  uploaded: { icon: FileCheck2 },
  processing: { icon: Clock3 },
  needs_review: { icon: Clock3 },
  missing: { icon: AlertCircle },
  rejected: { icon: XCircle },
};

function normalizeStatus(value: string): DocStatus {
  const lowered = value.toLowerCase();
  if (lowered === "verified") return "verified";
  if (lowered === "uploaded") return "uploaded";
  if (lowered === "processing") return "processing";
  if (lowered === "needs_review") return "needs_review";
  if (lowered === "rejected") return "rejected";
  return "missing";
}

function normalizeValidationStatus(value: string | null | undefined): ValidationStatus {
  const lowered = String(value ?? "").trim().toLowerCase();
  if (lowered === "valid" || lowered === "invalid") {
    return lowered;
  }

  return "unclear";
}

function deriveDocStatus(workflowStatus: string | null | undefined, validationStatus: string | null | undefined): DocStatus {
  const normalizedValidation = normalizeValidationStatus(validationStatus);
  if (normalizedValidation === "valid") return "verified";
  if (normalizedValidation === "invalid") return "rejected";
  return normalizeStatus(workflowStatus ?? "");
}

export default function DocumentUpload() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const applicationIdFromUrl = searchParams.get("applicationId") ?? "";
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>("");
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
    setSelectedDocumentType("");
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

  const uploadMutation = useMutation({
    mutationFn: async ({ file, documentType }: { file: File; documentType: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      if (selectedApplication?.selected_product_id) {
        formData.append("product_id", selectedApplication.selected_product_id);
      }

      return apiFetch(`/api/applications/${applicationId}/documents/upload`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded",
        description: "Checklist was refreshed.",
      });
      void queryClient.invalidateQueries({ queryKey: ["documents", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["document-checklist", applicationId] });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload document",
        variant: "destructive",
      });
    },
  });

  const checklistRows = useMemo(() => {
    const latestUploadedByType = new Map<string, DocumentRow>();
    for (const row of documentsQuery.data ?? []) {
      const key = row.document_type.trim().toLowerCase();
      if (!latestUploadedByType.has(key)) {
        latestUploadedByType.set(key, row);
      }
    }

    const aggregated = new Map<string, {
      document_type: string;
      name: string;
      required: boolean;
      requiredCount: number;
      satisfiedRequiredCount: number;
      hasUploadedRecord: boolean;
      hasRejectedSignal: boolean;
      latestStatus: string | null;
      latestValidationStatus: string | null;
    }>();

    for (const scheme of checklistQuery.data?.by_scheme ?? []) {
      for (const item of scheme.checklist) {
        const key = item.document_type.trim().toLowerCase();
        const existing = aggregated.get(key) ?? {
          document_type: item.document_type,
          name: item.display_name,
          required: false,
          requiredCount: 0,
          satisfiedRequiredCount: 0,
          hasUploadedRecord: false,
          hasRejectedSignal: false,
          latestStatus: null,
          latestValidationStatus: null,
        };

        existing.name = existing.name || item.display_name;
        existing.required = existing.required || item.required;
        if (item.required) {
          existing.requiredCount += 1;
          if (item.uploaded) {
            existing.satisfiedRequiredCount += 1;
          }
        }
        existing.hasUploadedRecord = existing.hasUploadedRecord || Boolean(item.has_uploaded_record);
        existing.hasRejectedSignal =
          existing.hasRejectedSignal ||
          item.latest_status === "rejected" ||
          item.latest_validation_status === "invalid";
        existing.latestStatus = existing.latestStatus ?? item.latest_status ?? null;
        existing.latestValidationStatus = existing.latestValidationStatus ?? item.latest_validation_status ?? null;

        aggregated.set(key, existing);
      }
    }

    for (const row of documentsQuery.data ?? []) {
      const key = row.document_type.trim().toLowerCase();
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          document_type: row.document_type,
          name: row.document_type,
          required: false,
          requiredCount: 0,
          satisfiedRequiredCount: 0,
          hasUploadedRecord: true,
          hasRejectedSignal: row.validation_status === "invalid" || normalizeStatus(row.status) === "rejected",
          latestStatus: row.status,
          latestValidationStatus: row.validation_status ?? null,
        });
      }
    }

    return Array.from(aggregated.entries()).map(([key, item]) => {
      const latestDoc = latestUploadedByType.get(key);
      const effectiveWorkflowStatus = latestDoc?.status ?? item.latestStatus;
      const effectiveValidationStatus = latestDoc?.validation_status ?? item.latestValidationStatus;
      const requiredMissingCount = Math.max(item.requiredCount - item.satisfiedRequiredCount, 0);
      const hasUploadedRecord = item.hasUploadedRecord || Boolean(latestDoc);
      const hasRejectedSignal =
        item.hasRejectedSignal ||
        normalizeValidationStatus(effectiveValidationStatus) === "invalid" ||
        normalizeStatus(effectiveWorkflowStatus ?? "") === "rejected";

      const status = requiredMissingCount > 0
        ? (hasRejectedSignal || hasUploadedRecord ? "rejected" : "missing")
        : deriveDocStatus(effectiveWorkflowStatus, effectiveValidationStatus);

      return {
        document_type: item.document_type,
        name: item.name,
        required: item.required,
        uploaded: requiredMissingCount === 0 && (item.requiredCount > 0 ? true : hasUploadedRecord),
        status,
        fileName: latestDoc?.file_name ?? null,
        signedUrl: latestDoc?.signed_url ?? null,
      };
    });
  }, [checklistQuery.data?.by_scheme, documentsQuery.data]);

  const fallbackRequired = checklistRows.filter((d) => d.required).length;
  const fallbackMissing = checklistRows.filter((d) => d.required && (d.status === "missing" || d.status === "rejected")).length;
  const totalRequired = checklistQuery.data?.summary.total_required ?? fallbackRequired;
  const missingRequired = checklistQuery.data?.summary.total_missing ?? fallbackMissing;
  const completedRequired = Math.max(totalRequired - missingRequired, 0);
  const completeness = Math.round(
    checklistQuery.data?.summary.overall_completeness ??
    (totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 0),
  );

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Document Upload & Verification"
          subtitle="Select an application before uploading lender-required documents."
        />
        <EmptyState
          title="No applications found"
          description="Create your first application before uploading documents."
          action={<Button onClick={() => navigate("/apply")}>Create Application</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Document Upload & Verification"
        subtitle="Upload supporting documents, monitor verification status, and resolve missing requirements."
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
            <Button onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["documents", applicationId] });
              void queryClient.invalidateQueries({ queryKey: ["document-checklist", applicationId] });
            }}>
              <Upload className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Document Completeness</p>
              <p className="text-lg font-semibold text-primary">{completeness}%</p>
            </div>
            <Progress value={completeness} />
            <p className="text-xs text-muted-foreground">
              {completedRequired} of {totalRequired} required documents ready for submission.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm font-semibold text-foreground">Missing Required Documents</p>
            <p className="text-2xl font-semibold text-destructive">{missingRequired}</p>
            <p className="text-xs text-muted-foreground">
              Complete all required files to avoid underwriting delays.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="subtle-grid rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-10 text-center">
                <Upload className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-3 text-base font-semibold text-foreground">Upload document files</p>
                <p className="mt-1 text-sm text-muted-foreground">Select document type before choosing a file</p>
                <div className="mx-auto mt-4 max-w-sm space-y-3">
                  <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {checklistRows.map((doc) => (
                        <SelectItem key={doc.document_type} value={doc.document_type}>{doc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="file"
                    className="block w-full text-sm"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      if (!selectedDocumentType) {
                        toast({
                          title: "Select a document type first",
                          description: "Choose the matching requirement before uploading the file.",
                          variant: "destructive",
                        });
                        event.currentTarget.value = "";
                        return;
                      }
                      uploadMutation.mutate({ file, documentType: selectedDocumentType });
                      event.currentTarget.value = "";
                    }}
                    disabled={uploadMutation.isPending || !selectedDocumentType}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Supported: PDF, JPG, PNG up to 10MB</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Uploaded Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {checklistRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No document checklist found for this application yet.</p>
              ) : checklistRows.map((doc) => {
                const status = doc.status;
                const config = statusConfig[status];
                const Icon = config.icon;
                return (
                  <div
                    key={doc.document_type}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-border/70 p-4",
                      status === "missing" && "border-destructive/25 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted/60 p-2">
                        <Icon className={cn("h-4 w-4",
                          status === "verified" && "text-success",
                          status === "uploaded" && "text-primary",
                          (status === "needs_review" || status === "processing") && "text-warning",
                          status === "missing" && "text-destructive",
                          status === "rejected" && "text-destructive",
                        )} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.required ? "Required document" : "Optional document"}
                          {doc.fileName ? ` - ${doc.fileName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.signedUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={doc.signedUrl} target="_blank" rel="noreferrer">Preview</a>
                        </Button>
                      ) : null}
                      <StatusBadge status={status} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Alert variant={missingRequired > 0 ? "warning" : "success"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{missingRequired > 0 ? "Action Required" : "All Required Files Uploaded"}</AlertTitle>
            <AlertDescription>
              {missingRequired > 0
                ? "Required documents are still missing for one or more lender schemes."
                : "Required document set is complete and ready for review."}
            </AlertDescription>
          </Alert>

          {(checklistQuery.data?.by_scheme ?? []).map((scheme) => (
            <Card key={scheme.product_id}>
              <CardHeader>
                <CardTitle className="text-base">{scheme.bank_name ?? "Bank"} Checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={scheme.completeness_score} />
                {scheme.checklist.map((item) => (
                  <div key={`${scheme.product_id}-${item.document_type}`} className="flex items-center gap-2 text-sm">
                    {item.uploaded ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className={item.uploaded ? "text-foreground" : "text-muted-foreground"}>{item.display_name}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">System</p>
                <p className="mt-1 text-sm text-foreground">Document checks are generated directly from lender-required document definitions.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
