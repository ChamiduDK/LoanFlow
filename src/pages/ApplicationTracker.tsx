import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  MessageSquare,
  RefreshCcw,
  Send,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { apiFetch } from "@/lib/api/client";
import type { DocumentRow, LoanApplication, TrackerSummary } from "@/types/backend";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLKR } from "@/lib/currency";

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

export default function ApplicationTracker() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const applicationId = searchParams.get("applicationId") ?? "";

  const dataQuery = useQuery({
    queryKey: ["tracker-page", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async () => {
      const [application, outcome, documents, tracker] = await Promise.all([
        apiFetch<LoanApplication>(`/api/applications/${applicationId}`),
        apiFetch<Record<string, unknown> | null>(`/api/applications/${applicationId}/outcome`),
        apiFetch<DocumentRow[]>(`/api/applications/${applicationId}/documents`),
        apiFetch<TrackerSummary>(`/api/applications/${applicationId}/tracker`),
      ]);

      return {
        application,
        outcome,
        documents,
        tracker,
      };
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
      { label: "Draft Created", date: dataQuery.data?.application.created_at ? formatDate(dataQuery.data.application.created_at) : "Pending", status: toStepStatus(index, 0) },
      { label: "Application Submitted", date: dataQuery.data?.application.updated_at ? formatDate(dataQuery.data.application.updated_at) : "Pending", status: toStepStatus(index, 1) },
      { label: "Under Review", date: status === "under_review" || status === "approved" || status === "rejected" ? formatDate(dataQuery.data?.application.updated_at ?? null) : "Pending", status: toStepStatus(index, 2) },
      { label: "Approved / Rejected", date: ["approved", "rejected"].includes(status) ? formatDate(dataQuery.data?.application.updated_at ?? null) : "Pending", status: toStepStatus(index, 3) },
    ];
  }, [dataQuery.data?.application.created_at, dataQuery.data?.application.status, dataQuery.data?.application.updated_at]);

  if (!applicationId) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader
          title="Application Tracker"
          subtitle="Monitor every stage of your application from submission to final bank decision."
        />
        <EmptyState
          title="No application selected"
          description="Open /tracker?applicationId=<id> from dashboard or results."
          action={<Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>}
        />
      </div>
    );
  }

  if (dataQuery.isLoading) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Loading tracker data..." />
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="space-y-3 p-6">{[1,2,3,4].map(i => <Skeleton key={i} className="h-4 w-full" />)}</CardContent></Card>
          <Card><CardContent className="space-y-3 p-6">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card>
        </div>
      </div>
    );
  }

  if (dataQuery.isError) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Monitor every stage of your application from submission to final bank decision." />
        <EmptyState
          title="Failed to load tracker"
          description="There was an error loading this application's tracker data. Please try again."
          action={<Button onClick={() => void dataQuery.refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  if (!dataQuery.data) {
    return (
      <div className="space-y-6 px-2 md:px-6">
        <PageHeader title="Application Tracker" subtitle="Monitor every stage of your application from submission to final bank decision." />
        <EmptyState
          title="Tracker data unavailable"
          description="Could not load tracker details for this application."
        />
      </div>
    );
  }

  const { application, documents, tracker } = dataQuery.data;

  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Application Tracker"
        subtitle="Monitor every stage of your application from submission to final bank decision."
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
                    {step.status === "done" ? (
                      <CheckCircle2 className="h-6 w-6 text-success" />
                    ) : isCurrent ? (
                      <Clock3 className="h-6 w-6 text-primary" />
                    ) : (
                      <Circle className="h-6 w-6 text-muted" />
                    )}
                    {i < timelineSteps.length - 1 ? (
                      <div
                        className={cn(
                          "h-10 w-0.5",
                          step.status === "done" ? "bg-success/60" : "bg-border",
                        )}
                      />
                    ) : null}
                  </div>
                  <div className="pb-6">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        step.status === "pending" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.date}</p>
                    {isCurrent ? <StatusBadge className="mt-2" status="under review" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-medium">{formatLKR(application.requested_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Purpose:</span><span className="font-medium">{application.purpose}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tenure:</span><span className="font-medium">{application.preferred_tenure_months} months</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-medium"><StatusBadge status={application.status} /></span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">EMI Estimate:</span><span className="font-medium text-primary">{formatLKR(tracker.loanSummary.emi ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Next Due:</span><span className="font-medium">{formatDate(tracker.nextDueDate)}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submitted Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uploaded documents yet.</p>
            ) : documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border/70 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{doc.file_name}</span>
                </div>
                <StatusBadge status={doc.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Notes and Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">System</p>
            <p className="mt-1 text-sm text-foreground">
              This tracker reflects real-time application status, outcome updates, and document progress from your account.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-3 md:justify-start">
        <Button variant="outline" onClick={() => navigate(`/documents?applicationId=${applicationId}`)}>
          <Upload className="h-4 w-4" />
          Update Documents
        </Button>
        <Button variant="outline" asChild>
          <a href={`mailto:info@smeloanhub.lk?subject=Application%20Support%20${applicationId.slice(0, 8)}`}>
            <Send className="h-4 w-4" />
            Contact Support
          </a>
        </Button>
        <Button onClick={() => void dataQuery.refetch()}>
          <RefreshCcw className="h-4 w-4" />
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
