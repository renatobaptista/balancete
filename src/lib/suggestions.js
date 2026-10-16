// Sugestão de preenchimento a partir do histórico: ao digitar uma descrição já usada, copia os dados do
// lançamento mais recente com a mesma descrição (ignorando acentos, maiúsculas e o sufixo "(n/m)" das parcelas).

const normalize = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, "").replace(/\s+/g, " ").trim();

/**
 * Lançamento mais recente (não transferência) com a mesma descrição. Prefere os que já aconteceram (data <= today);
 * só usa um futuro se não houver nenhum assim. Devolve { type, category, subcategory, account, amount } ou null.
 */
export function suggestFromHistory(entries, description, today) {
  const key = normalize(description);
  if (!key) return null;
  let best = null;
  let bestPast = false;
  for (const e of entries) {
    if (e.type === "transfer" || !e.category) continue;
    if (normalize(e.description) !== key) continue;
    const past = e.date <= today;
    if (!best || (past && !bestPast) || (past === bestPast && e.date > best.date)) {
      best = e;
      bestPast = past;
    }
  }
  if (!best) return null;
  return {
    type: best.type,
    category: best.category,
    subcategory: best.subcategory || "",
    account: best.account || "",
    amount: best.amount,
  };
}
