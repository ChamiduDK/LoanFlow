import { internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";
import { calculateEmi } from "./emi.service";
import { checkDocumentCompleteness } from "./document.service";
import { getTrackerSummary } from "./tracker.service";

export async function getBestLoanOptionForUser(userId: string): Promise<Record<string, unknown>> {
  const { data: applications, error: applicationsError } = await supabaseAdmin
    .from("loan_applications")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (applicationsError) {
    throw internalError("Failed to load applications for user", applicationsError);
  }

  const applicationIds = (applications ?? []).map((item) => String(item.id));

  if (applicationIds.length === 0) {
    throw notFound("No loan applications found for user");
  }

  for (const applicationId of applicationIds) {
    const result = await supabaseAdmin
      .from("application_results")
      .select("*, loan_products(name), banks(name)")
      .eq("application_id", applicationId)
      .eq("eligibility_passed", true)
      .order("rank_position", { ascending: true, nullsFirst: false })
      .order("ranking_score", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      throw internalError("Failed to fetch best loan option", result.error);
    }

    if (result.data) {
      return result.data;
    }
  }

  throw notFound("No ranked application results found for user");
}

export async function getMissingDocumentsForApplication(
  userId: string,
  applicationId: string,
  bankId?: string,
): Promise<Record<string, unknown>> {
  const checks = await checkDocumentCompleteness(userId, applicationId);

  if (!bankId) {
    return checks;
  }

  const filtered = {
    ...checks,
    by_scheme: ((checks.by_scheme as Array<Record<string, unknown>> | undefined) ?? []).filter(
      (item) => item.bank_id === bankId,
    ),
  };

  return filtered;
}

export async function getTrackerSummaryForAgent(userId: string, applicationId: string): Promise<Record<string, unknown>> {
  return getTrackerSummary(userId, applicationId);
}

export async function calculateEmiForAgent(
  _userId: string,
  payload: {
    principal: number;
    annual_rate: number;
    tenure_months: number;
  },
): Promise<Record<string, unknown>> {
  const result = calculateEmi(payload.principal, payload.annual_rate, payload.tenure_months);

  return {
    principal: result.principal,
    annual_rate: result.annualRate,
    tenure_months: result.tenureMonths,
    monthly_emi: result.monthlyEmi,
    total_interest: result.totalInterest,
    total_payable: result.totalPayable,
  };
}
