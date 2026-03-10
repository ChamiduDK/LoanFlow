import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableQueues, logAuditMock } = vi.hoisted(() => ({
  tableQueues: new Map<string, Array<Record<string, any>>>(),
  logAuditMock: vi.fn(),
}));

function createBuilder(config: {
  maybeSingleResult?: Record<string, unknown>;
  singleResult?: Record<string, unknown>;
}) {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    update: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingleResult ?? { data: null, error: null })),
    single: vi.fn(() => Promise.resolve(config.singleResult ?? { data: null, error: null })),
  };

  return builder;
}

function queueTable(table: string, ...builders: Array<Record<string, any>>) {
  tableQueues.set(table, [...builders]);
}

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const queue = tableQueues.get(table);
      if (!queue || queue.length === 0) {
        throw new Error(`No queued builder for table ${table}`);
      }

      return queue.shift();
    }),
  },
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: logAuditMock,
}));

describe("updateOutcomeTrainingConsent", () => {
  beforeEach(() => {
    tableQueues.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("updates consent for finalized outcomes", async () => {
    const applicationLookup = createBuilder({
      maybeSingleResult: {
        data: { id: "app-1", user_id: "user-1" },
        error: null,
      },
    });
    const outcomeLookup = createBuilder({
      maybeSingleResult: {
        data: {
          id: "outcome-1",
          application_id: "app-1",
          user_id: "user-1",
          status: "approved",
          consent_for_training: false,
        },
        error: null,
      },
    });
    const outcomeUpdate = createBuilder({
      singleResult: {
        data: {
          id: "outcome-1",
          application_id: "app-1",
          user_id: "user-1",
          status: "approved",
          consent_for_training: true,
        },
        error: null,
      },
    });

    queueTable("loan_applications", applicationLookup);
    queueTable("outcomes", outcomeLookup, outcomeUpdate);

    const { updateOutcomeTrainingConsent } = await import("../../server/services/outcome.service");
    const result = await updateOutcomeTrainingConsent("user-1", "app-1", true, "127.0.0.1");

    expect(result).toEqual(expect.objectContaining({
      id: "outcome-1",
      consent_for_training: true,
    }));
    expect(outcomeUpdate.update).toHaveBeenCalledWith({
      consent_for_training: true,
    });
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "outcome.training_consent.updated",
      entityId: "outcome-1",
      payloadSummary: {
        applicationId: "app-1",
        consent_for_training: true,
      },
    }));
  });

  it("rejects consent updates for non-final outcomes", async () => {
    queueTable("loan_applications", createBuilder({
      maybeSingleResult: {
        data: { id: "app-1", user_id: "user-1" },
        error: null,
      },
    }));
    queueTable("outcomes", createBuilder({
      maybeSingleResult: {
        data: {
          id: "outcome-1",
          application_id: "app-1",
          user_id: "user-1",
          status: "under_review",
          consent_for_training: false,
        },
        error: null,
      },
    }));

    const { updateOutcomeTrainingConsent } = await import("../../server/services/outcome.service");

    await expect(updateOutcomeTrainingConsent("user-1", "app-1", true)).rejects.toThrow(
      /Training consent can only be updated after a final approved or rejected outcome/,
    );
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
