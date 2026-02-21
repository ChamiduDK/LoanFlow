import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const amountSchema = z.number().positive().max(1_000_000_000);

export const turnoverBandSchema = z.enum([
  "below_1m",
  "1m_5m",
  "5m_25m",
  "25m_100m",
  "above_100m",
]);

export const appStatusSchema = z.enum([
  "draft",
  "submitted",
  "evaluated",
  "applied",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
]);

export const outcomeStatusSchema = z.enum(["applied", "under_review", "approved", "rejected"]);
