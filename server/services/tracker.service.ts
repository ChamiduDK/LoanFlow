import { calculateEmi } from "./emi.service";
import type { TrackerSummary } from "../../types/domain";
import { forbidden, internalError, notFound } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase/client";

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

async function assertApprovedOutcome(userId: string, applicationId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("outcomes")
    .select("status")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw internalError("Failed to validate application outcome status", error);
  }

  if (!data || data.status !== "approved") {
    throw forbidden("Installment tracking is available only after approval");
  }
}

export async function getTrackerSummary(userId: string, applicationId: string): Promise<TrackerSummary> {
  const application = await loadOwnedApplication(userId, applicationId);
  const selectedProductId = application.selected_product_id ? String(application.selected_product_id) : null;

  const [outcomeResult, installmentsResult, productResult] = await Promise.all([
    supabaseAdmin
      .from("outcomes")
      .select("*")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("installments")
      .select("*")
      .eq("application_id", applicationId)
      .eq("user_id", userId)
      .order("due_date", { ascending: true }),
    selectedProductId
      ? supabaseAdmin
          .from("loan_products")
          .select("id, rate_min, rate_max")
          .eq("id", selectedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (outcomeResult.error) {
    throw internalError("Failed to load outcome", outcomeResult.error);
  }

  if (installmentsResult.error) {
    throw internalError("Failed to load installments", installmentsResult.error);
  }

  if (productResult.error) {
    throw internalError("Failed to load selected product for tracker summary", productResult.error);
  }

  const outcome = outcomeResult.data;
  const installments = installmentsResult.data ?? [];
  const selectedProduct = productResult.data;

  const amountFromOutcome = (outcome?.approved_amount as number | null) ?? null;
  const rateFromOutcome = (outcome?.approved_rate as number | null) ?? null;
  const tenureFromOutcome = (outcome?.approved_tenure_months as number | null) ?? null;

  const approvedAmount =
    amountFromOutcome ??
    (outcome?.status === "approved" ? Number(application.requested_amount ?? 0) : null);
  const approvedTenureMonths =
    tenureFromOutcome ??
    (outcome?.status === "approved" ? Number(application.preferred_tenure_months ?? 0) : null);

  const derivedRate = selectedProduct
    ? Number(((Number(selectedProduct.rate_min) + Number(selectedProduct.rate_max)) / 2).toFixed(2))
    : null;
  const approvedRate =
    rateFromOutcome ??
    (outcome?.status === "approved" ? derivedRate : null);

  const emi =
    approvedAmount !== null && approvedRate !== null && approvedTenureMonths !== null
      ? calculateEmi(approvedAmount, approvedRate, approvedTenureMonths).monthlyEmi
      : null;

  const paidCount = installments.filter((item) => item.status === "paid").length;
  const baselineInstallmentCount = approvedTenureMonths ?? installments.length;
  const progressPercent =
    baselineInstallmentCount === 0
      ? 0
      : Number(((paidCount / baselineInstallmentCount) * 100).toFixed(2));

  const nextDue = installments.find((item) => item.status !== "paid")?.due_date ?? null;

  return {
    applicationId: applicationId,
    status: (outcome?.status as TrackerSummary["status"]) ?? (application.status as TrackerSummary["status"]),
    loanSummary: {
      approvedAmount,
      approvedRate,
      approvedTenureMonths,
      emi,
    },
    nextDueDate: (nextDue as string | null) ?? null,
    installmentHistory: installments.map((item) => ({
      id: String(item.id),
      dueDate: String(item.due_date),
      amount: Number(item.amount),
      status: item.status,
      paidDate: item.paid_date ? String(item.paid_date) : null,
      notes: item.notes ? String(item.notes) : null,
    })),
    progressPercent,
  };
}

export async function addInstallment(
  userId: string,
  applicationId: string,
  payload: {
    due_date: string;
    amount: number;
    status?: "pending" | "paid" | "late";
    paid_date?: string | null;
    notes?: string | null;
  },
): Promise<Record<string, unknown>> {
  await loadOwnedApplication(userId, applicationId);
  await assertApprovedOutcome(userId, applicationId);

  const { data, error } = await supabaseAdmin
    .from("installments")
    .insert({
      user_id: userId,
      application_id: applicationId,
      due_date: payload.due_date,
      amount: payload.amount,
      status: payload.status ?? "pending",
      paid_date: payload.paid_date ?? null,
      notes: payload.notes ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw internalError("Failed to add installment", error);
  }

  return data;
}

export async function listInstallments(userId: string, applicationId: string): Promise<Record<string, unknown>[]> {
  await loadOwnedApplication(userId, applicationId);

  const { data, error } = await supabaseAdmin
    .from("installments")
    .select("*")
    .eq("application_id", applicationId)
    .eq("user_id", userId)
    .order("due_date", { ascending: true });

  if (error) {
    throw internalError("Failed to fetch installments", error);
  }

  return data ?? [];
}
