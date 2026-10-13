// Resumo dos investimentos. Valores sempre na moeda da própria conta.
//
// Sem filtro de conta (mode "all"): saldo atual de cada conta do tipo "investimentos" ativa, mais aportes e
// rendimento no mês escolhido.
// Filtro em uma conta de investimento (mode "investment"): só essa conta.
// Filtro em outra conta (mode "source"): só o que essa conta enviou para contas de investimento no mês.
//
// Aporte = transferência recebida de uma conta que NÃO é de investimento, menos o que saiu para uma conta que
// não é de investimento. Transferências entre contas de investimento não contam.
// Rendimento = entradas menos saídas lançadas direto na conta (sem transferências).

const round2 = (n) => Math.round(n * 100) / 100;
const EMPTY = () => ({ rows: [], totals: { aportes: 0, rendimentos: 0, saldo: 0 } });

export function monthlyInvestmentReport({ accounts, entries, monthPrefix, getBalance, accountFilter = "" }) {
  const isInvest = new Set(accounts.filter((a) => a.kind === "investimentos").map((a) => a.name));
  const monthEntries = entries.filter((e) => e.date.slice(0, 7) === monthPrefix);

  // aporte (e rendimento) de uma conta de investimento no mês; `onlyFrom` limita aos aportes vindos de uma conta
  const figures = (a, onlyFrom) => {
    let aportes = 0;
    let rendimentos = 0;
    for (const e of monthEntries) {
      if (e.type === "transfer") {
        if (e.toAccount === a.name && !isInvest.has(e.fromAccount) && (!onlyFrom || e.fromAccount === onlyFrom)) {
          aportes += Number(e.toAmount ?? e.amount);
        } else if (e.fromAccount === a.name && !isInvest.has(e.toAccount) && (!onlyFrom || e.toAccount === onlyFrom)) {
          aportes -= Number(e.amount);
        }
      } else if (!onlyFrom && e.account === a.name) {
        if (e.type === "income") rendimentos += Number(e.amount);
        else if (e.type === "expense") rendimentos -= Number(e.amount);
      }
    }
    return { aportes: round2(aportes), rendimentos: round2(rendimentos) };
  };

  const makeRow = (a, onlyFrom) => ({ name: a.name, ...figures(a, onlyFrom), saldo: round2(getBalance(a.name)) });
  const summarize = (rows) => ({
    rows,
    totals: {
      aportes: round2(rows.reduce((s, r) => s + r.aportes, 0)),
      rendimentos: round2(rows.reduce((s, r) => s + r.rendimentos, 0)),
      saldo: round2(rows.reduce((s, r) => s + r.saldo, 0)),
    },
  });
  const cur = (a) => a.currency || "BRL";

  if (accountFilter && isInvest.has(accountFilter)) {
    const a = accounts.find((x) => x.name === accountFilter);
    const out = { mode: "investment", BRL: EMPTY(), USD: EMPTY() };
    out[cur(a) === "USD" ? "USD" : "BRL"] = summarize([makeRow(a, null)]);
    return out;
  }

  const activeInvest = accounts.filter((a) => a.kind === "investimentos" && a.active !== false);

  if (accountFilter) {
    const build = (currency) => summarize(
      activeInvest
        .filter((a) => cur(a) === currency)
        .map((a) => makeRow(a, accountFilter))
        .filter((r) => r.aportes !== 0)
        .sort((x, y) => y.aportes - x.aportes)
    );
    return { mode: "source", BRL: build("BRL"), USD: build("USD") };
  }

  const build = (currency) => summarize(
    activeInvest.filter((a) => cur(a) === currency).map((a) => makeRow(a, null)).sort((x, y) => y.saldo - x.saldo)
  );
  return { mode: "all", BRL: build("BRL"), USD: build("USD") };
}
