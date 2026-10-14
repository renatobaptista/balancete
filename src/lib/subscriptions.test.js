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
  const e = (over) => ({ type: "expense", amount: 10, subscription: true, description: "Netflix", account: "C6", ...over });

  it("sums only subscription expenses", () => {
    const s = subscriptionStats([e({ description: "A", amount: 55.9 }), e({ description: "B", amount: 44.1 }), e({ subscription: false, amount: 999 }), { type: "income", amount: 500, subscription: false }]);
    expect(s.total).toBeCloseTo(100, 2);
    expect(s.count).toBe(2);
    expect(s.refunds).toBe(0);
  });

  it("counts distinct subscriptions: same name and account count once, even with several entries in the month", () => {
    const duo = (amount) => e({ description: "Duo Gourmet", account: "Inter Black", amount });
    const s = subscriptionStats([duo(59), duo(59), duo(59), e({ description: "Netflix", account: "C6", amount: 55.9 })]);
    expect(s.total).toBeCloseTo(232.9, 2); // 3 x 59 + 55,90
    expect(s.count).toBe(2);
  });

  it("treats the same name on different accounts as different subscriptions, ignoring case, accents and (n / m)", () => {
    const s = subscriptionStats([
      e({ description: "iCloud", account: "Nomad" }), e({ description: "ICLOUD", account: "Nomad" }),
      e({ description: "iCloud", account: "Itau" }),
      e({ description: "Livelo (10 / 12)", account: "C6 Carbon" }), e({ description: "livelo", account: "C6 Carbon" }),
    ]);
    expect(s.count).toBe(3);
  });

  it("estimates a year as 12 x the monthly charge of each distinct subscription (the largest entry), not 12 x the month total", () => {
    const duo = (amount) => e({ description: "Duo Gourmet", account: "Inter Black", amount });
    // 12 parcelas de 59 no mesmo mês = total 708, mas a assinatura custa 59 por mês
    const parcelas = Array.from({ length: 12 }, () => duo(59));
    const s = subscriptionStats([...parcelas, e({ description: "Netflix", account: "C6", amount: 55.9 })]);
    expect(s.total).toBeCloseTo(763.9, 2);
    expect(s.yearEstimate).toBeCloseTo(12 * (59 + 55.9), 2);
  });

  it("matches the user's dollar example: 9,99 + 19,90 per month is 358,68 per year", () => {
    const s = subscriptionStats([
      e({ description: "iCloud", account: "Nomad USD", amount: 9.99 }),
      e({ description: "Apple Care", account: "Nomad USD", amount: 19.9 }),
    ]);
    expect(s.total).toBeCloseTo(29.89, 2);
    expect(s.count).toBe(2);
    expect(s.yearEstimate).toBeCloseTo(358.68, 2);
  });

  it("subtracts refunds from the total but not from the yearly estimate, and does not count them", () => {
    const s = subscriptionStats([
      e({ description: "A", amount: 59 }), e({ description: "B", amount: 59 }),
      { type: "income", amount: 50, subscription: true, description: "Estorno A", account: "C6" },
      { type: "income", amount: 999, subscription: false }, // entrada comum, ignorada
    ]);
    expect(s.refunds).toBe(50);
    expect(s.total).toBeCloseTo(68, 2); // 118 - 50
    expect(s.count).toBe(2);
    expect(s.yearEstimate).toBeCloseTo(12 * 118, 2);
  });

  it("can go negative when the refund is larger than the charges of the month", () => {
    const s = subscriptionStats([e({ amount: 59 }), { type: "income", amount: 708, subscription: true }]);
    expect(s.total).toBeCloseTo(-649, 2);
  });

  it("is zero when there are none", () => {
    expect(subscriptionStats([e({ subscription: false })])).toEqual({ total: 0, count: 0, refunds: 0, yearEstimate: 0 });
    expect(subscriptionStats([])).toEqual({ total: 0, count: 0, refunds: 0, yearEstimate: 0 });
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
