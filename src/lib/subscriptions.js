// Assinaturas: despesas/entradas que se repetem todo mês. Cada mês é um lançamento de verdade,
// ligado aos outros pelo mesmo installmentGroupId (sem installmentCount, para não virar "n/m"),
// e marcado com subscription: true para somar o custo.

/** Soma n meses mantendo o dia; se o dia não existir no mês de destino, usa o último dia dele. */
export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const totalMonths = (m - 1) + n;
  const year = y + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(d, new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Um lançamento por mês, a partir de startDate. `base` traz tipo, valor, categoria, conta, nome etc. */
export function buildSubscriptionEntries({ base, startDate, months, newId, groupId }) {
  const list = [];
  for (let i = 0; i < months; i++) {
    list.push({
      ...base,
      id: newId(),
      date: addMonths(startDate, i),
      installmentGroupId: groupId,
      subscription: true,
    });
  }
  return list;
}

/** "Estender": os próximos `extra` meses depois do último lançamento, copiando os valores dele. */
export function nextSubscriptionEntries(groupEntries, extra, newId) {
  if (!groupEntries.length) return [];
  const sorted = [...groupEntries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const anchorDay = Number(first.date.slice(8, 10));
  const lastMonthStart = `${last.date.slice(0, 7)}-01`;
  const out = [];
  for (let i = 1; i <= extra; i++) {
    const monthStart = addMonths(lastMonthStart, i);
    const [y, m] = monthStart.split("-").map(Number);
    const day = Math.min(anchorDay, new Date(y, m, 0).getDate());
    const { id: _id, ...template } = last;
    out.push({ ...template, id: newId(), date: `${monthStart.slice(0, 7)}-${String(day).padStart(2, "0")}` });
  }
  return out;
}

const normName = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, "").replace(/\s+/g, " ").trim();

/**
 * Custo das assinaturas entre os lançamentos recebidos (já filtrados por mês/moeda).
 * - total: despesas marcadas menos estornos (entradas marcadas como assinatura);
 * - count: assinaturas DISTINTAS (mesmo nome e mesma conta contam uma vez, mesmo com vários lançamentos no mês);
 * - yearEstimate: 12 x a cobrança mensal de cada assinatura distinta (o maior lançamento dela no mês), sem
 *   estornos, para não distorcer quando várias parcelas caem no mesmo mês.
 */
export function subscriptionStats(entries) {
  let charges = 0;
  let refunds = 0;
  const monthlyCharge = new Map(); // assinatura distinta -> maior lançamento do mês
  for (const e of entries) {
    if (e.subscription !== true) continue;
    if (e.type === "expense") {
      const amount = Number(e.amount);
      charges += amount;
      const key = `${normName(e.description)}|${e.account || ""}`;
      if (!monthlyCharge.has(key) || amount > monthlyCharge.get(key)) monthlyCharge.set(key, amount);
    } else if (e.type === "income") {
      refunds += Number(e.amount);
    }
  }
  const monthlySum = Array.from(monthlyCharge.values()).reduce((s, v) => s + v, 0);
  return {
    total: Math.round((charges - refunds) * 100) / 100,
    count: monthlyCharge.size,
    refunds: Math.round(refunds * 100) / 100,
    yearEstimate: Math.round(monthlySum * 12 * 100) / 100,
  };
}

/** Lançamento ligado a um grupo sem contagem de parcelas = ocorrência de uma assinatura. */
export function isSubscriptionGroup(entry) {
  return !!entry.installmentGroupId && !entry.installmentCount;
}

/** Última data de cada grupo de assinatura (para mostrar "estender" só no último lançamento). */
export function lastDateByGroup(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!isSubscriptionGroup(e)) continue;
    const prev = map.get(e.installmentGroupId);
    if (!prev || e.date > prev) map.set(e.installmentGroupId, e.date);
  }
  return map;
}
