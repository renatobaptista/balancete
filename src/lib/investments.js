// Resumo dos investimentos: saldo atual por conta do tipo "investimentos", mais o que entrou (aportes) e o
// rendimento no mês escolhido. Contas inativas ficam de fora. Valores sempre na moeda da própria conta.

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * accounts: [{ name, kind, currency, active }]; entries: lançamentos do app; monthPrefix: "YYYY-MM";
 * getBalance(name): saldo atual da conta.
 * Aporte = transferência recebida de uma conta que NÃO é de investimento, menos o que saiu para uma conta que
 * não é de investimento. Transferências entre contas de investimento não contam. Rendimento = entradas menos
 * saídas lançadas direto na conta (sem transferências).
 */
export function monthlyInvestmentReport({ accounts, entries, monthPrefix, getBalance }) {
  const isInvest = new Set(accounts.filter((a) => a.kind === "investimentos").map((a) => a.name));
  const monthEntries = entries.filter((e) => e.date.slice(0, 7) === monthPrefix);

  const build = (currency) => {
    const rows = accounts
      .filter((a) => a.kind === "investimentos" && a.active !== false && (a.currency || "BRL") === currency)
      .map((a) => {
        let aportes = 0;
        let rendimentos = 0;
        for (const e of monthEntries) {
          if (e.type === "transfer") {
            if (e.toAccount === a.name && !isInvest.has(e.fromAccount)) aportes += Number(e.toAmount ?? e.amount);
            else if (e.fromAccount === a.name && !isInvest.has(e.toAccount)) aportes -= Number(e.amount);
          } else if (e.account === a.name) {
            if (e.type === "income") rendimentos += Number(e.amount);
            else if (e.type === "expense") rendimentos -= Number(e.amount);
          }
        }
        return { name: a.name, aportes: round2(aportes), rendimentos: round2(rendimentos), saldo: round2(getBalance(a.name)) };
      })
      .sort((x, y) => y.saldo - x.saldo);
    const totals = {
      aportes: round2(rows.reduce((s, r) => s + r.aportes, 0)),
      rendimentos: round2(rows.reduce((s, r) => s + r.rendimentos, 0)),
      saldo: round2(rows.reduce((s, r) => s + r.saldo, 0)),
    };
    return { rows, totals };
  };

  return { BRL: build("BRL"), USD: build("USD") };
}
