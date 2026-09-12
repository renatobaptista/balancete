import { describe, it, expect } from "vitest";
import {
  toEntryRow, fromEntryRow, toAccountRow, fromAccountRow,
  fromCategoryRows, toGoalsRow, fromGoalsRow, fromRuleRows,
} from "./mappers";

describe("entry mappers", () => {
  it("round-trips a simple expense entry", () => {
    const entry = {
      id: "11111111-1111-1111-1111-111111111111",
      type: "expense",
      amount: 42.5,
      category: "Moradia",
      subcategory: "Aluguel",
      account: "Nubank",
      currency: "BRL",
      description: "Aluguel setembro",
      notes: "",
      date: "2026-09-01",
    };
    const row = toEntryRow(entry, "user-1");
    expect(row).toMatchObject({
      id: entry.id, user_id: "user-1", type: "expense", amount: 42.5,
      category: "Moradia", subcategory: "Aluguel", account: "Nubank",
      currency: "BRL", description: "Aluguel setembro", date: "2026-09-01",
      from_account: null, to_account: null, to_amount: null,
    });
    expect(fromEntryRow(row)).toEqual(entry);
  });

  it("round-trips an installment entry", () => {
    const entry = {
      id: "22222222-2222-2222-2222-222222222222",
      type: "expense",
      amount: 100,
      category: "Lazer",
      subcategory: "Geral",
      account: "Cartão",
      currency: "BRL",
      description: "Notebook 03/12",
      notes: "",
      date: "2026-09-05",
      installmentGroupId: "33333333-3333-3333-3333-333333333333",
      installmentNumber: 3,
      installmentCount: 12,
    };
    const row = toEntryRow(entry, "user-1");
    expect(row.installment_group_id).toBe(entry.installmentGroupId);
    expect(fromEntryRow(row)).toEqual(entry);
  });

  it("round-trips a transfer entry", () => {
    const entry = {
      id: "44444444-4444-4444-4444-444444444444",
      type: "transfer",
      amount: 200,
      toAmount: 200,
      fromCurrency: "BRL",
      toCurrency: "BRL",
      fromAccount: "Nubank",
      toAccount: "Inter",
      description: "Reserva",
      notes: "",
      date: "2026-09-02",
    };
    const row = toEntryRow(entry, "user-1");
    expect(row).toMatchObject({
      type: "transfer", from_account: "Nubank", to_account: "Inter",
      to_amount: 200, category: null, subcategory: null, account: null,
    });
    expect(fromEntryRow(row)).toEqual(entry);
  });
});

describe("account mappers", () => {
  it("round-trips an account", () => {
    const row = {
      id: "acc-1", user_id: "user-1", name: "Nubank", kind: "corrente",
      currency: "BRL", active: true, initial_balance: "150.30",
    };
    expect(fromAccountRow(row)).toEqual({
      id: "acc-1", name: "Nubank", kind: "corrente", currency: "BRL",
      active: true, initialBalance: 150.3,
    });
    expect(toAccountRow({ name: "Nubank", kind: "corrente", currency: "BRL", active: true, initialBalance: 150.3 }, "user-1"))
      .toEqual({ user_id: "user-1", name: "Nubank", kind: "corrente", currency: "BRL", active: true, initial_balance: 150.3 });
  });
});

describe("category mappers", () => {
  it("builds the nested {type: {name: [subs]}} shape from rows", () => {
    const rows = [
      { type: "expense", name: "Moradia", subcategories: ["Aluguel", "Luz"] },
      { type: "income", name: "Salário", subcategories: [] },
    ];
    expect(fromCategoryRows(rows)).toEqual({
      income: { "Salário": [] },
      expense: { "Moradia": ["Aluguel", "Luz"] },
      invest: {},
    });
  });
});

describe("goals mappers", () => {
  it("round-trips goals", () => {
    const goals = { limits: { Moradia: 1000 }, investTarget: 5000 };
    const row = toGoalsRow(goals, "user-1");
    expect(row).toEqual({ user_id: "user-1", limits: { Moradia: 1000 }, invest_target: 5000 });
    expect(fromGoalsRow(row)).toEqual(goals);
    expect(fromGoalsRow(null)).toEqual({ limits: {}, investTarget: 0 });
  });
});

describe("rule mappers", () => {
  it("builds a flat {raw_key: data} map from rows", () => {
    const rows = [
      { raw_key: "ipva", data: { type: "expense", category: "Impostos", subcategory: "IPVA", ignore: false } },
    ];
    expect(fromRuleRows(rows)).toEqual({
      ipva: { type: "expense", category: "Impostos", subcategory: "IPVA", ignore: false },
    });
  });
});
