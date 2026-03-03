import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, KeyRound, RefreshCcw } from "lucide-react";
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
