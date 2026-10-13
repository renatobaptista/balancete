// Totais do mês para os cartões da Visão geral. `entries` já vêm filtrados por mês e moeda.
//
// Sem filtro de conta, transferências entre contas próprias se cancelam, então ficam de fora.
// Com uma conta filtrada, a transferência recebida conta como entrada e a enviada como saída dessa conta.

function transferParts(entry, accountFilter) {
  if (entry.type !== "transfer" || !accountFilter) return { in: 0, out: 0 };
  return {
    in: entry.toAccount === accountFilter ? Number(entry.toAmount ?? entry.amount) : 0,
    out: entry.fromAccount === accountFilter ? Number(entry.amount) : 0,
  };
}

export function monthTotals(entries, accountFilter = "") {
  let income = 0, expense = 0, invest = 0, transferIn = 0, transferOut = 0;
  for (const e of entries) {
    if (e.type === "income") income += e.amount;
    else if (e.type === "expense") expense += e.amount;
    else if (e.type === "invest") invest += e.amount;
    else {
      const t = transferParts(e, accountFilter);
      transferIn += t.in;
      transferOut += t.out;
    }
  }
  income += transferIn;
  expense += transferOut;
  return { income, expense, invest, transferIn, transferOut, balance: income - expense - invest };
}

/** Movimento líquido por dia do mês ({ [dia]: valor }); transferências só contam com uma conta filtrada. */
export function dailyMovement(entries, accountFilter = "") {
  const byDay = {};
  for (const e of entries) {
    const day = parseInt(e.date.slice(8, 10), 10);
    let delta;
    if (e.type === "transfer") {
      const t = transferParts(e, accountFilter);
      delta = t.in - t.out;
      if (delta === 0) continue;
    } else {
      delta = e.type === "income" ? e.amount : -e.amount;
    }
    byDay[day] = (byDay[day] || 0) + delta;
  }
  return byDay;
}
