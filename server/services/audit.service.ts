import { supabaseAdmin } from "../lib/supabase/client";

type AuditLogInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export async function logAudit(input: AuditLogInput): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    payload_summary: input.payloadSummary ?? null,
    ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("Failed to write audit log", error);
  }
}
