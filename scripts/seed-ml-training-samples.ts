import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ quiet: true });

type ProfileRow = {
  id: string;
  district: string | null;
  business_type: string | null;
  industry: string | null;
  years_active: number | null;
  annual_turnover: number | null;
  turnover_band: string | null;
  is_approved: boolean;
};

type ProductRow = {
  id: string;
  bank_id: string;
  name: string;
  min_amount: number;
  max_amount: number;
  rate_min: number;
  rate_max: number;
  tenure_min_months: number;
  tenure_max_months: number;
  collateral_required: boolean;
};

const DOCUMENT_TYPES = ["nic", "bank_statement", "business_registration"] as const;
const PURPOSES = ["Working Capital", "Equipment Purchase", "Business Expansion", "Inventory Financing"] as const;
const COLLATERAL_TYPES = ["property", "vehicle", "inventory"] as const;
const MISSING_DOC_OPTIONS = ["tax_return", "cash_flow_statement", "guarantor_statement"] as const;

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function parseCountArg(): number {
  const raw = process.argv
    .slice(2)
    .find((arg) => !arg.startsWith("--") || arg.startsWith("--count="));

  const value = raw?.startsWith("--count=") ? raw.slice("--count=".length) : raw;
  if (!value) {
    return 30;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("Count must be an integer between 1 and 500");
  }

  return parsed;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeEmi(principal: number, annualRate: number, tenureMonths: number): number {
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate <= 0) {
    return round2(principal / Math.max(tenureMonths, 1));
  }

  const factor = (1 + monthlyRate) ** tenureMonths;
  return round2((principal * monthlyRate * factor) / (factor - 1));
}

function pickRequestedAmount(product: ProductRow, annualTurnover: number, approved: boolean, index: number): number {
  const effectiveTurnover = annualTurnover > 0 ? annualTurnover : product.min_amount * 4;
  const targetRatio = approved ? 0.48 + (index % 4) * 0.09 : 1.02 + (index % 5) * 0.14;
  const minBound = product.min_amount * (approved ? 1.03 : 1.08);
  const softMax = Math.min(
    product.max_amount * (approved ? 0.3 : 0.45),
    effectiveTurnover * (approved ? 0.9 : 1.8) + product.min_amount * 0.25,
  );
  const maxBound = Math.max(minBound * 1.15, softMax);
  return round2(clamp(effectiveTurnover * targetRatio, minBound, maxBound));
}

function pickTenure(product: ProductRow, approved: boolean, index: number): number {
  const span = Math.max(product.tenure_max_months - product.tenure_min_months, 0);
  if (span === 0) {
    return product.tenure_min_months;
  }

  const ratio = approved ? 0.35 + (index % 4) * 0.12 : 0.55 + (index % 3) * 0.12;
  return Math.round(product.tenure_min_months + span * Math.min(ratio, 0.95));
}

function pickRate(product: ProductRow, approved: boolean, index: number): number {
  const span = Math.max(product.rate_max - product.rate_min, 0);
  const ratio = approved ? 0.22 + (index % 3) * 0.1 : 0.62 + (index % 3) * 0.1;
  return round2(product.rate_min + span * Math.min(ratio, 0.95));
}

function isoDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

async function main(): Promise<void> {
  const count = parseCountArg();

  const [{ data: profiles, error: profilesError }, { data: products, error: productsError }, { count: beforeCount, error: beforeError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, district, business_type, industry, years_active, annual_turnover, turnover_band, is_approved")
        .eq("is_approved", true),
      supabase
        .from("loan_products")
        .select("id, bank_id, name, min_amount, max_amount, rate_min, rate_max, tenure_min_months, tenure_max_months, collateral_required")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("outcomes")
        .select("*", { count: "exact", head: true })
        .in("status", ["approved", "rejected"]),
    ]);

  if (profilesError) {
    throw new Error(`Failed to load profiles: ${profilesError.message}`);
  }
  if (productsError) {
    throw new Error(`Failed to load loan products: ${productsError.message}`);
  }
  if (beforeError) {
    throw new Error(`Failed to count finalized outcomes: ${beforeError.message}`);
  }

  const approvedProfiles = (profiles ?? []) as ProfileRow[];
  const activeProducts = (products ?? []) as ProductRow[];

  const preferredApprovedProfiles = approvedProfiles.filter(
    (profile) => Number(profile.annual_turnover ?? 0) >= 500_000 && Number(profile.years_active ?? 0) >= 3,
  );
  const preferredRejectedProfiles = approvedProfiles.filter(
    (profile) => Number(profile.annual_turnover ?? 0) > 0,
  );

  const approvalPool = preferredApprovedProfiles.length > 0 ? preferredApprovedProfiles : approvedProfiles;
  const rejectionPool = preferredRejectedProfiles.length > 0 ? preferredRejectedProfiles : approvedProfiles;

  if (approvalPool.length === 0 || rejectionPool.length === 0) {
    throw new Error("Need at least one approved profile to seed ML training samples");
  }
  if (activeProducts.length === 0) {
    throw new Error("Need at least one active loan product to seed ML training samples");
  }

  const seedTag = `ml-training-bootstrap:${new Date().toISOString()}`;
  const applications: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];
  const checks: Array<Record<string, unknown>> = [];
  const documents: Array<Record<string, unknown>> = [];
  const outcomes: Array<Record<string, unknown>> = [];
  const applicationIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const approved = index % 2 === 0;
    const product = activeProducts[index % activeProducts.length];
    const profilePool = approved ? approvalPool : rejectionPool;
    const profile = profilePool[index % profilePool.length];
    const applicationId = randomUUID();
    const annualTurnover = Number(profile.annual_turnover ?? 0);
    const requestedAmount = pickRequestedAmount(product, annualTurnover, approved, index);
    const tenureMonths = pickTenure(product, approved, index);
    const estimatedRate = pickRate(product, approved, index);
    const emi = computeEmi(requestedAmount, estimatedRate, tenureMonths);
    const totalPayable = round2(emi * tenureMonths);
    const totalInterest = round2(totalPayable - requestedAmount);
    const missingDocs =
      approved && index % 6 !== 0
        ? []
        : approved
          ? [MISSING_DOC_OPTIONS[index % MISSING_DOC_OPTIONS.length]]
          : [
              MISSING_DOC_OPTIONS[index % MISSING_DOC_OPTIONS.length],
              MISSING_DOC_OPTIONS[(index + 1) % MISSING_DOC_OPTIONS.length],
            ];
    const invalidCount = approved ? 0 : 1 + (index % 2);
    const unclearCount = approved ? (index % 5 === 0 ? 1 : 0) : index % 3 === 0 ? 1 : 0;
    const documentCompleteness = round2(approved ? 84 + (index % 5) * 3 : 48 + (index % 5) * 6);
    const documentQuality = round2(approved ? 82 + (index % 4) * 4 : 38 + (index % 4) * 8);
    const eligibilityScore = round2(approved ? 72 + (index % 5) * 4.2 : 38 + (index % 5) * 5.1);
    const bankMatchScore = round2(approved ? 70 + (index % 4) * 5.5 : 42 + (index % 4) * 6.5);
    const approvalProbability = round2(approved ? 68 + (index % 5) * 5.5 : 24 + (index % 5) * 6.2);
    const appliedDaysAgo = 90 - index;
    const decisionDaysAgo = appliedDaysAgo - (approved ? 7 : 5);

    applications.push({
      id: applicationId,
      user_id: profile.id,
      requested_amount: requestedAmount,
      purpose: PURPOSES[index % PURPOSES.length],
      preferred_tenure_months: tenureMonths,
      collateral_available: product.collateral_required ? approved || index % 3 === 0 : index % 4 === 0,
      collateral_type: product.collateral_required ? COLLATERAL_TYPES[index % COLLATERAL_TYPES.length] : null,
      status: approved ? "approved" : "rejected",
      business_context: {
        seed_tag: seedTag,
        synthetic_training_sample: true,
      },
      selected_product_id: product.id,
      submitted_at: isoDaysAgo(appliedDaysAgo),
    });

    results.push({
      id: randomUUID(),
      application_id: applicationId,
      product_id: product.id,
      bank_id: product.bank_id,
      eligibility_passed: approved,
      eligibility_score: eligibilityScore,
      reasons_json: approved
        ? ["Strong business turnover", "Documents largely complete"]
        : ["Weak document quality", "Requested amount is high for risk profile"],
      emi,
      total_interest: totalInterest,
      total_payable: totalPayable,
      estimated_rate: estimatedRate,
      approval_probability: approvalProbability,
      document_completeness: documentCompleteness,
      ranking_score: bankMatchScore,
      rank_position: 1,
      result_payload: {
        tracker_re_evaluation: {
          bank_match_score: bankMatchScore,
          final_probability: approvalProbability,
          document_completeness_score: documentCompleteness,
          document_quality_score: documentQuality,
          missing_count: missingDocs.length,
          invalid_count: invalidCount,
          unclear_count: unclearCount,
        },
      },
    });

    checks.push({
      id: randomUUID(),
      application_id: applicationId,
      product_id: product.id,
      user_id: profile.id,
      checklist_json: DOCUMENT_TYPES.map((documentType) => ({
        document_type: documentType,
        required: true,
        status: missingDocs.includes(documentType) ? "missing" : "submitted",
      })),
      missing_docs: missingDocs,
      completeness_score: documentCompleteness,
      checked_at: isoDaysAgo(decisionDaysAgo),
    });

    DOCUMENT_TYPES.forEach((documentType, docIndex) => {
      const isInvalid = docIndex < invalidCount;
      const isUnclear = !isInvalid && docIndex < invalidCount + unclearCount;
      const validationStatus = isInvalid ? "invalid" : isUnclear ? "unclear" : "valid";
      const status = isInvalid ? "rejected" : isUnclear ? "needs_review" : "verified";

      documents.push({
        id: randomUUID(),
        application_id: applicationId,
        user_id: profile.id,
        product_id: product.id,
        document_type: documentType,
        file_name: `${seedTag}-${index + 1}-${documentType}.pdf`,
        storage_bucket: process.env.SUPABASE_DOCS_BUCKET ?? "loan-documents",
        storage_path: `synthetic/${applicationId}/${documentType}-${randomUUID()}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 180_000 + docIndex * 12_500,
        status,
        validation_status: validationStatus,
        metadata: {
          synthetic_training_sample: true,
          seed_tag: seedTag,
        },
        uploaded_at: isoDaysAgo(appliedDaysAgo + 1),
      });
    });

    outcomes.push({
      id: randomUUID(),
      application_id: applicationId,
      user_id: profile.id,
      status: approved ? "approved" : "rejected",
      applied_date: isoDaysAgo(appliedDaysAgo).slice(0, 10),
      decision_date: isoDaysAgo(decisionDaysAgo).slice(0, 10),
      approved_amount: approved ? round2(requestedAmount * (0.9 + (index % 3) * 0.03)) : null,
      approved_rate: approved ? estimatedRate : null,
      approved_tenure_months: approved ? tenureMonths : null,
      consent_for_training: true,
      notes: `${seedTag} synthetic finalized sample`,
    });

    applicationIds.push(applicationId);
  }

  const cleanup = async (): Promise<void> => {
    if (applicationIds.length === 0) {
      return;
    }

    await supabase.from("outcomes").delete().in("application_id", applicationIds);
    await supabase.from("documents").delete().in("application_id", applicationIds);
    await supabase.from("document_checks").delete().in("application_id", applicationIds);
    await supabase.from("application_results").delete().in("application_id", applicationIds);
    await supabase.from("loan_applications").delete().in("id", applicationIds);
  };

  const applicationInsert = await supabase.from("loan_applications").insert(applications);
  if (applicationInsert.error) {
    throw new Error(`Failed to insert loan applications: ${applicationInsert.error.message}`);
  }

  const resultInsert = await supabase.from("application_results").insert(results);
  if (resultInsert.error) {
    await cleanup();
    throw new Error(`Failed to insert application results: ${resultInsert.error.message}`);
  }

  const checkInsert = await supabase.from("document_checks").insert(checks);
  if (checkInsert.error) {
    await cleanup();
    throw new Error(`Failed to insert document checks: ${checkInsert.error.message}`);
  }

  const documentInsert = await supabase.from("documents").insert(documents);
  if (documentInsert.error) {
    await cleanup();
    throw new Error(`Failed to insert documents: ${documentInsert.error.message}`);
  }

  const outcomeInsert = await supabase.from("outcomes").insert(outcomes);
  if (outcomeInsert.error) {
    await cleanup();
    throw new Error(`Failed to insert outcomes: ${outcomeInsert.error.message}`);
  }

  const { count: afterCount, error: afterError } = await supabase
    .from("outcomes")
    .select("*", { count: "exact", head: true })
    .in("status", ["approved", "rejected"]);

  if (afterError) {
    throw new Error(`Failed to verify finalized outcomes: ${afterError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        inserted_samples: count,
        finalized_outcomes_before: beforeCount ?? 0,
        finalized_outcomes_after: afterCount ?? 0,
        seed_tag: seedTag,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
