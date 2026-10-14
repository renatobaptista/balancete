// Filtro por período (intervalo de datas) na lista de lançamentos. Datas são strings ISO (YYYY-MM-DD).
import { monthTotals } from "./monthTotals";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function daysBefore(todayISO, n) {
  const [y, m, d] = todayISO.split("-").map(Number);
  return iso(new Date(y, m - 1, d - n));
}

/** Atalhos de período: "last30" e "last90" (incluem hoje) e "year" (1º de janeiro até hoje). */
export function presetRange(kind, todayISO) {
  if (kind === "last30") return { start: daysBefore(todayISO, 29), end: todayISO };
  if (kind === "last90") return { start: daysBefore(todayISO, 89), end: todayISO };
  if (kind === "year") return { start: `${todayISO.slice(0, 4)}-01-01`, end: todayISO };
  return null;
}

/** Mensagem de erro ("" quando o intervalo é válido). */
export function validateRange(start, end) {
  if (!start || !end) return "Escolha a data inicial e a final.";
  if (start > end) return "A data inicial precisa ser antes da final.";
  return "";
}

/** Lançamentos com data entre start e end, inclusive. */
export function entriesInRange(entries, start, end) {
  return entries.filter((e) => e.date >= start && e.date <= end);
}

/** Resumo do período: quantidade e totais (com a mesma regra das transferências dos cartões do mês). */
export function periodSummary(entries, accountFilter = "") {
  return { count: entries.length, ...monthTotals(entries, accountFilter) };
}
