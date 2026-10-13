import { describe, it, expect } from "vitest";
import { monthlyInvestmentReport } from "./investments";

const accounts = [
  { name: "Itau", kind: "corrente", currency: "BRL", active: true },
  { name: "Inter PF", kind: "corrente", currency: "BRL", active: true },
  { name: "Inter Invest", kind: "investimentos", currency: "BRL", active: true },
  { name: "XP", kind: "investimentos", currency: "BRL", active: true },
  { name: "FTX", kind: "investimentos", currency: "BRL", active: false },
  { name: "Nomad Invest", kind: "investimentos", currency: "USD", active: true },
  { name: "Nomad USD", kind: "internacional", currency: "USD", active: true },
];

const transfer = (id, date, from, to, amount, toAmount) => ({ id, type: "transfer", date, fromAccount: from, toAccount: to, amount, toAmount: toAmount ?? amount });
const plain = (id, date, type, account, amount) => ({ id, type, date, account, amount });

const balances = { "Inter Invest": 1000, XP: 500, FTX: 5500, "Nomad Invest": 300 };
const report = (entries, month = "2026-10") =>
  monthlyInvestmentReport({ accounts, entries, monthPrefix: month, getBalance: (n) => balances[n] ?? 0 });

describe("monthlyInvestmentReport", () => {
  it("lists only active investment accounts, split by currency", () => {
    const r = report([]);
    expect(r.BRL.rows.map((x) => x.name)).toEqual(["Inter Invest", "XP"]);
    expect(r.USD.rows.map((x) => x.name)).toEqual(["Nomad Invest"]);
  });

  it("counts transfers from non-investment accounts as contributions", () => {
    const r = report([transfer("1", "2026-10-05", "Itau", "Inter Invest", 2000), transfer("2", "2026-10-20", "Inter PF", "XP", 500)]);
    expect(r.BRL.rows.find((x) => x.name === "Inter Invest").aportes).toBe(2000);
    expect(r.BRL.rows.find((x) => x.name === "XP").aportes).toBe(500);
    expect(r.BRL.totals.aportes).toBe(2500);
  });

  it("subtracts withdrawals to non-investment accounts", () => {
    const r = report([transfer("1", "2026-10-05", "Itau", "Inter Invest", 2000), transfer("2", "2026-10-09", "Inter Invest", "Itau", 500)]);
    expect(r.BRL.rows.find((x) => x.name === "Inter Invest").aportes).toBe(1500);
  });

  it("ignores transfers between two investment accounts", () => {
    const r = report([transfer("1", "2026-10-05", "XP", "Inter Invest", 700)]);
    expect(r.BRL.totals.aportes).toBe(0);
  });

  it("uses the received amount for a dollar investment account", () => {
    const r = report([transfer("1", "2026-10-05", "Itau", "Nomad Invest", 1000, 180)]);
    expect(r.USD.rows[0].aportes).toBe(180);
    expect(r.BRL.totals.aportes).toBe(0);
  });

  it("only counts the chosen month", () => {
    const r = report([transfer("1", "2026-09-30", "Itau", "XP", 900), transfer("2", "2026-10-01", "Itau", "XP", 100)]);
    expect(r.BRL.rows.find((x) => x.name === "XP").aportes).toBe(100);
  });

  it("computes yield as direct incomes minus expenses on the account", () => {
    const r = report([
      plain("1", "2026-10-17", "income", "XP", 138.67),
      plain("2", "2026-10-17", "expense", "XP", 21.45),
      plain("3", "2026-10-17", "income", "Itau", 999), // conta que não é de investimento
    ]);
    expect(r.BRL.rows.find((x) => x.name === "XP").rendimentos).toBeCloseTo(117.22, 2);
    expect(r.BRL.totals.rendimentos).toBeCloseTo(117.22, 2);
  });

  it("shows current balance per account and total", () => {
    const r = report([]);
    expect(r.BRL.rows.find((x) => x.name === "Inter Invest").saldo).toBe(1000);
    expect(r.BRL.totals.saldo).toBe(1500); // FTX inativa fica de fora
    expect(r.USD.totals.saldo).toBe(300);
  });

  describe("with an account filter", () => {
    const entries = [
      transfer("1", "2026-10-05", "Itau", "Inter Invest", 2000),
      transfer("2", "2026-10-06", "Inter PF", "Inter Invest", 700),
      transfer("3", "2026-10-07", "Itau", "XP", 300),
      transfer("4", "2026-10-09", "XP", "Itau", 100),
      transfer("5", "2026-10-10", "Itau", "Nomad Invest", 1000, 180),
      plain("6", "2026-10-12", "income", "XP", 40),
    ];
    const reportFor = (accountFilter) => monthlyInvestmentReport({
      accounts, entries, monthPrefix: "2026-10", getBalance: (n) => balances[n] ?? 0, accountFilter,
    });

    it("has mode 'all' without a filter", () => {
      expect(report(entries).mode).toBe("all");
      expect(reportFor("").mode).toBe("all");
    });

    it("for a non-investment account, shows only what that account sent to investments (net of returns)", () => {
      const r = reportFor("Itau");
      expect(r.mode).toBe("source");
      expect(r.BRL.rows.map((x) => [x.name, x.aportes])).toEqual([["Inter Invest", 2000], ["XP", 200]]);
      expect(r.BRL.totals.aportes).toBe(2200);
      expect(r.USD.rows.map((x) => [x.name, x.aportes])).toEqual([["Nomad Invest", 180]]);
    });

    it("for a non-investment account with no contributions, has no rows", () => {
      const r = reportFor("Nomad USD");
      expect(r.mode).toBe("source");
      expect(r.BRL.rows).toEqual([]);
      expect(r.BRL.totals).toEqual({ aportes: 0, rendimentos: 0, saldo: 0 });
      expect(r.USD.rows).toEqual([]);
    });

    it("for an investment account, shows only that account in its own currency", () => {
      const r = reportFor("XP");
      expect(r.mode).toBe("investment");
      expect(r.BRL.rows.map((x) => x.name)).toEqual(["XP"]);
      expect(r.BRL.rows[0].aportes).toBe(200);
      expect(r.BRL.rows[0].rendimentos).toBe(40);
      expect(r.BRL.totals.saldo).toBe(500);
      expect(r.USD.rows).toEqual([]);
      const d = reportFor("Nomad Invest");
      expect(d.USD.rows.map((x) => x.name)).toEqual(["Nomad Invest"]);
      expect(d.BRL.rows).toEqual([]);
    });

    it("keeps an inactive investment account when it is the one being filtered", () => {
      const r = reportFor("FTX");
      expect(r.mode).toBe("investment");
      expect(r.BRL.rows.map((x) => x.name)).toEqual(["FTX"]);
    });
  });

  it("returns empty totals when there are no investment accounts in a currency", () => {
    const r = monthlyInvestmentReport({ accounts: [accounts[0]], entries: [], monthPrefix: "2026-10", getBalance: () => 0 });
    expect(r.BRL).toEqual({ rows: [], totals: { aportes: 0, rendimentos: 0, saldo: 0 } });
    expect(r.USD).toEqual({ rows: [], totals: { aportes: 0, rendimentos: 0, saldo: 0 } });
  });
});
