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

const timelineSteps = [
  { label: "Draft Created", date: "Dec 15, 2024", status: "done" as const },
  { label: "Application Submitted", date: "Dec 16, 2024", status: "done" as const },
  { label: "Under Review", date: "Dec 18, 2024", status: "current" as const },
  { label: "Approved / Rejected", date: "Pending", status: "pending" as const },
];

export default function ApplicationTracker() {
  return (
    <div className="space-y-6 px-2 md:px-6">
      <PageHeader
        title="Application Tracker"
        subtitle="Monitor every stage of your application from submission to final bank decision."
      />

      <Card>
        <CardHeader>
          <CardTitle>Application Status Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">APP-2024-001 | People's Bank | Peo SME Assist</p>
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
            <CardTitle className="text-base">Selected Bank Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Bank:</span><span className="font-medium">People's Bank</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Scheme:</span><span className="font-medium">Peo SME Assist</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-medium">LKR 5,000,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Interest Rate:</span><span className="font-medium">13.5%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tenure:</span><span className="font-medium">36 months</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">EMI Estimate:</span><span className="font-medium text-primary">LKR 169,850</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submitted Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: "National Identity Card", status: "Verified" },
              { name: "Business Registration Certificate", status: "Verified" },
              { name: "Bank Statements (6 months)", status: "Under Review" },
              { name: "Financial Statements", status: "Pending" },
            ].map((doc) => (
              <div key={doc.name} className="flex items-center justify-between rounded-lg border border-border/70 p-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{doc.name}</span>
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
            <p className="text-xs text-muted-foreground">Dec 18, 2024 | Bank Officer</p>
            <p className="mt-1 text-sm text-foreground">
              Application received. Please upload updated bank statements for the last 3 months.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Dec 16, 2024 | System</p>
            <p className="mt-1 text-sm text-foreground">
              Application submitted successfully. Reference: APP-2024-001.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 justify-center md:justify-start">
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Update Documents
        </Button>
        <Button variant="outline">
          <Send className="h-4 w-4" />
          Contact Bank
        </Button>
        <Button>
          <RefreshCcw className="h-4 w-4" />
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
