import { describe, it, expect } from "vitest";
import {
  profileFromMetadata, profileToMetadata, validatePasswordChange, validateEmailChange,
} from "./profile";

describe("profile mappers", () => {
  it("fills every field with an empty string when metadata is missing", () => {
    expect(profileFromMetadata(undefined)).toEqual({
      name: "", phone: "", birthDate: "", sex: "", country: "", state: "", city: "",
    });
  });

  it("reads the personal fields from user metadata and ignores the rest", () => {
    const meta = { name: "Renato", birth_date: "1990-05-20", sex: "masculino", city: "Rio de Janeiro", default_account: "C6" };
    const p = profileFromMetadata(meta);
    expect(p.name).toBe("Renato");
    expect(p.birthDate).toBe("1990-05-20");
    expect(p.sex).toBe("masculino");
    expect(p.city).toBe("Rio de Janeiro");
    expect(p.phone).toBe("");
  });

  it("writes only the personal fields, trimmed, and never touches other metadata keys", () => {
    const meta = profileToMetadata({ name: "  Renato ", phone: "", birthDate: "1990-05-20", sex: "", country: "Brasil", state: "RJ", city: " Niterói" });
    expect(meta).toEqual({ name: "Renato", phone: "", birth_date: "1990-05-20", sex: "", country: "Brasil", state: "RJ", city: "Niterói" });
    expect(meta).not.toHaveProperty("default_account");
  });
});

describe("validatePasswordChange", () => {
  it("rejects passwords shorter than 6 characters", () => {
    expect(validatePasswordChange("12345", "12345")).toMatch(/6 caracteres/);
  });
  it("rejects when the confirmation differs", () => {
    expect(validatePasswordChange("abcdef", "abcdeg")).toMatch(/iguais/);
  });
  it("accepts a valid matching password", () => {
    expect(validatePasswordChange("abcdef", "abcdef")).toBe("");
  });
});

describe("validateEmailChange", () => {
  it("rejects an invalid address", () => {
    expect(validateEmailChange("sem-arroba", "a@b.com")).toMatch(/válido/);
  });
  it("rejects the same address as the current one (ignoring case)", () => {
    expect(validateEmailChange("A@B.com", "a@b.com")).toMatch(/atual/);
  });
  it("accepts a different valid address", () => {
    expect(validateEmailChange("novo@b.com", "a@b.com")).toBe("");
  });
});
