import { describe, it, expect } from "vitest";
import { ACCOUNT_KINDS, normalizeKind, groupByKind } from "./accountKinds";

describe("ACCOUNT_KINDS", () => {
  it("has the four kinds in display order", () => {
    expect(ACCOUNT_KINDS.map((k) => k.value)).toEqual(["corrente", "credito", "internacional", "investimentos"]);
  });
});

describe("normalizeKind", () => {
  it("keeps known kinds and falls back to corrente for unknown or missing ones", () => {
    expect(normalizeKind("internacional")).toBe("internacional");
    expect(normalizeKind("investimentos")).toBe("investimentos");
    expect(normalizeKind("coisa-estranha")).toBe("corrente");
    expect(normalizeKind(undefined)).toBe("corrente");
  });
});

describe("groupByKind", () => {
  const kinds = { Itau: "corrente", Visa: "credito", Nomad: "internacional", XP: "investimentos", Bolso: undefined };
  const getKind = (name) => kinds[name];

  it("groups names by kind in display order and skips empty groups", () => {
    const groups = groupByKind(["XP", "Nomad", "Itau", "Bolso"], getKind);
    expect(groups.map((g) => g.value)).toEqual(["corrente", "internacional", "investimentos"]);
    expect(groups[0].names).toEqual(["Itau", "Bolso"]); // Bolso sem tipo conta como corrente
    expect(groups[0].group).toBe("Contas correntes");
    expect(groups[1].group).toBe("Internacional");
  });

  it("keeps the incoming order of names inside a group", () => {
    const groups = groupByKind(["Visa", "Itau"], getKind);
    expect(groups.map((g) => g.names)).toEqual([["Itau"], ["Visa"]]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByKind([], getKind)).toEqual([]);
  });
});
