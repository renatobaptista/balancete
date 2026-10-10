// Parcelas de uma compra: achar a série e planejar a antecipação das parcelas futuras.
// Datas são strings ISO (YYYY-MM-DD), então a comparação de texto já ordena por data.

const SUFFIX = /\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)\s*$/;
const AMOUNT_TOLERANCE = 0.05; // parcelas importadas às vezes diferem em centavos (arredondamento)

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** { base, number, count } se o lançamento é uma parcela; senão null. */
export function installmentInfo(entry) {
  if (entry.installmentCount) {
    return { base: entry.description, number: entry.installmentNumber, count: entry.installmentCount };
  }
  const m = SUFFIX.exec(entry.description || "");
  if (!m) return null;
  return { base: (entry.description || "").replace(SUFFIX, "").trim(), number: Number(m[1]), count: Number(m[2]) };
}

/** Todas as parcelas da mesma compra (inclusive a própria), em ordem de número. [] se não for parcela. */
export function findSeries(entry, entries) {
  const info = installmentInfo(entry);
  if (!info) return [];

  let series;
  if (entry.installmentGroupId) {
    series = entries.filter((x) => x.installmentGroupId === entry.installmentGroupId);
  } else {
    const base = norm(info.base);
    series = entries.filter((x) => {
      if (x.installmentGroupId || x.type !== entry.type || x.account !== entry.account) return false;
      if (Math.abs(Number(x.amount) - Number(entry.amount)) > AMOUNT_TOLERANCE) return false;
      const xi = installmentInfo(x);
      return xi && xi.count === info.count && norm(xi.base) === base;
    });
  }
  return series
    .map((x) => ({ x, n: installmentInfo(x)?.number ?? 0 }))
    .sort((a, b) => a.n - b.n || (a.x.date < b.x.date ? -1 : 1))
    .map((o) => o.x);
}

const fmtDate = (iso) => iso.split("-").reverse().join("/");

/** Move todas as parcelas futuras (data > hoje) para newDate. Devolve { moves, total, error }. */
export function planAnticipation(series, newDate, today) {
  const future = series.filter((x) => x.date > today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (future.length === 0) return { moves: [], total: 0, error: "Não há parcelas futuras para antecipar." };
  if (!newDate) return { moves: [], total: 0, error: "Escolha a data." };
  if (newDate >= future[0].date) {
    return { moves: [], total: 0, error: `A data precisa ser antes de ${fmtDate(future[0].date)}, a próxima parcela.` };
  }
  const moves = future.map((x) => {
    const info = installmentInfo(x);
    return { id: x.id, number: info.number, count: info.count, from: x.date, to: newDate, amount: Number(x.amount) };
  });
  const total = Math.round(moves.reduce((s, m) => s + m.amount, 0) * 100) / 100;
  return { moves, total, error: "" };
}
