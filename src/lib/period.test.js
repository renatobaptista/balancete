import { describe, it, expect } from "vitest";
import { presetRange, validateRange, entriesInRange, periodSummary } from "./period";

describe("presetRange", () => {
  it("last 30 and 90 days end today and include today", () => {
    expect(presetRange("last30", "2026-10-14")).toEqual({ start: "2026-09-15", end: "2026-10-14" });
    expect(presetRange("last90", "2026-10-14")).toEqual({ start: "2026-07-17", end: "2026-10-14" });
  });
  it("this year goes from January 1st to today", () => {
    expect(presetRange("year", "2026-10-14")).toEqual({ start: "2026-01-01", end: "2026-10-14" });
  });
  it("handles month and year boundaries", () => {
    expect(presetRange("last30", "2026-01-10")).toEqual({ start: "2025-12-12", end: "2026-01-10" });
  });
  it("returns null for an unknown preset", () => {
    expect(presetRange("nope", "2026-10-14")).toBeNull();
  });
});

describe("validateRange", () => {
  it("accepts a valid range, including a single day", () => {
    expect(validateRange("2026-05-01", "2026-07-31")).toBe("");
    expect(validateRange("2026-05-10", "2026-05-10")).toBe("");
  });
  it("asks for both dates", () => {
    expect(validateRange("", "2026-07-31")).toMatch(/data/i);
    expect(validateRange("2026-05-01", "")).toMatch(/data/i);
  });
  it("rejects a start after the end", () => {
    expect(validateRange("2026-08-01", "2026-07-31")).toMatch(/antes/);
  });
});

describe("entriesInRange", () => {
  const e = (id, date) => ({ id, date, type: "expense", amount: 1 });
  const list = [e("a", "2026-04-30"), e("b", "2026-05-01"), e("c", "2026-06-15"), e("d", "2026-07-31"), e("f", "2026-08-01")];
  it("keeps entries inside the range, inclusive on both ends", () => {
    expect(entriesInRange(list, "2026-05-01", "2026-07-31").map((x) => x.id)).toEqual(["b", "c", "d"]);
  });
  it("returns nothing for an empty range", () => {
    expect(entriesInRange(list, "2027-01-01", "2027-01-31")).toEqual([]);
  });
});

describe("periodSummary", () => {
  const inc = (amount) => ({ type: "income", amount, date: "2026-05-02", account: "Itau" });
  const exp = (amount) => ({ type: "expense", amount, date: "2026-05-03", account: "Itau" });
  const tr = (from, to, amount) => ({ type: "transfer", amount, toAmount: amount, date: "2026-05-04", fromAccount: from, toAccount: to });

  it("counts entries and sums income and expense; transfers are ignored without an account filter", () => {
    const s = periodSummary([inc(1000), exp(300), tr("Itau", "XP", 200)], "");
    expect(s.count).toBe(3);
    expect(s.income).toBe(1000);
    expect(s.expense).toBe(300);
    expect(s.balance).toBe(700);
  });

  it("with an account filter, transfers count as income (received) and expense (sent)", () => {
    const s = periodSummary([inc(1000), exp(300), tr("Itau", "XP", 200), tr("Inter PF", "Itau", 50)], "Itau");
    expect(s.income).toBe(1050);
    expect(s.expense).toBe(500);
    expect(s.balance).toBe(550);
  });

  it("is all zero for no entries", () => {
    expect(periodSummary([], "")).toEqual({ count: 0, income: 0, expense: 0, invest: 0, transferIn: 0, transferOut: 0, balance: 0 });
  });
});
