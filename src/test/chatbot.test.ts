import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies
const { generateChatResponseWithToolsMock, embedContentMock } = vi.hoisted(() => ({
  generateChatResponseWithToolsMock: vi.fn(),
  embedContentMock: vi.fn(),
}));

vi.mock("../../server/services/ai.service", () => ({
  aiService: {
    generateChatResponseWithTools: generateChatResponseWithToolsMock,
    embedContent: embedContentMock,
  },
}));

const { predictApprovalProbabilityMock } = vi.hoisted(() => ({
  predictApprovalProbabilityMock: vi.fn(),
}));

vi.mock("../../server/services/ml/prediction.service", () => ({
  predictApprovalProbability: predictApprovalProbabilityMock,
}));

vi.mock("../../server/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { chatbotService } from "../../server/services/chatbot.service";
import { supabaseAdmin } from "../../server/lib/supabase/client";

const mockedSupabaseAdmin = supabaseAdmin as unknown as {
  from: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

describe("ChatbotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSupabaseAdmin.from.mockReturnThis();
    embedContentMock.mockResolvedValue([0, 0, 0]);
    mockedSupabaseAdmin.maybeSingle.mockResolvedValue({
      data: { id: "session-1" },
      error: null,
    });
    mockedSupabaseAdmin.single.mockResolvedValue({
      data: { metadata: { title: "Existing Session" } },
      error: null,
    });
  });

  it("handles policy intent correctly", async () => {
    generateChatResponseWithToolsMock
      .mockResolvedValueOnce({
        text: "I'll search for the policy.",
        toolCalls: [{ name: "searchPolicy", args: { query: "eligibility" } }]
      })
      .mockResolvedValueOnce({
        text: "The eligibility criteria involve being registered for 2 years.",
        toolCalls: []
      });

    const response = await chatbotService.handleChat("user-1", "customer", "What is eligibility?");

    expect(response.intent).toBe("policy");
    expect(response.text).toContain("eligibility criteria");
  });

  it("masks PII in lookupData intent for customers", async () => {
    generateChatResponseWithToolsMock
      .mockResolvedValueOnce({
        text: "Looking up your profile.",
        toolCalls: [{ name: "lookupData", args: { dataType: "profile" } }]
      })
      .mockResolvedValueOnce({
        text: "Your email is te***@example.com.",
        toolCalls: []
      });

    // Mock DB response for profile
    mockedSupabaseAdmin.single.mockResolvedValueOnce({
      data: {
        full_name: "Test User",
        email: "test@example.com",
        phone: "0771234567"
      },
      error: null
    });

    const response = await chatbotService.handleChat("user-1", "customer", "Show my profile");

    expect(response.intent).toBe("lookup");
    // The data returned from the tool should be masked (checked in chatbotService implementation)
    expect(response.data.email).toBe("te***@example.com");
  });

  it("does not mask PII for admins", async () => {
    generateChatResponseWithToolsMock
      .mockResolvedValueOnce({
        text: "Looking up profile.",
        toolCalls: [{ name: "lookupData", args: { dataType: "profile" } }]
      })
      .mockResolvedValueOnce({
        text: "The email is test@example.com.",
        toolCalls: []
      });

    mockedSupabaseAdmin.single.mockResolvedValueOnce({
      data: {
        full_name: "Test User",
        email: "test@example.com",
        phone: "0771234567"
      },
      error: null
    });

    const response = await chatbotService.handleChat("admin-1", "admin", "Show user profile");

    expect(response.data.email).toBe("test@example.com");
  });

  it("enforces RLS-like check for predictions", async () => {
    generateChatResponseWithToolsMock
      .mockResolvedValueOnce({
        text: "Running prediction.",
        toolCalls: [{ name: "predictLoanApproval", args: { applicationId: "app-others" } }]
      });

    mockedSupabaseAdmin.single.mockResolvedValueOnce({
      data: { user_id: "other-user" },
      error: null
    });

    await expect(chatbotService.handleChat("customer-1", "customer", "Predict for app-others"))
      .rejects.toThrow(/Not authorized/);
  });

  it("looks up applications by short display id without relying on a relation join", async () => {
    const applicationBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: "3b08a2b6-1111-2222-3333-444444444444",
              user_id: "user-1",
              requested_amount: 2500000,
              status: "under_review",
              purpose: "Working capital",
              created_at: "2026-03-01T10:00:00.000Z",
            },
          ],
          error: null,
        }).then(onFulfilled, onRejected),
    };

    const profilesBuilder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve({
          data: [{ id: "user-1", full_name: "Test User" }],
          error: null,
        }).then(onFulfilled, onRejected),
    };

    mockedSupabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "loan_applications") {
        return applicationBuilder;
      }
      if (table === "profiles") {
        return profilesBuilder;
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const data = await (chatbotService as any).lookupData("user-1", "customer", "application", "#3b08a2b6");

    expect(applicationBuilder.gte).toHaveBeenCalledWith("id", "3b08a2b6-0000-0000-0000-000000000000");
    expect(applicationBuilder.lte).toHaveBeenCalledWith("id", "3b08a2b6-ffff-ffff-ffff-ffffffffffff");
    expect(profilesBuilder.in).toHaveBeenCalledWith("id", ["user-1"]);
    expect(data).toEqual([
      expect.objectContaining({
        id: "3b08a2b6-1111-2222-3333-444444444444",
        applicant: "Test User",
        status: "under_review",
      }),
    ]);
  });
});
