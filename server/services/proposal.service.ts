import { calculateEmi } from "./emi.service";
import { badRequest, forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";

type ProposalGenerateResult = {
  proposal: {
    id: string;
    application_id: string;
    product_id: string;
    proposal_version: number;
    proposal_data_json: Record<string, unknown>;
    html_content: string | null;
    pdf_file_path: string | null;
    created_at: string;
    updated_at: string;
  };
  preview: {
    html_content: string;
    generated_at: string;
  };
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLkr(amount: number): string {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function loadOwnedApplication(userId: string, applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application", error);
  }

  if (!data) {
    throw notFound("Application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot access this application");
  }

  return data;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildProposalHtml(data: Record<string, unknown>): string {
  const applicant = (data.applicant as Record<string, unknown>) ?? {};
  const business = (data.business as Record<string, unknown>) ?? {};
  const request = (data.request as Record<string, unknown>) ?? {};
  const selectedBank = (data.selected_bank as Record<string, unknown>) ?? {};
  const verification = (data.verification as Record<string, unknown>) ?? {};
  const repayment = (data.repayment as Record<string, unknown>) ?? {};
  const probability = (data.probability as Record<string, unknown>) ?? {};
  const generatedAt = String(data.generated_at ?? new Date().toISOString());
  const missingDocs = ((verification.missing_documents as string[] | undefined) ?? [])
    .map((doc) => `<li>${escapeHtml(doc)}</li>`)
    .join("");

  const summaryRows = [
    ["Applicant", String(applicant.full_name ?? "-")],
    ["Business", String(business.business_name ?? "-")],
    ["Loan Amount", String(request.requested_amount_formatted ?? "-")],
    ["Purpose", String(request.purpose ?? "-")],
    ["Tenure", String(request.tenure ?? "-")],
    ["Selected Bank", String(selectedBank.bank_name ?? "-")],
    ["Scheme", String(selectedBank.product_name ?? "-")],
    ["Estimated EMI", String(repayment.estimated_emi_formatted ?? "-")],
    ["Final Probability", `${toNumber(probability.final_probability, 0).toFixed(1)}%`],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 8px;border:1px solid #d1d5db;width:36%;font-weight:600;">${escapeHtml(label)}</td><td style="padding:6px 8px;border:1px solid #d1d5db;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Loan Proposal</title>
  </head>
  <body style="font-family: 'Times New Roman', Georgia, serif; color: #111827; line-height: 1.5; margin: 32px;">
    <p style="text-align:right; margin:0 0 18px 0;">Date: ${escapeHtml(formatDate(generatedAt))}</p>
    <h2 style="margin:0 0 12px 0;">Loan Proposal Request</h2>
    <p style="margin:0 0 12px 0;">
      To,<br />
      Credit Evaluation Team<br />
      ${escapeHtml(String(selectedBank.bank_name ?? "Selected Bank"))}
    </p>
    <p style="margin:0 0 14px 0;">
      Dear Sir/Madam,
    </p>
    <p style="margin:0 0 14px 0;">
      I respectfully submit this proposal requesting consideration for the loan facility under
      <strong>${escapeHtml(String(selectedBank.product_name ?? "the selected product"))}</strong>.
      The applicant and business information, repayment estimate, and document verification summary are provided below.
    </p>
    <table style="border-collapse:collapse; width:100%; margin: 8px 0 16px 0; font-size: 14px;">
      ${summaryRows}
    </table>
    <h3 style="margin:16px 0 8px 0;">Document Verification Summary</h3>
    <p style="margin:0 0 8px 0;">
      Completeness: <strong>${toNumber(verification.completeness_score, 0).toFixed(1)}%</strong> |
      Quality: <strong>${toNumber(verification.quality_score, 0).toFixed(1)}%</strong>
    </p>
    ${
      missingDocs
        ? `<p style="margin:0 0 6px 0;">Missing documents:</p><ul style="margin:0 0 14px 20px;">${missingDocs}</ul>`
        : `<p style="margin:0 0 14px 0;">All required documents for the selected bank are available.</p>`
    }
    <p style="margin:0 0 14px 0;">
      I confirm that the submitted information is accurate to the best of my knowledge and I am ready to provide additional clarifications if required.
    </p>
    <p style="margin:0 0 20px 0;">
      Thank you for your time and consideration.
    </p>
    <p style="margin:0;">
      Yours faithfully,<br />
      ${escapeHtml(String(applicant.full_name ?? "Applicant"))}
    </p>
  </body>
</html>
`.trim();
}

function normalizeJsonObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

export async function generateLoanProposal(
  userId: string,
  applicationId: string,
  productIdOverride?: string,
  ipAddress?: string | null,
): Promise<ProposalGenerateResult> {
  const application = await loadOwnedApplication(userId, applicationId);

  const selectedProductId = productIdOverride ?? (application.selected_product_id ? String(application.selected_product_id) : null);
  if (!selectedProductId) {
    throw badRequest("No tracked loan product selected for this application");
  }

  const [
    profileResult,
    productResult,
    requiredDocsResult,
    documentsResult,
    checksResult,
    resultResult,
    outcomeResult,
    latestProposalResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("loan_products")
      .select("id, bank_id, name, rate_min, rate_max, banks(name)")
      .eq("id", selectedProductId)
      .maybeSingle(),
    supabaseAdmin
      .from("required_documents")
      .select("document_type, display_name, is_required")
      .eq("product_id", selectedProductId),
    supabaseAdmin
      .from("documents")
      .select("document_type, validation_status")
      .eq("application_id", applicationId)
      .eq("user_id", userId),
    supabaseAdmin
      .from("document_checks")
      .select("completeness_score, missing_docs")
      .eq("application_id", applicationId)
      .eq("product_id", selectedProductId)
      .maybeSingle(),
    supabaseAdmin
      .from("application_results")
      .select("approval_probability, initial_probability, final_probability, emi, estimated_rate")
      .eq("application_id", applicationId)
      .eq("product_id", selectedProductId)
      .maybeSingle(),
    supabaseAdmin
      .from("outcomes")
      .select("status, approved_amount, approved_rate, approved_tenure_months")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("loan_proposals")
      .select("proposal_version")
      .eq("application_id", applicationId)
      .eq("product_id", selectedProductId)
      .order("proposal_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    throw internalError("Failed to load profile for proposal generation", profileResult.error);
  }

  if (productResult.error) {
    throw internalError("Failed to load selected product for proposal generation", productResult.error);
  }

  if (!productResult.data) {
    throw notFound("Selected product not found");
  }

  if (requiredDocsResult.error) {
    throw internalError("Failed to load required documents for proposal", requiredDocsResult.error);
  }

  if (documentsResult.error) {
    throw internalError("Failed to load uploaded documents for proposal", documentsResult.error);
  }

  if (checksResult.error) {
    throw internalError("Failed to load document check summary", checksResult.error);
  }

  if (resultResult.error) {
    throw internalError("Failed to load application result summary", resultResult.error);
  }

  if (outcomeResult.error) {
    throw internalError("Failed to load outcome summary", outcomeResult.error);
  }

  if (latestProposalResult.error) {
    throw internalError("Failed to load proposal version history", latestProposalResult.error);
  }

  const profile = profileResult.data ?? {};
  const product = productResult.data;
  const requiredDocs = (requiredDocsResult.data ?? []).filter((item) => item.is_required === true);
  const documents = documentsResult.data ?? [];
  const uploadedTypes = new Set(documents.map((doc) => String(doc.document_type).trim().toLowerCase()));
  const missingDocs = requiredDocs
    .filter((doc) => !uploadedTypes.has(String(doc.document_type).trim().toLowerCase()))
    .map((doc) => String(doc.display_name));

  const validCount = documents.filter((doc) => String(doc.validation_status ?? "unclear") === "valid").length;
  const invalidCount = documents.filter((doc) => String(doc.validation_status ?? "unclear") === "invalid").length;
  const unclearCount = documents.filter((doc) => String(doc.validation_status ?? "unclear") === "unclear").length;

  const approvedAmount = toNumber(outcomeResult.data?.approved_amount, toNumber(application.requested_amount, 0));
  const approvedTenure = toNumber(outcomeResult.data?.approved_tenure_months, toNumber(application.preferred_tenure_months, 0));
  const derivedRate = toNumber((toNumber(product.rate_min, 0) + toNumber(product.rate_max, 0)) / 2, 0);
  const approvedRate = toNumber(outcomeResult.data?.approved_rate, toNumber(resultResult.data?.estimated_rate, derivedRate));
  const estimatedEmi = toNumber(
    resultResult.data?.emi,
    approvedAmount > 0 && approvedRate >= 0 && approvedTenure > 0
      ? calculateEmi(approvedAmount, approvedRate, approvedTenure).monthlyEmi
      : 0,
  );

  const documentCompleteness = toNumber(checksResult.data?.completeness_score, requiredDocs.length === 0
    ? 100
    : Number((((requiredDocs.length - missingDocs.length) / requiredDocs.length) * 100).toFixed(2)));

  const qualityDenominator = validCount + invalidCount + unclearCount;
  const documentQuality = qualityDenominator === 0
    ? 0
    : Number((((validCount + unclearCount * 0.5) / qualityDenominator) * 100).toFixed(2));

  const finalProbability = toNumber(
    resultResult.data?.final_probability,
    toNumber(resultResult.data?.initial_probability, toNumber(resultResult.data?.approval_probability, 0)),
  );

  const generatedAt = new Date().toISOString();

  const proposalData = {
    generated_at: generatedAt,
    applicant: {
      full_name: profile.full_name ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      district: profile.district ?? null,
    },
    business: {
      business_name: profile.business_name ?? null,
      business_type: profile.business_type ?? null,
      industry: profile.industry ?? null,
      years_active: profile.years_active ?? null,
      annual_turnover: profile.annual_turnover ?? null,
    },
    request: {
      requested_amount: toNumber(application.requested_amount, 0),
      requested_amount_formatted: formatLkr(toNumber(application.requested_amount, 0)),
      purpose: String(application.purpose ?? "-"),
      tenure_months: toNumber(application.preferred_tenure_months, 0),
      tenure: `${toNumber(application.preferred_tenure_months, 0)} months`,
      collateral_available: Boolean(application.collateral_available),
      collateral_type: application.collateral_type ? String(application.collateral_type) : null,
    },
    selected_bank: {
      bank_id: String(product.bank_id),
      bank_name: Array.isArray(product.banks)
        ? (product.banks[0] as { name?: string } | undefined)?.name ?? "Unknown Bank"
        : (product.banks as { name?: string } | null)?.name ?? "Unknown Bank",
      product_id: String(product.id),
      product_name: String(product.name),
    },
    verification: {
      required_count: requiredDocs.length,
      uploaded_count: documents.length,
      missing_count: missingDocs.length,
      missing_documents: missingDocs,
      completeness_score: documentCompleteness,
      quality_score: documentQuality,
      valid_count: validCount,
      invalid_count: invalidCount,
      unclear_count: unclearCount,
    },
    repayment: {
      approved_amount: approvedAmount,
      approved_amount_formatted: formatLkr(approvedAmount),
      approved_rate: approvedRate,
      approved_tenure_months: approvedTenure,
      estimated_emi: estimatedEmi,
      estimated_emi_formatted: formatLkr(estimatedEmi),
    },
    probability: {
      final_probability: finalProbability,
      outcome_status: outcomeResult.data?.status ?? null,
    },
    formal_request: {
      subject: "Loan Proposal Request",
      statement:
        "This proposal is generated from the applicant profile, selected scheme details, and latest verification checks.",
    },
  } satisfies Record<string, unknown>;

  const htmlContent = buildProposalHtml(proposalData);
  const nextVersion = Number(latestProposalResult.data?.proposal_version ?? 0) + 1;

  const insertProposal = await supabaseAdmin
    .from("loan_proposals")
    .insert({
      application_id: applicationId,
      product_id: selectedProductId,
      proposal_version: nextVersion,
      proposal_data_json: proposalData,
      html_content: htmlContent,
      pdf_file_path: null,
      created_by: userId,
    })
    .select("*")
    .single();

  if (insertProposal.error || !insertProposal.data) {
    throw internalError("Failed to store generated proposal", insertProposal.error);
  }

  await logAudit({
    actorUserId: userId,
    action: "proposal.generated",
    entityType: "loan_proposals",
    entityId: String(insertProposal.data.id),
    payloadSummary: {
      application_id: applicationId,
      product_id: selectedProductId,
      proposal_version: nextVersion,
      final_probability: finalProbability,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    proposal: {
      id: String(insertProposal.data.id),
      application_id: String(insertProposal.data.application_id),
      product_id: String(insertProposal.data.product_id),
      proposal_version: Number(insertProposal.data.proposal_version),
      proposal_data_json: normalizeJsonObject(insertProposal.data.proposal_data_json),
      html_content: insertProposal.data.html_content ? String(insertProposal.data.html_content) : null,
      pdf_file_path: insertProposal.data.pdf_file_path ? String(insertProposal.data.pdf_file_path) : null,
      created_at: String(insertProposal.data.created_at),
      updated_at: String(insertProposal.data.updated_at),
    },
    preview: {
      html_content: htmlContent,
      generated_at: generatedAt,
    },
  };
}

export async function getLatestLoanProposal(
  userId: string,
  applicationId: string,
): Promise<ProposalGenerateResult["proposal"] | null> {
  await loadOwnedApplication(userId, applicationId);

  const proposalResult = await supabaseAdmin
    .from("loan_proposals")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (proposalResult.error) {
    throw internalError("Failed to load latest proposal", proposalResult.error);
  }

  if (!proposalResult.data) {
    return null;
  }

  return {
    id: String(proposalResult.data.id),
    application_id: String(proposalResult.data.application_id),
    product_id: String(proposalResult.data.product_id),
    proposal_version: Number(proposalResult.data.proposal_version),
    proposal_data_json: normalizeJsonObject(proposalResult.data.proposal_data_json),
    html_content: proposalResult.data.html_content ? String(proposalResult.data.html_content) : null,
    pdf_file_path: proposalResult.data.pdf_file_path ? String(proposalResult.data.pdf_file_path) : null,
    created_at: String(proposalResult.data.created_at),
    updated_at: String(proposalResult.data.updated_at),
  };
}
