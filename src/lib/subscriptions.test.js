import { describe, it, expect } from "vitest";
import {
  addMonths, buildSubscriptionEntries, nextSubscriptionEntries, subscriptionStats, lastDateByGroup, isSubscriptionGroup,
} from "./subscriptions";

describe("addMonths", () => {
  it("keeps the day and moves across years", () => {
    expect(addMonths("2026-11-03", 1)).toBe("2026-12-03");
    expect(addMonths("2026-11-03", 2)).toBe("2027-01-03");
    expect(addMonths("2026-11-03", 14)).toBe("2028-01-03");
  });
  it("clamps to the last day of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("buildSubscriptionEntries", () => {
  const base = { type: "expense", amount: 55.9, category: "TV", subcategory: "Streaming", account: "C6", currency: "BRL", description: "Netflix", notes: "" };
  let n = 0;
  const newId = () => "id" + ++n;

  it("creates one linked entry per month, flagged as subscription, without installment numbering", () => {
    const list = buildSubscriptionEntries({ base, startDate: "2026-11-03", months: 3, newId, groupId: "g1" });
    expect(list.map((e) => e.date)).toEqual(["2026-11-03", "2026-12-03", "2027-01-03"]);
    list.forEach((e) => {
      expect(e.installmentGroupId).toBe("g1");
      expect(e.subscription).toBe(true);
      expect(e.installmentCount).toBeUndefined();
      expect(e.installmentNumber).toBeUndefined();
      expect(e.description).toBe("Netflix");
      expect(e.amount).toBe(55.9);
    });
    expect(new Set(list.map((e) => e.id)).size).toBe(3);
  });

  it("clamps the day for every month from the original day", () => {
    const list = buildSubscriptionEntries({ base, startDate: "2026-01-31", months: 3, newId, groupId: "g2" });
    expect(list.map((e) => e.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("nextSubscriptionEntries (estender)", () => {
  const mk = (id, date, over = {}) => ({
    id, date, type: "expense", amount: 30, category: "TV", subcategory: "Streaming", account: "C6", currency: "BRL",
    description: "Spotify", notes: "", installmentGroupId: "g", subscription: true, ...over,
  });
  let n = 0;
  const newId = () => "n" + ++n;

  it("continues after the last entry, copying the last one's values", () => {
    const group = [mk("a", "2026-11-05"), mk("b", "2026-12-05"), mk("c", "2027-01-05", { amount: 34.9 })];
    const next = nextSubscriptionEntries(group, 2, newId);
    expect(next.map((e) => e.date)).toEqual(["2027-02-05", "2027-03-05"]);
    next.forEach((e) => { expect(e.amount).toBe(34.9); expect(e.installmentGroupId).toBe("g"); expect(e.subscription).toBe(true); });
  });

  it("keeps the original day of the month even after a clamped month", () => {
    const group = [mk("a", "2026-12-31"), mk("b", "2027-01-31"), mk("c", "2027-02-28")];
    expect(nextSubscriptionEntries(group, 2, newId).map((e) => e.date)).toEqual(["2027-03-31", "2027-04-30"]);
  });

  it("returns nothing for an empty group", () => {
    expect(nextSubscriptionEntries([], 12, newId)).toEqual([]);
  });
});

describe("subscriptionStats", () => {
  const e = (over) => ({ type: "expense", amount: 10, subscription: true, ...over });
  it("sums only subscription expenses and estimates a year", () => {
    const s = subscriptionStats([e({ amount: 55.9 }), e({ amount: 44.1 }), e({ subscription: false, amount: 999 }), { type: "income", amount: 500, subscription: true }]);
    expect(s.total).toBeCloseTo(100, 2);
    expect(s.count).toBe(2);
    expect(s.yearEstimate).toBeCloseTo(1200, 2);
  });
  it("is zero when there are none", () => {
    expect(subscriptionStats([e({ subscription: false })])).toEqual({ total: 0, count: 0, yearEstimate: 0 });
    expect(subscriptionStats([])).toEqual({ total: 0, count: 0, yearEstimate: 0 });
  });
});

describe("isSubscriptionGroup / lastDateByGroup", () => {
  it("recognizes linked entries without installment count as a subscription group", () => {
    expect(isSubscriptionGroup({ installmentGroupId: "g" })).toBe(true);
    expect(isSubscriptionGroup({ installmentGroupId: "g", installmentCount: 12 })).toBe(false);
    expect(isSubscriptionGroup({})).toBe(false);
  });
  it("finds the last date of each subscription group, ignoring installments", () => {
    const entries = [
      { installmentGroupId: "s", date: "2026-11-01" }, { installmentGroupId: "s", date: "2027-02-01" },
      { installmentGroupId: "p", installmentCount: 3, date: "2027-05-01" }, { date: "2030-01-01" },
    ];
    const m = lastDateByGroup(entries);
    expect(m.get("s")).toBe("2027-02-01");
    expect(m.has("p")).toBe(false);
    expect(m.size).toBe(1);
  });
});
