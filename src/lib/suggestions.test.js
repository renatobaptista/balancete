import { describe, it, expect } from "vitest";
import { suggestFromHistory } from "./suggestions";

const e = (over) => ({ id: Math.random(), type: "expense", description: "Netflix", category: "Casa", subcategory: "TV", account: "C6 Carbon", amount: 55.9, date: "2026-05-10", ...over });
const TODAY = "2026-10-15";

describe("suggestFromHistory", () => {
  it("copies type, category, subcategory, account and amount from the most recent match", () => {
    const list = [e({ date: "2026-03-10", amount: 44.9, account: "Inter Black" }), e({ date: "2026-08-10", amount: 55.9 })];
    expect(suggestFromHistory(list, "Netflix", TODAY)).toEqual({
      type: "expense", category: "Casa", subcategory: "TV", account: "C6 Carbon", amount: 55.9,
    });
  });

  it("ignores accents, case, extra spaces and the (n/m) installment suffix", () => {
    const list = [e({ description: "Seguro Cartão (3 / 12)", category: "Bancos", subcategory: "Seguro" })];
    expect(suggestFromHistory(list, "  seguro   cartao ", TODAY).category).toBe("Bancos");
    expect(suggestFromHistory(list, "Seguro Cartão (4/12)", TODAY).category).toBe("Bancos");
  });

  it("prefers entries that already happened over future ones", () => {
    const list = [e({ date: "2027-01-10", amount: 70 }), e({ date: "2026-09-10", amount: 55.9 })];
    expect(suggestFromHistory(list, "Netflix", TODAY).amount).toBe(55.9);
  });

  it("falls back to the latest future entry when there is no past one", () => {
    const list = [e({ date: "2026-12-10", amount: 60 }), e({ date: "2027-01-10", amount: 70 })];
    expect(suggestFromHistory(list, "Netflix", TODAY).amount).toBe(70);
  });

  it("skips transfers and entries without category", () => {
    const list = [e({ type: "transfer", description: "Netflix", category: undefined }), e({ category: "", date: "2026-09-01" })];
    expect(suggestFromHistory(list, "Netflix", TODAY)).toBeNull();
  });

  it("returns null for an unknown or empty description", () => {
    expect(suggestFromHistory([e()], "Spotify", TODAY)).toBeNull();
    expect(suggestFromHistory([e()], "   ", TODAY)).toBeNull();
  });

  it("works for income and investment types too", () => {
    const list = [e({ type: "income", description: "Salário", category: "Salário", subcategory: "", amount: 5000, date: "2026-10-05" })];
    expect(suggestFromHistory(list, "salario", TODAY)).toMatchObject({ type: "income", amount: 5000, subcategory: "" });
  });
});
