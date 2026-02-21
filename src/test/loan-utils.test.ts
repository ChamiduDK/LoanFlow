import { describe, expect, it } from "vitest";
import { calculateEmi } from "@/lib/loan";
import { formatLKR } from "@/lib/currency";

describe("loan math utilities", () => {
  it("calculates EMI for a reducing balance loan", () => {
    const emi = calculateEmi(5000000, 14, 36);
    expect(emi).toBeGreaterThan(0);
    expect(emi).toBe(170888);
  });

  it("calculates EMI correctly for 0% interest rate (simple division)", () => {
    const principal = 1_200_000;
    const tenure = 12;
    const emi = calculateEmi(principal, 0, tenure);
    expect(emi).toBe(Math.round(principal / tenure));
  });

  it("formats LKR values", () => {
    expect(formatLKR(1500000)).toContain("LKR");
  });

  it("formats LKR(0) without throwing", () => {
    expect(() => formatLKR(0)).not.toThrow();
    expect(formatLKR(0)).toContain("LKR");
  });

  it("formats negative LKR amounts without throwing", () => {
    expect(() => formatLKR(-500)).not.toThrow();
    expect(formatLKR(-500)).toContain("LKR");
  });
});
