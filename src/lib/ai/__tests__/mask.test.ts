import { describe, it, expect } from "vitest";
import { mask } from "../mask";

describe("mask", () => {
  it("masks bare payee names, keeps merchants", () => {
    expect(mask("RAMESH KULKARNI")).toBe("[NAME]");
    expect(mask("SUNITA MEHTA")).toBe("[NAME]");
    expect(mask("BHAGWATI TIFFIN SERVICE")).toBe("BHAGWATI TIFFIN SERVICE");
    expect(mask("UPI/RAMESH KULKARNI/412129380069/RENT Nov/HDFC")).toBe("UPI/[NAME]/XX0069/RENT Nov/HDFC");
    expect(mask("9876543210@ybl")).toBe("[PHONE]@ybl");
  });
});
