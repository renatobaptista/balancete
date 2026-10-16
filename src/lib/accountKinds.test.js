import { describe, it, expect } from "vitest";
import { ACCOUNT_KINDS, normalizeKind, groupByKind, groupWithInactiveLast } from "./accountKinds";

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

  it("puts inactive accounts last inside each group, keeping the order of each part", () => {
    const inactive = new Set(["A", "C"]);
    const k = { A: "corrente", B: "corrente", C: "corrente", D: "corrente", Nomad: "internacional", Wise: "internacional" };
    const groups = groupByKind(["A", "B", "C", "D", "Nomad", "Wise"], (n) => k[n], (n) => !inactive.has(n));
    expect(groups[0].names).toEqual(["B", "D", "A", "C"]);
    expect(groups[1].names).toEqual(["Nomad", "Wise"]);
  });
});

describe("groupWithInactiveLast", () => {
  const k = { A: "corrente", B: "corrente", Visa: "credito", Old: "credito", Nomad: "internacional" };
  const inactive = new Set(["A", "Old"]);
  const groups = groupWithInactiveLast(["A", "B", "Visa", "Old", "Nomad"], (n) => k[n], (n) => !inactive.has(n));

  it("keeps active accounts in their kind groups", () => {
    expect(groups.map((g) => g.group)).toEqual(["Contas correntes", "Cartões de crédito", "Internacional", "Contas inativas"]);
    expect(groups[0].names).toEqual(["B"]);
    expect(groups[1].names).toEqual(["Visa"]);
  });

  it("collects every inactive account in one final group, grouped by kind order", () => {
    expect(groups[groups.length - 1].names).toEqual(["A", "Old"]);
  });

  it("has no inactive group when everything is active", () => {
    const g = groupWithInactiveLast(["A", "B"], (n) => k[n], () => true);
    expect(g.map((x) => x.group)).toEqual(["Contas correntes"]);
  });
});
