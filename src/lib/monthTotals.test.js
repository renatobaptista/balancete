import { describe, it, expect } from "vitest";
import { monthTotals, dailyMovement } from "./monthTotals";

const inc = (date, account, amount) => ({ type: "income", date, account, amount });
const exp = (date, account, amount) => ({ type: "expense", date, account, amount });
const inv = (date, account, amount) => ({ type: "invest", date, account, amount });
const tr = (date, from, to, amount, toAmount) => ({ type: "transfer", date, fromAccount: from, toAccount: to, amount, toAmount: toAmount ?? amount });

describe("monthTotals without an account filter", () => {
  it("sums income, expense and invest and ignores transfers (they cancel out between own accounts)", () => {
    const t = monthTotals([inc("2026-10-01", "Itau", 1000), exp("2026-10-02", "Itau", 300), inv("2026-10-03", "Itau", 100), tr("2026-10-04", "Itau", "XP", 500)], "");
    expect(t).toEqual({ income: 1000, expense: 300, invest: 100, transferIn: 0, transferOut: 0, balance: 600 });
  });
});

describe("monthTotals with an account filter", () => {
  const entries = [
    inc("2026-10-01", "Itau", 1000),
    exp("2026-10-02", "Itau", 300),
    tr("2026-10-04", "Inter PF", "Itau", 2500),
    tr("2026-10-05", "Itau", "XP", 400),
    tr("2026-10-06", "XP", "Inter PF", 999), // não envolve o Itaú
  ];

  it("counts a received transfer as income and a sent transfer as expense for that account", () => {
    const t = monthTotals(entries, "Itau");
    expect(t.transferIn).toBe(2500);
    expect(t.transferOut).toBe(400);
    expect(t.income).toBe(3500);
    expect(t.expense).toBe(700);
    expect(t.balance).toBe(2800);
  });

  it("uses the received amount for a cross-currency transfer into the filtered account", () => {
    const t = monthTotals([tr("2026-10-04", "Itau", "Nomad USD", 1000, 180)], "Nomad USD");
    expect(t.transferIn).toBe(180);
    expect(t.income).toBe(180);
  });

  it("uses the sent amount for a transfer out of the filtered account", () => {
    const t = monthTotals([tr("2026-10-04", "Itau", "Nomad USD", 1000, 180)], "Itau");
    expect(t.transferOut).toBe(1000);
    expect(t.expense).toBe(1000);
  });

  it("is zero for an account with no movement", () => {
    expect(monthTotals([], "Bolso")).toEqual({ income: 0, expense: 0, invest: 0, transferIn: 0, transferOut: 0, balance: 0 });
  });

  it("ignores transfers that do not involve the filtered account", () => {
    const t = monthTotals([tr("2026-10-06", "XP", "Inter PF", 999)], "Itau");
    expect(t.transferIn).toBe(0);
    expect(t.transferOut).toBe(0);
  });
});

describe("dailyMovement", () => {
  it("returns the net movement per day of month, counting transfers only with a filter", () => {
    const entries = [inc("2026-10-01", "Itau", 1000), exp("2026-10-01", "Itau", 300), tr("2026-10-04", "Inter PF", "Itau", 2500), tr("2026-10-04", "Itau", "XP", 400)];
    expect(dailyMovement(entries, "")).toEqual({ 1: 700 });
    expect(dailyMovement(entries, "Itau")).toEqual({ 1: 700, 4: 2100 });
  });
});
