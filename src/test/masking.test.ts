import { describe, expect, it } from "vitest";
import { maskPii } from "../../server/lib/format";

describe("maskPii", () => {
  it("masks emails correctly", () => {
    expect(maskPii("test@example.com", "email")).toBe("te***@example.com");
    expect(maskPii("a@b.com", "email")).toBe("a***@b.com");
  });

  it("masks phone numbers correctly", () => {
    expect(maskPii("0771234567", "phone")).toBe("077****567");
  });

  it("masks NIC correctly", () => {
    expect(maskPii("123456789V", "nic")).toBe("12****9V");
  });

  it("masks bank accounts correctly", () => {
    expect(maskPii("1234567890", "account")).toBe("****7890");
  });

  it("returns N/A for empty values", () => {
    expect(maskPii(null, "email")).toBe("N/A");
    expect(maskPii("", "email")).toBe("N/A");
  });
});
