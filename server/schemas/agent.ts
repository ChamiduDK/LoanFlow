import { z } from "zod";
import { uuidSchema } from "./common";

export const linkWhatsappSchema = z.object({
  phone_number: z.string().min(7).max(24),
});

export const chatWebhookSchema = z.object({
  channel: z.string().min(2).max(40),
  event_type: z.string().min(2).max(100),
  payload: z.record(z.unknown()),
  received_at: z.string().datetime().optional(),
});

export const agentContextParamsSchema = z.object({
  applicationId: uuidSchema,
});

export const logAgentActionSchema = z.object({
  application_id: uuidSchema.optional(),
  action_type: z.string().min(2).max(120),
  action_payload: z.record(z.unknown()).optional(),
  action_status: z.string().min(2).max(40).optional(),
  result_json: z.record(z.unknown()).optional(),
});

export const agentEmiSchema = z.object({
  principal: z.number().positive(),
  annual_rate: z.number().min(0).max(100),
  tenure_months: z.number().int().min(1).max(360),
});
