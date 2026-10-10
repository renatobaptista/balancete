import { describe, it, expect } from "vitest";
import { installmentInfo, findSeries, planAnticipation } from "./installments";

const e = (over) => ({
  id: "x", type: "expense", date: "2026-01-01", description: "", amount: 100, account: "C6 Carbon",
  installmentGroupId: null, installmentNumber: null, installmentCount: null, ...over,
});

describe("installmentInfo", () => {
  it("reads number and total from the structured fields", () => {
    expect(installmentInfo(e({ description: "TV", installmentGroupId: "g", installmentNumber: 2, installmentCount: 10 })))
      .toEqual({ base: "TV", number: 2, count: 10 });
  });
  it("reads '(n / m)' from the description of imported entries", () => {
    expect(installmentInfo(e({ description: "Notebook Asus Rog Strix (Shopee) (4 / 12)" })))
      .toEqual({ base: "Notebook Asus Rog Strix (Shopee)", number: 4, count: 12 });
    expect(installmentInfo(e({ description: "Wellhub Gympass (9/12)" }))).toEqual({ base: "Wellhub Gympass", number: 9, count: 12 });
  });
  it("returns null for a normal entry", () => {
    expect(installmentInfo(e({ description: "Mercado" }))).toBeNull();
  });
});

describe("findSeries", () => {
  const notebook = (n, date, amount = 1099.92, over = {}) =>
    e({ id: "n" + n, date, description: `Notebook Asus (${n} / 12)`, amount, ...over });

  it("finds imported installments by base name, account, total and (approximately) the amount", () => {
    const entries = [
      notebook(3, "2026-09-24", 1099.91),
      notebook(4, "2026-10-24"),
      notebook(5, "2026-11-24"),
      notebook(4, "2026-10-24", 1099.92, { id: "outra", account: "C6" }), // outra conta
      e({ id: "outro", date: "2026-10-24", description: "Notebook Asus (4 / 6)" }), // outro total
      e({ id: "preco", date: "2026-10-24", description: "Notebook Asus (4 / 12)", amount: 50 }), // outro valor
    ];
    const series = findSeries(entries[1], entries);
    expect(series.map((s) => s.id)).toEqual(["n3", "n4", "n5"]);
  });

  it("finds installments created in the app by installmentGroupId", () => {
    const g = (n, date) => e({ id: "g" + n, date, description: "Sofá", installmentGroupId: "grp", installmentNumber: n, installmentCount: 3 });
    const entries = [g(2, "2026-11-10"), g(1, "2026-10-10"), g(3, "2026-12-10"), e({ id: "z", description: "Sofá", installmentGroupId: "outro", installmentNumber: 1, installmentCount: 3 })];
    expect(findSeries(entries[0], entries).map((s) => s.id)).toEqual(["g1", "g2", "g3"]);
  });

  it("returns an empty list for an entry that is not an installment", () => {
    expect(findSeries(e({ description: "Mercado" }), [e({ description: "Mercado" })])).toEqual([]);
  });
});

describe("planAnticipation", () => {
  const series = [
    e({ id: "a", date: "2026-09-24", description: "Nb (3 / 6)" }),
    e({ id: "b", date: "2026-10-24", description: "Nb (4 / 6)" }),
    e({ id: "c", date: "2026-11-24", description: "Nb (5 / 6)" }),
    e({ id: "d", date: "2026-12-24", description: "Nb (6 / 6)" }),
  ];
  const today = "2026-10-10";

  it("moves every future installment to the chosen date", () => {
    const plan = planAnticipation(series, "2026-10-10", today);
    expect(plan.error).toBe("");
    expect(plan.moves).toEqual([
      { id: "b", number: 4, count: 6, from: "2026-10-24", to: "2026-10-10", amount: 100 },
      { id: "c", number: 5, count: 6, from: "2026-11-24", to: "2026-10-10", amount: 100 },
      { id: "d", number: 6, count: 6, from: "2026-12-24", to: "2026-10-10", amount: 100 },
    ]);
    expect(plan.total).toBe(300);
  });

  it("rejects a date that is not before the next installment", () => {
    expect(planAnticipation(series, "2026-10-24", today).error).toMatch(/24\/10\/2026/);
    expect(planAnticipation(series, "2026-11-01", today).error).toMatch(/antes de/);
  });

  it("requires a date", () => {
    expect(planAnticipation(series, "", today).error).toMatch(/data/i);
  });

  it("explains when there is nothing to anticipate", () => {
    const plan = planAnticipation(series.slice(0, 1), "2026-10-10", today);
    expect(plan.moves).toEqual([]);
    expect(plan.error).toMatch(/parcelas futuras/);
  });
});
