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

export async function getTrackerSummary(userId: string, applicationId: string): Promise<TrackerSummary> {
  const application = await loadOwnedApplication(userId, applicationId);

  const [outcomeResult, installmentsResult] = await Promise.all([
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
  ]);

  if (outcomeResult.error) {
    throw internalError("Failed to load outcome", outcomeResult.error);
  }

  if (installmentsResult.error) {
    throw internalError("Failed to load installments", installmentsResult.error);
  }

  const outcome = outcomeResult.data;
  const installments = installmentsResult.data ?? [];

  const approvedAmount = (outcome?.approved_amount as number | null) ?? null;
  const approvedRate = (outcome?.approved_rate as number | null) ?? null;
  const approvedTenureMonths = (outcome?.approved_tenure_months as number | null) ?? null;

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
