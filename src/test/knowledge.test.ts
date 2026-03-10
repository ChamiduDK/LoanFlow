import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock AI Service
const { embedContentMock } = vi.hoisted(() => ({
  embedContentMock: vi.fn(),
}));

vi.mock("../../server/services/ai.service", () => ({
  aiService: {
    embedContent: embedContentMock,
  },
}));

import { knowledgeService } from "../../server/services/knowledge.service";

describe("KnowledgeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates cosine similarity correctly", () => {
    const a = [1, 0];
    const b = [1, 0];
    // @ts-expect-error access internal helper for focused unit test
    expect(knowledgeService.cosineSimilarity(a, b)).toBeCloseTo(1);

    const c = [0, 1];
    // @ts-expect-error access internal helper for focused unit test
    expect(knowledgeService.cosineSimilarity(a, c)).toBeCloseTo(0);

    const d = [-1, 0];
    // @ts-expect-error access internal helper for focused unit test
    expect(knowledgeService.cosineSimilarity(a, d)).toBeCloseTo(-1);
  });

  it("chunks text reasonably", () => {
    const text = "Para 1\n\nPara 2\n\nPara 3";
    // @ts-expect-error access internal helper for focused unit test
    const chunks = knowledgeService.chunkText(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toContain("Para 1");
  });

  it("retrieves relevant chunks", async () => {
    // Mock index data
    // @ts-expect-error set internal state for focused retrieval unit test
    knowledgeService.chunks = [
      { id: "1", filename: "test.md", content: "Loan eligibility is 2 years.", embedding: [1, 0], metadata: { index: 0 } },
      { id: "2", filename: "test.md", content: "Repayment is monthly.", embedding: [0, 1], metadata: { index: 1 } }
    ];
    // @ts-expect-error set internal state for focused retrieval unit test
    knowledgeService.isLoaded = true;

    embedContentMock.mockResolvedValue([1, 0.1]); // Closer to "eligibility"

    const results = await knowledgeService.retrieveRelevant("How to be eligible?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("eligibility");
  });
});
