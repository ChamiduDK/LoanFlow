import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { forbidden, internalError, notFound, unauthorized } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { logAudit } from "./audit.service";
import { getOutcome, upsertOutcome } from "./outcome.service";
import { getTrackerSummary } from "./tracker.service";
import { checkDocumentCompleteness, listDocumentsForApplication } from "./document.service";
import { getLatestLoanProposal } from "./proposal.service";

type BankAgentAccessRow = {
  id: string;
  application_id: string;
  user_id: string;
  access_token_hash: string;
  pin_hash: string;
  is_active: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
};

type OutcomeUpsertPayload = {
  status: "applied" | "under_review" | "approved" | "rejected";
  applied_date?: string;
  decision_date?: string | null;
  approved_amount?: number | null;
  approved_rate?: number | null;
  approved_tenure_months?: number | null;
  notes?: string | null;
  consent_for_training?: boolean;
};

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secureHexEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function generateAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

function generatePinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getFrontendOrigin(): string {
  const configuredOrigin = env.CORS_ORIGIN
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.length > 0 && item !== "*");
  return configuredOrigin ?? "http://localhost:8080";
}

async function assertOwnedApplication(userId: string, applicationId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to load application for bank-agent access", error);
  }

  if (!data) {
    throw notFound("Application not found");
  }

  if (data.user_id !== userId) {
    throw forbidden("You cannot manage bank-agent access for this application");
  }
}

async function touchBankAgentAccess(accessId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("bank_agent_access")
    .update({
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", accessId);

  if (error) {
    throw internalError("Failed to update bank-agent access activity", error);
  }
}

async function verifyAccessCredentials(token: string, pinCode: string): Promise<BankAgentAccessRow> {
  const tokenHash = hashSecret(token);
  const pinHash = hashSecret(pinCode);

  const { data, error } = await supabaseAdmin
    .from("bank_agent_access")
    .select("*")
    .eq("access_token_hash", tokenHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to verify bank-agent access", error);
  }

  if (!data) {
    throw unauthorized("Invalid access credentials");
  }

  const access = data as unknown as BankAgentAccessRow;
  const now = Date.now();
  const expiresAt = new Date(access.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw forbidden("Bank-agent access has expired");
  }

  if (!secureHexEquals(access.pin_hash, pinHash)) {
    throw unauthorized("Invalid access credentials");
  }

  await touchBankAgentAccess(access.id);
  return access;
}

async function loadApplicationSummary(applicationId: string): Promise<{
  id: string;
  status: string;
  purpose: string;
  requested_amount: number;
  preferred_tenure_months: number;
  tracking_started_at: string | null;
  selected_product_id: string | null;
  selected_product_name: string | null;
  selected_bank_name: string | null;
}> {
  const { data: application, error: applicationError } = await supabaseAdmin
    .from("loan_applications")
    .select("id, status, purpose, requested_amount, preferred_tenure_months, tracking_started_at, selected_product_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    throw internalError("Failed to load application summary", applicationError);
  }

  if (!application) {
    throw notFound("Application not found");
  }

  const selectedProductId = application.selected_product_id ? String(application.selected_product_id) : null;
  if (!selectedProductId) {
    return {
      id: String(application.id),
      status: String(application.status),
      purpose: String(application.purpose),
      requested_amount: Number(application.requested_amount),
      preferred_tenure_months: Number(application.preferred_tenure_months),
      tracking_started_at: application.tracking_started_at ? String(application.tracking_started_at) : null,
      selected_product_id: null,
      selected_product_name: null,
      selected_bank_name: null,
    };
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from("loan_products")
    .select("id, name, bank_id, banks(name)")
    .eq("id", selectedProductId)
    .maybeSingle();

  if (productError) {
    throw internalError("Failed to load selected product summary", productError);
  }

  const bankName = Array.isArray(product?.banks)
    ? (product?.banks[0] as { name?: string } | undefined)?.name ?? null
    : (product?.banks as { name?: string } | null | undefined)?.name ?? null;

  return {
    id: String(application.id),
    status: String(application.status),
    purpose: String(application.purpose),
    requested_amount: Number(application.requested_amount),
    preferred_tenure_months: Number(application.preferred_tenure_months),
    tracking_started_at: application.tracking_started_at ? String(application.tracking_started_at) : null,
    selected_product_id: selectedProductId,
    selected_product_name: product?.name ? String(product.name) : null,
    selected_bank_name: bankName,
  };
}

export async function createBankAgentAccessGrant(
  userId: string,
  applicationId: string,
  expiresInHours = 72,
  ipAddress?: string | null,
): Promise<{
  application_id: string;
  access_token: string;
  access_url: string;
  pin_code: string;
  expires_at: string;
  created_at: string;
}> {
  await assertOwnedApplication(userId, applicationId);

  const deactivation = await supabaseAdmin
    .from("bank_agent_access")
    .update({ is_active: false })
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (deactivation.error) {
    throw internalError("Failed to rotate existing bank-agent access", deactivation.error);
  }

  const accessToken = generateAccessToken();
  const pinCode = generatePinCode();
  const tokenHash = hashSecret(accessToken);
  const pinHash = hashSecret(pinCode);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("bank_agent_access")
    .insert({
      application_id: applicationId,
      user_id: userId,
      access_token_hash: tokenHash,
      pin_hash: pinHash,
      expires_at: expiresAt,
      is_active: true,
    })
    .select("created_at, expires_at")
    .single();

  if (error || !data) {
    throw internalError("Failed to create bank-agent access", error);
  }

  const accessUrl = `${getFrontendOrigin().replace(/\/+$/, "")}/bank-agent-access/${accessToken}`;

  await logAudit({
    actorUserId: userId,
    action: "bank_agent.access.granted",
    entityType: "loan_applications",
    entityId: applicationId,
    payloadSummary: {
      expires_at: expiresAt,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    application_id: applicationId,
    access_token: accessToken,
    access_url: accessUrl,
    pin_code: pinCode,
    expires_at: String(data.expires_at),
    created_at: String(data.created_at),
  };
}

export async function verifyBankAgentAccess(token: string, pinCode: string): Promise<{
  role: "bank_agent";
  access: {
    application_id: string;
    expires_at: string;
    verified_at: string;
  };
  application: {
    id: string;
    status: string;
    purpose: string;
    requested_amount: number;
    preferred_tenure_months: number;
    tracking_started_at: string | null;
    selected_product_id: string | null;
    selected_product_name: string | null;
    selected_bank_name: string | null;
  };
  outcome: Record<string, unknown> | null;
  tracker_summary: Awaited<ReturnType<typeof getTrackerSummary>>;
  proposal: Awaited<ReturnType<typeof getLatestLoanProposal>>;
  document_checklist: Awaited<ReturnType<typeof checkDocumentCompleteness>>;
  documents: Awaited<ReturnType<typeof listDocumentsForApplication>>;
}> {
  const access = await verifyAccessCredentials(token, pinCode);
  const applicationSummary = await loadApplicationSummary(access.application_id);
  const checklistProductIds = applicationSummary.selected_product_id
    ? [applicationSummary.selected_product_id]
    : undefined;

  const [trackerSummary, outcome, proposal, documentChecklist, documents] = await Promise.all([
    getTrackerSummary(access.user_id, access.application_id),
    getOutcome(access.user_id, access.application_id),
    getLatestLoanProposal(access.user_id, access.application_id),
    checkDocumentCompleteness(access.user_id, access.application_id, checklistProductIds),
    listDocumentsForApplication(access.user_id, access.application_id),
  ]);

  return {
    role: "bank_agent",
    access: {
      application_id: access.application_id,
      expires_at: access.expires_at,
      verified_at: new Date().toISOString(),
    },
    application: applicationSummary,
    outcome,
    tracker_summary: trackerSummary,
    proposal,
    document_checklist: documentChecklist,
    documents,
  };
}

export async function updateOutcomeByBankAgentAccess(
  token: string,
  pinCode: string,
  payload: OutcomeUpsertPayload,
  ipAddress?: string | null,
): Promise<{
  outcome: Record<string, unknown>;
  tracker_summary: Awaited<ReturnType<typeof getTrackerSummary>>;
}> {
  const access = await verifyAccessCredentials(token, pinCode);

  const outcome = await upsertOutcome(
    access.user_id,
    access.application_id,
    payload,
    ipAddress ?? null,
  );

  const trackerSummary = await getTrackerSummary(access.user_id, access.application_id);

  await logAudit({
    actorUserId: null,
    action: "bank_agent.outcome.updated",
    entityType: "loan_applications",
    entityId: access.application_id,
    payloadSummary: {
      access_id: access.id,
      status: payload.status,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    outcome,
    tracker_summary: trackerSummary,
  };
}
