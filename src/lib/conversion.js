// Conversão de moeda em uma transferência entre uma conta em R$ e uma em US$.
// Cotação sempre em R$ por US$. Custos em R$.

/**
 * fromCurrency: moeda da conta de origem ("BRL" ou "USD"); a de destino é a outra.
 * sent / received: valores debitado e creditado. commercialRate (opcional): cotação comercial do dia.
 * fees (opcional): taxas cobradas à parte, na moeda da conta de origem.
 * Devolve null se os valores não forem válidos.
 */
export function conversionSummary({ fromCurrency, sent, received, commercialRate, fees }) {
  if (!(sent > 0) || !(received > 0)) return null;
  const brl = fromCurrency === "BRL" ? sent : received;
  const usd = fromCurrency === "BRL" ? received : sent;
  const effectiveRate = brl / usd;
  const feesNum = fees > 0 ? fees : 0;
  const hasCommercial = commercialRate > 0;

  let spreadCost = null;
  let totalCost = null;
  if (hasCommercial) {
    // BRL -> USD: pagou acima do valor comercial; USD -> BRL: recebeu abaixo dele.
    spreadCost = fromCurrency === "BRL" ? brl - usd * commercialRate : usd * commercialRate - brl;
    const feesInBrl = fromCurrency === "BRL" ? feesNum : feesNum * effectiveRate;
    totalCost = spreadCost + feesInBrl;
  }
  return { effectiveRate, hasCommercial, spreadCost, totalCost, fees: feesNum };
}

export function feeDescription(fromCurrency) {
  return fromCurrency === "BRL" ? "Taxas da conversão (R$ → US$)" : "Taxas da conversão (US$ → R$)";
}
