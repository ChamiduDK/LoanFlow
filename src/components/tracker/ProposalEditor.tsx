import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { X, Save } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProposalFields = {
  // Letter header
  subject: string;
  openingStatement: string;
  // Applicant
  fullName: string;
  email: string;
  phone: string;
  district: string;
  // Business
  businessName: string;
  businessType: string;
  industry: string;
  yearsActive: string;
  // Bank
  bankName: string;
  bankEmail: string;
  bankWebsite: string;
  productName: string;
  rateRange: string;
  // Loan request
  requestedAmount: string;
  purpose: string;
  tenure: string;
  collateralType: string;
  estimatedEmi: string;
  estimatedRate: string;
  // Documents (display only, not editable)
  availableDocs: string[];
  missingDocs: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 8px;border:1px solid #d1d5db;width:36%;font-weight:600;">${esc(label)}</td><td style="padding:6px 8px;border:1px solid #d1d5db;">${esc(value)}</td></tr>`;
}

/** Rebuild a fully-styled proposal HTML from the editable fields. */
export function buildProposalHtmlFromFields(f: ProposalFields): string {
  const applicantRows = [
    row("Applicant Name", f.fullName || "-"),
    row("Email", f.email || "-"),
    row("Phone", f.phone || "-"),
    row("District", f.district || "-"),
    row("Business Name", f.businessName || "-"),
    row("Business Type", f.businessType || "-"),
    row("Industry", f.industry || "-"),
    row("Years Active", f.yearsActive || "-"),
  ].join("");

  const bankRows = [
    row("Bank Name", f.bankName || "-"),
    row("Bank Contact Email", f.bankEmail || "-"),
    row("Bank Website", f.bankWebsite || "-"),
    row("Loan Product", f.productName || "-"),
    row("Published Interest Range", f.rateRange || "-"),
  ].join("");

  const requestRows = [
    row("Requested Amount", f.requestedAmount || "-"),
    row("Purpose", f.purpose || "-"),
    row("Requested Tenure", f.tenure || "-"),
    row("Collateral Type", f.collateralType || "-"),
    row("Estimated EMI", f.estimatedEmi || "-"),
    row("Estimated Rate", f.estimatedRate || "-"),
  ].join("");

  const availableDocsHtml =
    f.availableDocs.length > 0
      ? `<table style="border-collapse:collapse;width:100%;margin:8px 0 16px 0;font-size:13px;">
          <thead><tr><th style="text-align:left;padding:6px 8px;border:1px solid #cfd8e3;background:#f4f7fb;">Document</th></tr></thead>
          <tbody>${f.availableDocs.map((d) => `<tr><td style="padding:6px 8px;border:1px solid #cfd8e3;">${esc(d)}</td></tr>`).join("")}</tbody>
        </table>`
      : `<p style="margin:0 0 14px 0;">No documents are currently available in the application record.</p>`;

  const missingDocsHtml =
    f.missingDocs.length > 0
      ? `<p style="margin:0 0 14px 0;"><strong>Pending documents:</strong> ${esc(f.missingDocs.join(", "))}</p>`
      : `<p style="margin:0 0 14px 0;">All currently required documents for this bank are available in the application file.</p>`;

  const today = new Date().toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Credit Facility Request Letter</title>
  </head>
  <body style="font-family: Cambria, 'Times New Roman', Georgia, serif; color: #1e293b; line-height: 1.58; margin: 0; padding: 36px; background: #f3f6fa;">
    <main style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #d4dde7; border-radius: 10px; padding: 34px 38px;">
      <p style="text-align:right; margin:0 0 18px 0; color:#334155;">Date: ${esc(today)}</p>
      <p style="margin:0 0 12px 0;">
        To,<br />
        Credit Evaluation Team<br />
        ${esc(f.bankName || "Selected Bank")}
      </p>
      <p style="margin:0 0 12px 0;">
        Subject: <strong>${esc(f.subject || "Credit Facility Request")}</strong>
      </p>
      <p style="margin:0 0 14px 0;">Dear Sir/Madam,</p>
      <p style="margin:0 0 14px 0;">
        I respectfully submit this request for consideration under
        <strong>${esc(f.productName || "the selected product")}</strong>.
        This request is submitted by the applicant below for formal credit assessment by ${esc(f.bankName || "the selected bank")}.
      </p>
      <p style="margin:0 0 14px 0;">${esc(f.openingStatement || "The details below summarize the applicant profile, bank selection, requested facility, and currently available documents.")}</p>

      <h3 style="margin:18px 0 8px 0; color:#0f2a44; border-bottom:1px solid #d6dde6; padding-bottom:4px;">Applicant Details</h3>
      <table style="border-collapse:collapse; width:100%; margin: 8px 0 16px 0; font-size: 14px;">${applicantRows}</table>

      <h3 style="margin:18px 0 8px 0; color:#0f2a44; border-bottom:1px solid #d6dde6; padding-bottom:4px;">Bank &amp; Product Details</h3>
      <table style="border-collapse:collapse; width:100%; margin: 8px 0 16px 0; font-size: 14px;">${bankRows}</table>

      <h3 style="margin:18px 0 8px 0; color:#0f2a44; border-bottom:1px solid #d6dde6; padding-bottom:4px;">Requested Facility Details</h3>
      <table style="border-collapse:collapse; width:100%; margin: 8px 0 16px 0; font-size: 14px;">${requestRows}</table>

      <h3 style="margin:18px 0 8px 0; color:#0f2a44; border-bottom:1px solid #d6dde6; padding-bottom:4px;">Available Documents</h3>
      ${availableDocsHtml}
      ${missingDocsHtml}

      <p style="margin:0 0 14px 0;">I confirm that the submitted information is accurate to the best of my knowledge and I am ready to provide additional clarifications if required.</p>
      <p style="margin:0 0 20px 0;">Thank you for your time and consideration.</p>
      <p style="margin:0;">
        Yours faithfully,<br />
        ${esc(f.fullName || "Applicant")}
      </p>
    </main>
  </body>
</html>`.trim();
}

/** Build an initial ProposalFields object from the raw proposal_data_json */
export function fieldsFromProposalData(data: Record<string, unknown>): ProposalFields {
  const s = (v: unknown, fb = "") => (v != null && String(v).trim() ? String(v).trim() : fb);

  const applicant = (data.applicant as Record<string, unknown>) ?? {};
  const business = (data.business as Record<string, unknown>) ?? {};
  const request = (data.request as Record<string, unknown>) ?? {};
  const bank = (data.selected_bank as Record<string, unknown>) ?? {};
  const repayment = (data.repayment as Record<string, unknown>) ?? {};
  const verification = (data.verification as Record<string, unknown>) ?? {};
  const formalRequest = (data.formal_request as Record<string, unknown>) ?? {};

  const rateMin = Number(bank.rate_min ?? 0).toFixed(2);
  const rateMax = Number(bank.rate_max ?? 0).toFixed(2);

  const availableDocs = Array.isArray(verification.available_documents)
    ? (verification.available_documents as Array<Record<string, unknown>>).map(
        (d) => String(d.display_name ?? d.document_type ?? "-"),
      )
    : [];

  const missingDocs = Array.isArray(verification.missing_documents)
    ? (verification.missing_documents as string[]).map(String)
    : [];

  return {
    subject: s(formalRequest.subject, "Credit Facility Request"),
    openingStatement: s(
      formalRequest.statement,
      "The details below summarize the applicant profile, bank selection, requested facility, and currently available documents.",
    ),
    fullName: s(applicant.full_name),
    email: s(applicant.email),
    phone: s(applicant.phone),
    district: s(applicant.district),
    businessName: s(business.business_name),
    businessType: s(business.business_type),
    industry: s(business.industry),
    yearsActive: s(business.years_active),
    bankName: s(bank.bank_name),
    bankEmail: s(bank.contact_email),
    bankWebsite: s(bank.website),
    productName: s(bank.product_name),
    rateRange: `${rateMin}% - ${rateMax}%`,
    requestedAmount: s(request.requested_amount_formatted),
    purpose: s(request.purpose),
    tenure: s(request.tenure),
    collateralType: s(request.collateral_type, "Not specified"),
    estimatedEmi: s(repayment.estimated_emi_formatted),
    estimatedRate: `${Number(repayment.approved_rate ?? 0).toFixed(2)}%`,
    availableDocs,
    missingDocs,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <p className="text-sm font-semibold text-foreground whitespace-nowrap">{children}</p>
      <Separator className="flex-1" />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
  readOnly,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  textarea?: boolean;
  readOnly?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          rows={3}
          className={`text-sm resize-none ${readOnly ? "opacity-60 cursor-default" : ""}`}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          className={`text-sm h-9 ${readOnly ? "opacity-60 cursor-default" : ""}`}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = {
  initialFields: ProposalFields;
  onSave: (html: string, fields: ProposalFields) => void;
  onCancel: () => void;
};

export default function ProposalEditor({ initialFields, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<ProposalFields>(initialFields);

  const set = (key: keyof ProposalFields) => (value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    onSave(buildProposalHtmlFromFields(fields), fields);
  };

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-4 py-2.5">
        <p className="text-sm text-muted-foreground">
          Edit the fields below, then save to update the letter.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* ── Letter Header ── */}
      <SectionHeading>Letter Header</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-1">
        <Field label="Subject Line" value={fields.subject} onChange={set("subject")} />
        <Field
          label="Opening Statement"
          value={fields.openingStatement}
          onChange={set("openingStatement")}
          textarea
          hint="This appears as the main body paragraph of the letter."
        />
      </div>

      {/* ── Applicant Details ── */}
      <SectionHeading>Applicant Details</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full Name" value={fields.fullName} onChange={set("fullName")} />
        <Field label="Email" value={fields.email} onChange={set("email")} />
        <Field label="Phone" value={fields.phone} onChange={set("phone")} />
        <Field label="District" value={fields.district} onChange={set("district")} />
      </div>

      {/* ── Business Details ── */}
      <SectionHeading>Business Details</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business Name" value={fields.businessName} onChange={set("businessName")} />
        <Field label="Business Type" value={fields.businessType} onChange={set("businessType")} />
        <Field label="Industry" value={fields.industry} onChange={set("industry")} />
        <Field label="Years Active" value={fields.yearsActive} onChange={set("yearsActive")} />
      </div>

      {/* ── Bank & Product ── */}
      <SectionHeading>Bank &amp; Product</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bank Name" value={fields.bankName} onChange={set("bankName")} />
        <Field label="Loan Product" value={fields.productName} onChange={set("productName")} />
        <Field label="Bank Contact Email" value={fields.bankEmail} onChange={set("bankEmail")} />
        <Field label="Bank Website" value={fields.bankWebsite} onChange={set("bankWebsite")} />
        <Field
          label="Published Interest Range"
          value={fields.rateRange}
          onChange={set("rateRange")}
        />
      </div>

      {/* ── Loan Request ── */}
      <SectionHeading>Loan Request</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested Amount" value={fields.requestedAmount} onChange={set("requestedAmount")} />
        <Field label="Purpose" value={fields.purpose} onChange={set("purpose")} />
        <Field label="Tenure" value={fields.tenure} onChange={set("tenure")} />
        <Field label="Collateral Type" value={fields.collateralType} onChange={set("collateralType")} />
        <Field label="Estimated EMI" value={fields.estimatedEmi} onChange={set("estimatedEmi")} />
        <Field label="Estimated Rate" value={fields.estimatedRate} onChange={set("estimatedRate")} />
      </div>

      {/* ── Available Documents (read-only info) ── */}
      <SectionHeading>Documents</SectionHeading>
      {fields.availableDocs.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Available documents included in the letter:</p>
          <ul className="space-y-1">
            {fields.availableDocs.map((d, i) => (
              <li key={i} className="text-sm text-foreground flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
          {fields.missingDocs.length > 0 && (
            <div className="mt-3 border-t border-border/40 pt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Pending / missing documents:</p>
              <ul className="space-y-1">
                {fields.missingDocs.map((d, i) => (
                  <li key={i} className="text-sm text-warning-foreground flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning flex-shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Document list is automatically included in the letter and cannot be edited here.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      )}

      {/* Bottom save bar */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
