import { useState } from "react";
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
import { documentTypes } from "@/data/mockData";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";

type DocStatus = "uploaded" | "missing" | "needs_review" | "valid";

const mockDocStatuses: Record<string, DocStatus> = {
  nic: "valid",
  br: "uploaded",
  bank_statements: "missing",
  financial_statements: "needs_review",
  collateral_docs: "missing",
  tax_returns: "uploaded",
  utility_bills: "missing",
};

const statusConfig: Record<DocStatus, { icon: typeof CheckCircle2 }> = {
  valid: { icon: CheckCircle2 },
  uploaded: { icon: FileCheck2 },
  needs_review: { icon: Clock3 },
  missing: { icon: AlertCircle },
};

export default function DocumentUpload() {
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>();
  const totalRequired = documentTypes.filter(d => d.required).length;
  const completedRequired = documentTypes.filter(d => d.required && ["valid", "uploaded"].includes(mockDocStatuses[d.id])).length;
  const missingRequired = totalRequired - completedRequired;
  const completeness = Math.round((completedRequired / totalRequired) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Upload & Verification"
        subtitle="Upload supporting documents, monitor verification status, and resolve missing requirements."
        actions={(
          <Button>
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
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

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="subtle-grid rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-10 text-center">
                <Upload className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-3 text-base font-semibold text-foreground">Drag and drop files here</p>
                <p className="mt-1 text-sm text-muted-foreground">or browse from your device</p>
                <div className="mx-auto mt-4 max-w-sm">
                  <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>{doc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              {documentTypes.map((doc) => {
                const status = mockDocStatuses[doc.id];
                const config = statusConfig[status];
                const Icon = config.icon;
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-border/70 p-4",
                      status === "missing" && "border-destructive/25 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted/60 p-2">
                        <Icon className={cn("h-4 w-4",
                        status === "valid" && "text-success",
                        status === "uploaded" && "text-primary",
                        status === "needs_review" && "text-warning",
                        status === "missing" && "text-destructive",
                        )} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.required ? "Required document" : "Optional document"}</p>
                      </div>
                    </div>
                    <StatusBadge status={status} />
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
                ? "You still have missing files for at least one selected bank checklist."
                : "Required document set is complete and ready for review."}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">People's Bank Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={40} />
              {[
                { name: "NIC Copy", done: true },
                { name: "Business Registration", done: true },
                { name: "Bank Statements (6 mo)", done: false },
                { name: "Financial Statements", done: false },
                { name: "Utility Bills", done: false },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commercial Bank Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={50} />
              {[
                { name: "NIC Copy", done: true },
                { name: "Business Registration", done: true },
                { name: "Bank Statements (6 mo)", done: false },
                { name: "Audited Financials", done: false },
                { name: "Collateral Documents", done: false },
                { name: "Tax Returns", done: true },
              ].map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Compliance Team</p>
                <p className="mt-1 text-sm text-foreground">Please re-upload the last 3 months of bank statements in readable PDF format.</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">System</p>
                <p className="mt-1 text-sm text-foreground">Financial statements marked for manual review due to low scan quality.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
