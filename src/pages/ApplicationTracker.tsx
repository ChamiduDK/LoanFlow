
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Circle, Clock3, FileSearch, Mail, Pencil, Printer, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { apiFetch } from "@/lib/api/client";
import type {
  DocumentRow,
  DocumentScanResponse,
  LoanApplication,
  LoanManagementAccessResponse,
  LoanProposal,
  ProposalGenerateResponse,
  TrackerReEvaluationResponse,
  TrackerSummary,
} from "@/types/backend";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLKR } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";
import ProposalEditor, { fieldsFromProposalData } from "@/components/tracker/ProposalEditor";
import type { ProposalFields } from "@/components/tracker/ProposalEditor";

type OutcomeStatus = "applied" | "under_review" | "approved" | "rejected";

type OutcomeRecord = {
  id: string;
  status: OutcomeStatus;
  applied_date: string | null;
  decision_date: string | null;
  approved_amount: number | null;
  approved_rate: number | null;
  approved_tenure_months: number | null;
  notes: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toStepStatus(current: number, step: number): "done" | "current" | "pending" {
  if (step < current) return "done";
  if (step === current) return "current";
  return "pending";
}

function toNumberOrNull(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toText(value: unknown, fallback = "-"): string {
  if (value == null) return fallback;
  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : fallback;
}

export default function ApplicationTracker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const applicationIdFromUrl = searchParams.get("applicationId") ?? "";
  const [latestScanResult, setLatestScanResult] = useState<DocumentScanResponse | null>(null);
  const [outcomeForm, setOutcomeForm] = useState({
    status: "under_review" as OutcomeStatus,
    notes: "",
    approved_amount: "",
    approved_rate: "",
    approved_tenure_months: "",
  });
  // Proposal editor state
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<ProposalFields | null>(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: () => apiFetch<LoanApplication[]>("/api/applications"),
    staleTime: 30_000,
  });
  const fallbackApplicationId = applicationsQuery.data?.[0]?.id ?? "";
  const applicationId = applicationIdFromUrl || fallbackApplicationId;

  useEffect(() => {
    if (!applicationIdFromUrl && fallbackApplicationId) {
      const next = new URLSearchParams(searchParams);
      next.set("applicationId", fallbackApplicationId);
      setSearchParams(next, { replace: true });
    }
  }, [applicationIdFromUrl, fallbackApplicationId, searchParams, setSearchParams]);

  useEffect(() => {
    setLatestScanResult(null);
  }, [applicationId]);

  const dataQuery = useQuery({
    queryKey: ["tracker-page", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const [application, outcome, documents, tracker] = await Promise.all([
        apiFetch<LoanApplication>(`/api/applications/${applicationId}`),
        apiFetch<OutcomeRecord | null>(`/api/applications/${applicationId}/outcome`),
        apiFetch<DocumentRow[]>(`/api/applications/${applicationId}/documents`),
        apiFetch<TrackerSummary>(`/api/applications/${applicationId}/tracker`),
      ]);

      return { application, outcome, documents, tracker };
    },
  });

  const selectedProductId = dataQuery.data?.application.selected_product_id ?? null;
  const isApprovedState = (dataQuery.data?.outcome?.status ?? dataQuery.data?.application.status) === "approved";

  const reEvaluationQuery = useQuery({
    queryKey: ["tracker-re-evaluation", applicationId, selectedProductId],
    enabled: Boolean(applicationId && selectedProductId),
    queryFn: () =>
      apiFetch<TrackerReEvaluationResponse>(`/api/applications/${applicationId}/tracker/re-evaluate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const proposalQuery = useQuery({
    queryKey: ["loan-proposal", applicationId],
    enabled: Boolean(applicationId),
    queryFn: () => apiFetch<LoanProposal | null>(`/api/applications/${applicationId}/proposal`),
    staleTime: 30_000,
  });

  const loanManagementQuery = useQuery({
    queryKey: ["loan-management", applicationId],
    enabled: Boolean(applicationId && isApprovedState),
    queryFn: () => apiFetch<LoanManagementAccessResponse>(`/api/applications/${applicationId}/loan-management`),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    const outcome = dataQuery.data?.outcome;
    if (!outcome) {
      setOutcomeForm({
        status: "under_review",
        notes: "",
        approved_amount: "",
        approved_rate: "",
        approved_tenure_months: "",
      });
      return;
    }

    setOutcomeForm({
      status: outcome.status,
      notes: outcome.notes ?? "",
      approved_amount: outcome.approved_amount != null ? String(outcome.approved_amount) : "",
      approved_rate: outcome.approved_rate != null ? String(outcome.approved_rate) : "",
      approved_tenure_months: outcome.approved_tenure_months != null ? String(outcome.approved_tenure_months) : "",
    });
  }, [dataQuery.data?.outcome]);

  const outcomeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/applications/${applicationId}/outcome`, {
        method: "POST",
        body: JSON.stringify({
          status: outcomeForm.status,
          notes: outcomeForm.notes.trim() || null,
          approved_amount: outcomeForm.status === "approved" ? toNumberOrNull(outcomeForm.approved_amount) : null,
          approved_rate: outcomeForm.status === "approved" ? toNumberOrNull(outcomeForm.approved_rate) : null,
          approved_tenure_months: outcomeForm.status === "approved"
            ? toNumberOrNull(outcomeForm.approved_tenure_months)
            : null,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Outcome status updated" });
      void queryClient.invalidateQueries({ queryKey: ["tracker-page", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["loan-management", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-re-evaluation", applicationId, selectedProductId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update outcome",
        description: error instanceof Error ? error.message : "Could not update outcome",
        variant: "destructive",
      });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      apiFetch<DocumentScanResponse>(`/api/applications/${applicationId}/documents/scan`, {
        method: "POST",
        body: JSON.stringify({
          product_id: selectedProductId ?? undefined,
          force_rescan: true,
        }),
      }),
    onSuccess: (payload) => {
      setLatestScanResult(payload);
      toast({ title: "Document scan complete", description: `${payload.summary.total_documents} document(s) checked.` });
      void queryClient.invalidateQueries({ queryKey: ["tracker-page", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["tracker-re-evaluation", applicationId, selectedProductId] });
    },
    onError: (error) => {
      toast({
        title: "Document scan failed",
        description: error instanceof Error ? error.message : "Could not scan documents",
        variant: "destructive",
      });
    },
  });

  const generateProposalMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProposalGenerateResponse>(`/api/applications/${applicationId}/proposal/generate`, {
        method: "POST",
        body: JSON.stringify({
          product_id: selectedProductId ?? undefined,
        }),
      }),
    onSuccess: (payload) => {
      toast({ title: "Loan proposal generated", description: `Version ${payload.proposal.proposal_version} is ready.` });
      queryClient.setQueryData(["loan-proposal", applicationId], payload.proposal);
    },
    onError: (error) => {
      toast({
        title: "Proposal generation failed",
        description: error instanceof Error ? error.message : "Could not generate proposal",
        variant: "destructive",
      });
    },
  });

  const timelineSteps = useMemo(() => {
    const status = dataQuery.data?.application.status ?? "draft";
    const index = (() => {
      if (status === "draft") return 0;
      if (["submitted", "evaluated", "applied"].includes(status)) return 1;
      if (status === "under_review") return 2;
      if (["approved", "rejected"].includes(status)) return 3;
      return 0;
    })();

    return [
      { label: "Draft Created", date: formatDate(dataQuery.data?.application.created_at ?? null), status: toStepStatus(index, 0) },
      { label: "Application Submitted", date: formatDate(dataQuery.data?.application.updated_at ?? null), status: toStepStatus(index, 1) },
      { label: "Under Review", date: status === "under_review" || status === "approved" || status === "rejected" ? formatDate(dataQuery.data?.application.updated_at ?? null) : "Pending", status: toStepStatus(index, 2) },
      { label: "Approved / Rejected", date: ["approved", "rejected"].includes(status) ? formatDate(dataQuery.data?.application.updated_at ?? null) : "Pending", status: toStepStatus(index, 3) },
    ];
  }, [dataQuery.data?.application.created_at, dataQuery.data?.application.status, dataQuery.data?.application.updated_at]);

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Monitor every stage of your application from recommendation to final approval." />
        <EmptyState title="No applications found" description="Create your first application to start tracking." action={<Button onClick={() => navigate("/apply")}>Create Application</Button>} />
      </div>
    );
  }

  if (dataQuery.isLoading) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Loading tracker data..." />
        <Card><CardContent className="space-y-4 p-6"><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (dataQuery.isError || !dataQuery.data) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Monitor every stage of your application from recommendation to final approval." />
        <EmptyState title="Failed to load tracker" description="There was an error loading this application's tracker data. Please try again." action={<Button onClick={() => void dataQuery.refetch()}>Retry</Button>} />
      </div>
    );
  }

  const { application, documents } = dataQuery.data;
  const reEvaluation = reEvaluationQuery.data;
  const proposal = proposalQuery.data;
  const proposalData = toRecord(proposal?.proposal_data_json);
  const proposalApplicant = toRecord(proposalData.applicant);
  const proposalBusiness = toRecord(proposalData.business);
  const proposalRequest = toRecord(proposalData.request);
  const proposalBank = toRecord(proposalData.selected_bank);
  const proposalRepayment = toRecord(proposalData.repayment);
  const proposalVerification = toRecord(proposalData.verification);
  const proposalEmailDraft = toRecord(proposalData.email_draft);
  const scannedDocuments = latestScanResult?.documents ?? [];
  const documentRows = documents.map((doc) => ({
    id: doc.id,
    file_name: doc.file_name,
    document_type: doc.document_type,
    validation_status: doc.validation_status ?? "unclear",
    detected_doc_type: doc.detected_doc_type ?? null,
    ocr_preview: doc.ocr_preview ?? null,
  }));

  const documentSummary = latestScanResult?.summary ?? {
    total_documents: documentRows.length,
    valid_count: documentRows.filter((doc) => doc.validation_status === "valid").length,
    invalid_count: documentRows.filter((doc) => doc.validation_status === "invalid").length,
    unclear_count: documentRows.filter((doc) => doc.validation_status === "unclear").length,
    missing_required_count: reEvaluation?.documents.missing_count ?? 0,
  };



  const downloadProposalPdf = () => {
    const htmlToUse = editedHtml ?? proposal?.html_content;
    if (!htmlToUse) {
      toast({ title: "No proposal available", description: "Generate a proposal first.", variant: "destructive" });
      return;
    }

    // Build a print-ready HTML page with @media print rules to hide browser chrome
    const printHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Loan Proposal - v${proposal?.proposal_version ?? 1}</title>
  <style>
    @media print {
      @page { margin: 0.5in; size: A4; }
      body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    }
  </style>
</head>
<body>
${htmlToUse}
</body>
</html>`;

    // Use a hidden iframe so it doesn't disrupt the current page
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.inset = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      toast({ title: "PDF generation failed", description: "Could not access print frame.", variant: "destructive" });
      return;
    }

    iframeDoc.open();
    iframeDoc.write(printHtml);
    iframeDoc.close();

    // Wait for content to render before printing
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        // Clean up after a delay to allow the print dialogue to open
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }
    };
  };

  const openProposalEmailApp = () => {
    if (!proposal) {
      toast({ title: "No proposal available", description: "Generate a proposal first.", variant: "destructive" });
      return;
    }

    const to = toText(proposalEmailDraft.to, toText(proposalBank.contact_email, ""));
    if (!to) {
      toast({
        title: "Missing bank email",
        description: "Bank contact email is not configured for this product.",
        variant: "destructive",
      });
      return;
    }

    const subject = toText(
      proposalEmailDraft.subject,
      `Loan Proposal Submission - ${toText(proposalBank.product_name)} - ${toText(proposalApplicant.full_name, "Applicant")}`,
    );

    const fallbackBody = [
      "Dear Credit Evaluation Team,",
      "",
      `Please find my loan proposal for ${toText(proposalBank.product_name)}.`,
      `Applicant: ${toText(proposalApplicant.full_name)}`,
      `Business: ${toText(proposalBusiness.business_name)}`,
      `Requested Amount: ${toText(proposalRequest.requested_amount_formatted)}`,
      "",
      "Regards,",
      toText(proposalApplicant.full_name, "Applicant"),
    ].join("\n");
    const body = toText(proposalEmailDraft.body, fallbackBody);

    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Application Tracker"
        subtitle="Track your selected lender, run final checks, and prepare the proposal."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={applicationId} onValueChange={(value) => {
              const next = new URLSearchParams(searchParams);
              next.set("applicationId", value);
              setSearchParams(next);
            }}>
              <SelectTrigger className="min-w-[220px]"><SelectValue placeholder="Select application" /></SelectTrigger>
              <SelectContent>
                {(applicationsQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.id.slice(0, 8)} - {row.purpose}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!selectedProductId || reEvaluationQuery.isFetching} onClick={() => void reEvaluationQuery.refetch()}>
              <ShieldCheck className="h-4 w-4" />
              {reEvaluationQuery.isFetching ? "Re-checking..." : "Re-run Bank Re-check"}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Application Status Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">{application.id.slice(0, 8)} | {application.purpose}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {timelineSteps.map((step, i) => {
              const isCurrent = step.status === "current";
              return (
                <div key={step.label} className="flex gap-4 rounded-lg px-1 py-2">
                  <div className="flex flex-col items-center">
                    {step.status === "done" ? <CheckCircle2 className="h-6 w-6 text-success" /> : isCurrent ? <Clock3 className="h-6 w-6 text-primary" /> : <Circle className="h-6 w-6 text-muted" />}
                    {i < timelineSteps.length - 1 ? <div className={cn("h-10 w-0.5", step.status === "done" ? "bg-success/60" : "bg-border")} /> : null}
                  </div>
                  <div className="pb-6">
                    <p className={cn("text-sm font-semibold", step.status === "pending" ? "text-muted-foreground" : "text-foreground")}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.date}</p>
                    {isCurrent ? <StatusBadge className="mt-2" status="under review" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Selected Bank / Scheme Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedProductId ? (
              <EmptyState title="No tracked scheme selected" description="Go to recommendations and click Track This on a scheme." action={<Button onClick={() => navigate(`/results?applicationId=${applicationId}`)}>Open Recommendations</Button>} />
            ) : reEvaluation ? (
              <>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{reEvaluation.product.bank_name}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Scheme</span><span className="font-medium">{reEvaluation.product.name}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Estimated Rate</span><span className="font-medium">{reEvaluation.product.estimated_rate.toFixed(2)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Estimated EMI</span><span className="font-medium text-primary">{formatLKR(reEvaluation.product.estimated_emi)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Tracking Started</span><span className="font-medium">{formatDate(application.tracking_started_at)}</span></div>
              </>
            ) : <p className="text-sm text-muted-foreground">Loading selected scheme details...</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Bank Requirement Re-check Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!reEvaluation ? <p className="text-sm text-muted-foreground">Run the bank re-check to view eligibility and checklist verification.</p> : (
              <>
                <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Eligibility Result</span><StatusBadge status={reEvaluation.eligibility.passed ? "approved" : "needs_review"} /></div>
                <div className="space-y-1.5"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Bank Match Score</span><span>{reEvaluation.scoring.bank_match_score.toFixed(1)}%</span></div><Progress value={reEvaluation.scoring.bank_match_score} /></div>
                <div className="space-y-1.5"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Document Completeness</span><span>{reEvaluation.documents.completeness_score.toFixed(1)}%</span></div><Progress value={reEvaluation.documents.completeness_score} /></div>
                <p className="text-xs text-muted-foreground">Missing docs: {reEvaluation.documents.missing_count} | Invalid docs: {reEvaluation.documents.invalid_count}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Document Scan & Verification</CardTitle>
            <p className="text-sm text-muted-foreground">Scan uploaded documents, detect type mismatches, and update validation status.</p>
          </div>
          <Button disabled={scanMutation.isPending || documents.length === 0} onClick={() => scanMutation.mutate()}>
            <FileSearch className="h-4 w-4" />
            {scanMutation.isPending ? "Scanning..." : "Scan Documents"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.length === 0 ? (
            <EmptyState title="No uploaded documents" description="Upload documents first to run tracker verification." action={<Button variant="outline" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}><Upload className="h-4 w-4" />Upload Documents</Button>} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3"><p className="label-xs">Total</p><p className="mt-1 text-lg font-semibold">{documentSummary.total_documents}</p></div>
                <div className="rounded-lg border border-success/30 bg-success/10 p-3"><p className="label-xs">Valid</p><p className="mt-1 text-lg font-semibold text-success">{documentSummary.valid_count}</p></div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3"><p className="label-xs">Invalid</p><p className="mt-1 text-lg font-semibold text-destructive">{documentSummary.invalid_count}</p></div>
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3"><p className="label-xs">Unclear</p><p className="mt-1 text-lg font-semibold text-warning-foreground">{documentSummary.unclear_count}</p></div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3"><p className="label-xs">Missing Required</p><p className="mt-1 text-lg font-semibold">{documentSummary.missing_required_count}</p></div>
              </div>

              {reEvaluation?.documents.missing_docs.length ? (
                <Alert variant="warning">
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Missing bank-required documents</AlertTitle>
                  <AlertDescription>{reEvaluation.documents.missing_docs.join(", ")}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-3">
                {(scannedDocuments.length > 0 ? scannedDocuments : documentRows).map((doc) => (
                  <div key={("document_id" in doc ? doc.document_id : doc.id)} className="rounded-lg border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{"file_name" in doc ? doc.file_name : doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Type: {"document_type" in doc ? doc.document_type : doc.document_type}
                          {("detected_doc_type" in doc && doc.detected_doc_type) ? ` | Detected: ${doc.detected_doc_type}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={(("validation_status" in doc ? doc.validation_status : "unclear") ?? "unclear") as string} />
                    </div>
                    {"ocr_preview" in doc && doc.ocr_preview ? <p className="mt-2 text-xs text-muted-foreground">{doc.ocr_preview}</p> : null}
                    {"notes" in doc && Array.isArray(doc.notes) && doc.notes.length > 0 ? <p className="mt-2 text-xs text-muted-foreground">{doc.notes.join(" ")}</p> : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Final Approval Probability</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!reEvaluation ? <p className="text-sm text-muted-foreground">Final probability will appear after tracker-stage re-evaluation.</p> : (
            <>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Initial Probability</span><span className="text-sm font-semibold">{reEvaluation.scoring.initial_probability.toFixed(1)}%</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Final Probability</span><span className="text-xl font-semibold text-primary">{reEvaluation.scoring.final_probability.toFixed(1)}%</span></div>
              {reEvaluation.prediction ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Prediction Source</span>
                  <span className="font-medium">
                    {reEvaluation.prediction.source === "ml_model"
                      ? `ML (${reEvaluation.prediction.model_version ?? "active"})`
                      : "Rule-Based Fallback"}
                  </span>
                </div>
              ) : null}
              <Progress value={reEvaluation.scoring.final_probability} />
              <div className="space-y-1">
                {reEvaluation.reasons.map((reason, index) => <p key={`${index}-${reason}`} className="text-sm text-foreground">{index + 1}. {reason}</p>)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Loan Proposal Generator</CardTitle>
            <p className="text-sm text-muted-foreground">
              Generate a detailed professional proposal letter with applicant details, bank details, and available document list.
            </p>
          </div>
          {!isEditingProposal && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!proposal?.html_content}
                onClick={() => {
                  const initial = fieldsFromProposalData(proposalData);
                  setEditedFields(initial);
                  setIsEditingProposal(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Edit Letter
              </Button>
              <Button variant="outline" disabled={!(editedHtml ?? proposal?.html_content)} onClick={downloadProposalPdf}>
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
              <Button variant="outline" disabled={!proposal} onClick={openProposalEmailApp}>
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
              <Button disabled={!selectedProductId || generateProposalMutation.isPending} onClick={() => generateProposalMutation.mutate()}>
                {generateProposalMutation.isPending ? "Generating..." : "Generate Proposal"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {proposalQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading proposal preview...</p>
          ) : isEditingProposal && editedFields ? (
            <ProposalEditor
              initialFields={editedFields}
              onSave={(html, fields) => {
                setEditedHtml(html);
                setEditedFields(fields);
                setIsEditingProposal(false);
                toast({ title: "Letter updated", description: "Your edits are applied. Use Print/PDF or Send Email." });
              }}
              onCancel={() => {
                setIsEditingProposal(false);
                // Keep any previously saved edits; just exit edit mode
              }}
            />
          ) : (proposal?.html_content || editedHtml) ? (
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Version {proposal?.proposal_version}</p>
                <p className="text-xs text-muted-foreground">Updated {formatDate(proposal?.updated_at ?? "")}</p>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Email recipient: {toText(proposalEmailDraft.to, toText(proposalBank.contact_email, "Not configured"))}
              </p>
              {/* Render inside an iframe to isolate the proposal's hardcoded light-mode colours from the app theme */}
              <iframe
                title="Proposal Preview"
                srcDoc={editedHtml ?? proposal?.html_content ?? ""}
                className="h-[420px] w-full rounded border border-border/60 bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No proposal generated yet for this application.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Final Outcome Update</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Outcome Status</Label>
              <Select value={outcomeForm.status} onValueChange={(value) => setOutcomeForm((prev) => ({ ...prev, status: value as OutcomeStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Input value={outcomeForm.notes} onChange={(event) => setOutcomeForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional decision notes" />
            </div>
          </div>

          {outcomeForm.status === "approved" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Approved Amount (LKR)</Label>
                <Input type="number" value={outcomeForm.approved_amount} onChange={(event) => setOutcomeForm((prev) => ({ ...prev, approved_amount: event.target.value }))} placeholder={String(application.requested_amount)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Approved Rate (%)</Label>
                <Input type="number" value={outcomeForm.approved_rate} onChange={(event) => setOutcomeForm((prev) => ({ ...prev, approved_rate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Approved Tenure (Months)</Label>
                <Input type="number" value={outcomeForm.approved_tenure_months} onChange={(event) => setOutcomeForm((prev) => ({ ...prev, approved_tenure_months: event.target.value }))} placeholder={String(application.preferred_tenure_months)} />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <StatusBadge status={dataQuery.data.outcome?.status ?? application.status} />
            <Button disabled={outcomeMutation.isPending} onClick={() => outcomeMutation.mutate()}>{outcomeMutation.isPending ? "Saving..." : "Save Outcome"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Loan Management Unlock</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!isApprovedState ? (
            <p className="text-sm text-muted-foreground">Loan management remains locked until the outcome is marked as approved.</p>
          ) : loanManagementQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking loan management access...</p>
          ) : loanManagementQuery.data?.unlocked ? (
            <>
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Loan Management Unlocked</AlertTitle>
                <AlertDescription>Approved terms are available for installment tracking and repayment operations.</AlertDescription>
              </Alert>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/70 p-3"><p className="label-xs">Approved Amount</p><p className="mt-1 text-lg font-semibold">{formatLKR(loanManagementQuery.data.tracker_summary.loanSummary.approvedAmount ?? 0)}</p></div>
                <div className="rounded-lg border border-border/70 p-3"><p className="label-xs">Monthly EMI</p><p className="mt-1 text-lg font-semibold text-primary">{formatLKR(loanManagementQuery.data.tracker_summary.loanSummary.emi ?? 0)}</p></div>
              </div>
              <Button onClick={() => navigate(`/management?applicationId=${applicationId}`)}>Open Loan Management</Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Approval is recorded, but loan management details are still being prepared. Refresh shortly.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-3 md:justify-start">
        <Button variant="outline" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}><Upload className="h-4 w-4" />Update Documents</Button>
        <Button variant="outline" onClick={() => navigate(`/results?applicationId=${applicationId}`)}><ShieldCheck className="h-4 w-4" />Open Recommendations</Button>
        <Button onClick={() => void dataQuery.refetch()}><RefreshCcw className="h-4 w-4" />Refresh Tracker</Button>
      </div>
    </div>
  );
}
