import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, KeyRound, RefreshCcw, FileText, Eye } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type {
  BankAgentAccessVerifyResponse,
  BankAgentOutcomeUpdateResponse,
} from "@/types/backend";
import StatusBadge from "@/components/shared/StatusBadge";
import { formatLKR } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

type OutcomeStatus = "applied" | "under_review" | "approved" | "rejected";

function toNumberOrNull(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatPercent(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "-";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export default function BankAgentAccess() {
  const { token = "" } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [pinCode, setPinCode] = useState("");
  const [accessData, setAccessData] = useState<BankAgentAccessVerifyResponse | null>(null);
  const [outcomeForm, setOutcomeForm] = useState({
    status: "under_review" as OutcomeStatus,
    notes: "",
    approved_amount: "",
    approved_rate: "",
    approved_tenure_months: "",
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      apiFetch<BankAgentAccessVerifyResponse>("/api/bank-agent/access/verify", {
        method: "POST",
        body: JSON.stringify({
          token,
          pin_code: pinCode,
        }),
      }),
    onSuccess: (payload) => {
      setAccessData(payload);
      setOutcomeForm({
        status: payload.outcome?.status ?? "under_review",
        notes: payload.outcome?.notes ?? "",
        approved_amount: payload.outcome?.approved_amount != null ? String(payload.outcome.approved_amount) : "",
        approved_rate: payload.outcome?.approved_rate != null ? String(payload.outcome.approved_rate) : "",
        approved_tenure_months:
          payload.outcome?.approved_tenure_months != null ? String(payload.outcome.approved_tenure_months) : "",
      });
      toast({ title: "Access verified", description: "Bank-agent access unlocked successfully." });
    },
    onError: (error) => {
      toast({
        title: "Access failed",
        description: error instanceof Error ? error.message : "Invalid link or PIN",
        variant: "destructive",
      });
    },
  });

  const updateOutcomeMutation = useMutation({
    mutationFn: () =>
      apiFetch<BankAgentOutcomeUpdateResponse>("/api/bank-agent/access/outcome", {
        method: "POST",
        body: JSON.stringify({
          token,
          pin_code: pinCode,
          status: outcomeForm.status,
          notes: outcomeForm.notes.trim() || null,
          approved_amount: outcomeForm.status === "approved" ? toNumberOrNull(outcomeForm.approved_amount) : null,
          approved_rate: outcomeForm.status === "approved" ? toNumberOrNull(outcomeForm.approved_rate) : null,
          approved_tenure_months:
            outcomeForm.status === "approved" ? toNumberOrNull(outcomeForm.approved_tenure_months) : null,
        }),
      }),
    onSuccess: (payload) => {
      setAccessData((previous) =>
        previous
          ? {
              ...previous,
              outcome: payload.outcome,
              tracker_summary: payload.tracker_summary,
              application: {
                ...previous.application,
                status: payload.outcome.status,
              },
            }
          : previous,
      );
      toast({ title: "Status updated", description: "Decision and tracking status were updated." });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Could not update status",
        variant: "destructive",
      });
    },
  });

  const hasToken = token.trim().length > 0;
  const isApproved = outcomeForm.status === "approved";

  const statusHint = useMemo(() => {
    if (!accessData) return null;
    return accessData.application.status;
  }, [accessData]);

  useEffect(() => {
    if (!hasToken) {
      setAccessData(null);
    }
  }, [hasToken]);

  const openProposalPreview = () => {
    const html = accessData?.proposal?.html_content;
    if (!html) {
      toast({
        title: "No proposal available",
        description: "Loan proposal has not been generated for this application yet.",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([html], { type: "text/html" });
    const previewUrl = URL.createObjectURL(blob);
    const previewWindow = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!previewWindow) {
      toast({
        title: "Preview blocked",
        description: "Allow pop-ups for this site to open the proposal preview.",
        variant: "destructive",
      });
    }
    setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  };

  if (!hasToken) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Invalid Access Link</AlertTitle>
          <AlertDescription>This bank-agent link is missing a valid token.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Bank Agent Decision Control
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use the secure 6-digit PIN provided by the applicant to access and update loan decision/tracking status.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="bank-agent-pin">6-Digit PIN</Label>
              <Input
                id="bank-agent-pin"
                inputMode="numeric"
                maxLength={6}
                value={pinCode}
                onChange={(event) => setPinCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter PIN"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending || pinCode.length !== 6}
                className="w-full sm:w-auto"
              >
                <KeyRound className="h-4 w-4" />
                {verifyMutation.isPending ? "Verifying..." : "Verify Access"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {accessData ? (
        <>
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Application Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Current Status</p>
                <div className="mt-1"><StatusBadge status={statusHint ?? "under_review"} /></div>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Requested Amount</p>
                <p className="mt-1 text-sm font-semibold">{formatLKR(accessData.application.requested_amount)}</p>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Selected Scheme</p>
                <p className="mt-1 text-sm font-semibold">{accessData.application.selected_product_name ?? "-"}</p>
                <p className="text-xs text-muted-foreground">{accessData.application.selected_bank_name ?? "-"}</p>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Access Expires</p>
                <p className="mt-1 text-sm font-semibold">{formatDate(accessData.access.expires_at)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Loan Proposal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accessData.proposal ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Proposal Version</p>
                      <p className="mt-1 text-sm font-semibold">v{accessData.proposal.proposal_version}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 p-3">
                      <p className="text-xs text-muted-foreground">Updated At</p>
                      <p className="mt-1 text-sm font-semibold">{formatDate(accessData.proposal.updated_at)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">Subject</p>
                    <p className="mt-1 text-sm font-semibold">
                      {String(
                        toRecord(toRecord(accessData.proposal.proposal_data_json).formal_request).subject
                        ?? "Credit Facility Request",
                      )}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={openProposalPreview}>
                      <Eye className="h-4 w-4" />
                      View Proposal
                    </Button>
                  </div>
                </>
              ) : (
                <Alert>
                  <AlertTitle>No proposal found</AlertTitle>
                  <AlertDescription>This application does not have a generated proposal yet.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Document Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">Readiness</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatPercent(accessData.document_checklist.summary.overall_completeness)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">Total Required</p>
                  <p className="mt-1 text-sm font-semibold">{accessData.document_checklist.summary.total_required}</p>
                </div>
                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">Missing Required</p>
                  <p className="mt-1 text-sm font-semibold">{accessData.document_checklist.summary.total_missing}</p>
                </div>
              </div>

              {accessData.document_checklist.by_scheme.length > 0 ? (
                <div className="space-y-2">
                  {accessData.document_checklist.by_scheme.map((scheme) => (
                    <div key={scheme.product_id} className="rounded-lg border border-border/70 p-3">
                      <p className="text-sm font-semibold">{scheme.bank_name ?? "Bank"} - {scheme.product_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Readiness: {formatPercent(scheme.completeness_score)} | Missing: {scheme.missing_docs.length}
                      </p>
                      {scheme.missing_docs.length > 0 ? (
                        <p className="mt-1 text-xs text-destructive">
                          Missing docs: {scheme.missing_docs.join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-emerald-600">All preferred documents marked available.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No scheme checklist is available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">View Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accessData.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No uploaded documents found for this application.</p>
              ) : (
                accessData.documents.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Type: {doc.document_type} | Status: {doc.status} | Uploaded: {formatDate(doc.created_at)}
                      </p>
                    </div>
                    {doc.signed_url ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={doc.signed_url} target="_blank" rel="noreferrer">
                          <Eye className="h-4 w-4" />
                          View Document
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        View unavailable
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Update Decision & Tracking Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Decision Status</Label>
                  <Select
                    value={outcomeForm.status}
                    onValueChange={(value) => setOutcomeForm((previous) => ({ ...previous, status: value as OutcomeStatus }))}
                  >
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
                  <Input
                    value={outcomeForm.notes}
                    onChange={(event) => setOutcomeForm((previous) => ({ ...previous, notes: event.target.value }))}
                    placeholder="Optional review notes"
                  />
                </div>
              </div>

              {isApproved ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Approved Amount (LKR)</Label>
                    <Input
                      type="number"
                      value={outcomeForm.approved_amount}
                      onChange={(event) => setOutcomeForm((previous) => ({ ...previous, approved_amount: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Approved Rate (%)</Label>
                    <Input
                      type="number"
                      value={outcomeForm.approved_rate}
                      onChange={(event) => setOutcomeForm((previous) => ({ ...previous, approved_rate: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Approved Tenure (Months)</Label>
                    <Input
                      type="number"
                      value={outcomeForm.approved_tenure_months}
                      onChange={(event) =>
                        setOutcomeForm((previous) => ({ ...previous, approved_tenure_months: event.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={() => updateOutcomeMutation.mutate()} disabled={updateOutcomeMutation.isPending}>
                  <RefreshCcw className="h-4 w-4" />
                  {updateOutcomeMutation.isPending ? "Updating..." : "Update Status"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
