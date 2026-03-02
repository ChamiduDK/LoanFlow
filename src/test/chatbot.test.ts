import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock dependencies
const { generateChatResponseWithToolsMock } = vi.hoisted(() => ({
  generateChatResponseWithToolsMock: vi.fn(),
}));

vi.mock("../../server/services/ai.service", () => ({
  aiService: {
    generateChatResponseWithTools: generateChatResponseWithToolsMock,
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
    single: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../../server/services/audit.service", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { chatbotService } from "../../server/services/chatbot.service";

describe("ChatbotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { supabaseAdmin } = await import("../../server/lib/supabase/client");
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({
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

    const { supabaseAdmin } = await import("../../server/lib/supabase/client");
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({
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

    const { supabaseAdmin } = await import("../../server/lib/supabase/client");
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({
      data: { user_id: "other-user" },
      error: null
    });

    await expect(chatbotService.handleChat("customer-1", "customer", "Predict for app-others"))
      .rejects.toThrow(/Not authorized/);
  });
});
