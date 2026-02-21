import { describe, expect, it } from "vitest";
import { calculateEmi } from "@/lib/loan";
import { formatLKR } from "@/lib/currency";

describe("loan math utilities", () => {
  it("calculates EMI for a reducing balance loan", () => {
    const emi = calculateEmi(5000000, 14, 36);
    expect(emi).toBeGreaterThan(0);
    expect(emi).toBe(170888);
  });

  it("formats LKR values", () => {
    expect(formatLKR(1500000)).toContain("LKR");
  });
});
