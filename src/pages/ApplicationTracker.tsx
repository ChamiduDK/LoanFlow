
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
import { CheckCircle2, Circle, ClipboardCheck, Clock3, Copy, FileSearch, KeyRound, Link2, Mail, Pencil, Printer, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { apiFetch } from "@/lib/api/client";
import type {
  BankAgentAccessGrant,
  DocumentChecklistResponse,
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

type OutcomeRecord = {
  id: string;
  status: "applied" | "under_review" | "approved" | "rejected";
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
  const [bankAgentGrant, setBankAgentGrant] = useState<BankAgentAccessGrant | null>(null);
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
    setBankAgentGrant(null);
  }, [applicationId]);

  const dataQuery = useQuery({
    queryKey: ["tracker-page", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const [application, outcome, documents, tracker, checklist] = await Promise.all([
        apiFetch<LoanApplication>(`/api/applications/${applicationId}`),
        apiFetch<OutcomeRecord | null>(`/api/applications/${applicationId}/outcome`),
        apiFetch<DocumentRow[]>(`/api/applications/${applicationId}/documents`),
        apiFetch<TrackerSummary>(`/api/applications/${applicationId}/tracker`),
        apiFetch<DocumentChecklistResponse>(`/api/applications/${applicationId}/documents/check`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      ]);

      return { application, outcome, documents, tracker, checklist };
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

  const bankAgentAccessMutation = useMutation({
    mutationFn: () =>
      apiFetch<BankAgentAccessGrant>(`/api/applications/${applicationId}/bank-agent-access`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (payload) => {
      setBankAgentGrant(payload);
      toast({
        title: "Bank-agent access created",
        description: "Share the link and PIN securely with the assigned bank agent.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create bank-agent access",
        description: error instanceof Error ? error.message : "Could not generate secure access",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("Clipboard access is unavailable on this browser");
      }
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch (error) {
      toast({
        title: `Failed to copy ${label.toLowerCase()}`,
        description: error instanceof Error ? error.message : "Clipboard write failed",
        variant: "destructive",
      });
    }
  };

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

  const { application, documents, checklist, tracker } = dataQuery.data;
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

  const allChecklistItems = checklist.by_scheme.flatMap(s => s.checklist);
  const uniqueAvailableDocs = new Set(allChecklistItems.filter(i => i.is_available).map(i => i.document_type));

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

    // Use edited field values if user has customised the letter, otherwise fall back to raw proposal data
    const f = editedFields;

    const to = f?.bankEmail || toText(proposalEmailDraft.to, toText(proposalBank.contact_email, ""));
    if (!to) {
      toast({
        title: "Missing bank email",
        description: "Bank contact email is not configured for this product. Please edit the letter and add the bank email.",
        variant: "destructive",
      });
      return;
    }

    const applicantName = f?.fullName || toText(proposalApplicant.full_name, "Applicant");
    const businessName  = f?.businessName || toText(proposalBusiness.business_name, "-");
    const bankName      = f?.bankName || toText(proposalBank.bank_name, "the Bank");
    const productName   = f?.productName || toText(proposalBank.product_name, "the selected product");
    const subject       = f?.subject
      || toText(proposalEmailDraft.subject, `Credit Facility Request - ${productName} - ${applicantName}`);

    // Build a full, well-formatted email body with all proposal details
    const sep = "─".repeat(52);

    const availableDocs = f?.availableDocs
      ?? (Array.isArray(proposalVerification.available_documents)
        ? (proposalVerification.available_documents as Array<Record<string, unknown>>).map(
            (d) => String(d.display_name ?? d.document_type ?? "-"),
          )
        : []);

    const missingDocs = f?.missingDocs
      ?? (Array.isArray(proposalVerification.missing_documents)
        ? (proposalVerification.missing_documents as string[]).map(String)
        : []);

    const docLines =
      availableDocs.length > 0
        ? availableDocs.map((d, i) => `  ${i + 1}. ${d}`).join("\n")
        : "  No documents currently available.";

    const missingLine =
      missingDocs.length > 0
        ? `\nPending / Missing Documents:\n${missingDocs.map((d) => `  • ${d}`).join("\n")}`
        : "\nAll currently required documents are available.";

    const openingStatement = f?.openingStatement
      || toText(
          (proposalData.formal_request as Record<string, unknown> | undefined)?.statement,
          "This proposal is submitted for formal credit assessment at your institution.",
        );

    const body = [
      `Dear Credit Evaluation Team,`,
      `${bankName}`,
      ``,
      openingStatement,
      ``,
      sep,
      `APPLICANT DETAILS`,
      sep,
      `Name              : ${f?.fullName || toText(proposalApplicant.full_name)}`,
      `Email             : ${f?.email || toText(proposalApplicant.email)}`,
      `Phone             : ${f?.phone || toText(proposalApplicant.phone)}`,
      `District          : ${f?.district || toText(proposalApplicant.district)}`,
      ``,
      `BUSINESS DETAILS`,
      sep,
      `Business Name     : ${f?.businessName || toText(proposalBusiness.business_name)}`,
      `Business Type     : ${f?.businessType || toText(proposalBusiness.business_type)}`,
      `Industry          : ${f?.industry || toText(proposalBusiness.industry)}`,
      `Years Active      : ${f?.yearsActive || toText(proposalBusiness.years_active)}`,
      ``,
      `BANK & PRODUCT`,
      sep,
      `Bank Name         : ${bankName}`,
      `Loan Product      : ${productName}`,
      `Bank Email        : ${to}`,
      `Interest Range    : ${f?.rateRange || toText(proposalBank.rate_range)}`,
      ``,
      `LOAN REQUEST`,
      sep,
      `Requested Amount  : ${f?.requestedAmount || toText(proposalRequest.requested_amount_formatted)}`,
      `Purpose           : ${f?.purpose || toText(proposalRequest.purpose)}`,
      `Tenure            : ${f?.tenure || toText(proposalRequest.tenure)}`,
      `Collateral        : ${f?.collateralType || toText(proposalRequest.collateral_type, "Not specified")}`,
      `Estimated EMI     : ${f?.estimatedEmi || toText(proposalRepayment.estimated_emi_formatted)}`,
      `Estimated Rate    : ${f?.estimatedRate || toText(proposalRepayment.approved_rate ? `${Number(proposalRepayment.approved_rate).toFixed(2)}%` : "")}`,
      ``,
      `AVAILABLE DOCUMENTS`,
      sep,
      docLines,
      missingLine,
      ``,
      sep,
      `I confirm that the submitted information is accurate to the best of my knowledge.`,
      `I am ready to provide additional clarifications if required.`,
      ``,
      `Thank you for your time and consideration.`,
      ``,
      `Yours faithfully,`,
      applicantName,
    ].join("\n");

    // Create a hidden anchor and click it — the only reliable cross-browser way to
    // open a mailto: link without popup blockers interfering or navigating away
    const a = document.createElement("a");
    a.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 500);
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
          <div className="relative flex w-full items-start justify-between overflow-x-auto pb-4 md:pb-0 scrollbar-none">
            {timelineSteps.map((step, i) => {
              const isCurrent = step.status === "current";
              return (
                <div key={step.label} className="relative flex flex-1 flex-col items-center text-center min-w-[120px]">
                  {/* Connector Line */}
                  {i < timelineSteps.length - 1 && (
                    <div 
                      className={cn(
                        "absolute left-[50%] top-3 h-0.5 w-full -z-0",
                        step.status === "done" ? "bg-success/60" : "bg-border"
                      )} 
                    />
                  )}
                  
                  {/* Icon Container */}
                  <div className="relative z-10 bg-card px-2">
                    {step.status === "done" ? (
                      <CheckCircle2 className="h-6 w-6 text-success" />
                    ) : isCurrent ? (
                      <Clock3 className="h-6 w-6 text-primary" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted" />
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="mt-3 px-1">
                    <p className={cn("text-xs font-semibold", step.status === "pending" ? "text-muted-foreground" : "text-foreground")}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{step.date}</p>
                    {isCurrent ? (
                      <div className="mt-2 flex justify-center">
                        <StatusBadge className="scale-90" status="under review" />
                      </div>
                    ) : null}
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

      {checklist.by_scheme.some(s => s.checklist.some(i => i.is_available)) ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Document Availability Summary</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Requirements fulfilled via Quick Checklist. AI Scan & Verification is bypassed for Declared Available documents.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Declared Available</p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {uniqueAvailableDocs.size}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verification Path</p>
                <p className="mt-1 text-lg font-bold text-foreground">Manual Declaration</p>
              </div>
              <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completeness Impact</p>
                <p className="mt-1 text-2xl font-bold text-success">Positive</p>
              </div>
            </div>
            {documents.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3">Other Uploaded Files ({documents.length})</h4>
                <div className="space-y-2">
                  {documents.slice(0, 3).map(doc => (
                    <div key={doc.id} className="text-xs flex items-center justify-between p-2 border rounded-md">
                      <span>{doc.file_name}</span>
                      <StatusBadge status={doc.validation_status ?? "unclear"} />
                    </div>
                  ))}
                  {documents.length > 3 && <p className="text-[10px] text-muted-foreground">And {documents.length - 3} more...</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
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
      )}

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
        <CardHeader>
          <CardTitle className="text-base">Bank Agent Access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Generate a secure link and 6-digit PIN. The bank agent can use these credentials to update decision and tracking status.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Access controlled by applicant
            </div>
            <Button onClick={() => bankAgentAccessMutation.mutate()} disabled={bankAgentAccessMutation.isPending}>
              <Link2 className="h-4 w-4" />
              {bankAgentAccessMutation.isPending
                ? "Generating..."
                : bankAgentGrant
                  ? "Regenerate Link + PIN"
                  : "Generate Link + PIN"}
            </Button>
          </div>

          {bankAgentGrant ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Access Link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={bankAgentGrant.access_url} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copyToClipboard(bankAgentGrant.access_url, "Access link")}
                    aria-label="Copy access link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">6-Digit PIN</Label>
                <div className="flex gap-2">
                  <Input readOnly value={bankAgentGrant.pin_code} />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void copyToClipboard(bankAgentGrant.pin_code, "PIN")}
                    aria-label="Copy PIN"
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                Expires on {formatDate(bankAgentGrant.expires_at)}. Share this PIN only with the intended bank agent.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active bank-agent access generated yet for this application.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Decision Status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Current Status</p>
              <div className="mt-2">
                <StatusBadge status={dataQuery.data.outcome?.status ?? application.status} />
              </div>
            </div>
            <div className="rounded-lg border border-border/70 p-3">
              <p className="text-xs text-muted-foreground">Controlled By</p>
              <p className="mt-2 text-sm font-medium text-foreground">Bank agent or admin reviewer</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            Final approval, rejection, and sanctioned terms are not editable from the applicant dashboard.
            Share the secure bank-agent access link above or contact an admin reviewer if the decision needs to be updated.
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
