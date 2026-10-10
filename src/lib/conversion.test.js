import { describe, it, expect } from "vitest";
import { conversionSummary, feeDescription } from "./conversion";

describe("conversionSummary (R$ -> US$)", () => {
  it("computes the effective rate from the two amounts", () => {
    const s = conversionSummary({ fromCurrency: "BRL", sent: 5000, received: 880 });
    expect(s.effectiveRate).toBeCloseTo(5.6818, 4);
    expect(s.hasCommercial).toBe(false);
    expect(s.spreadCost).toBeNull();
    expect(s.totalCost).toBeNull();
  });

  it("computes the cost against the commercial rate and adds the fees (in R$)", () => {
    // 880 US$ a 5,50 = R$ 4.840 de valor "justo"; foram enviados R$ 5.000 -> R$ 160 de diferença
    const s = conversionSummary({ fromCurrency: "BRL", sent: 5000, received: 880, commercialRate: 5.5, fees: 17.5 });
    expect(s.hasCommercial).toBe(true);
    expect(s.spreadCost).toBeCloseTo(160, 2);
    expect(s.totalCost).toBeCloseTo(177.5, 2);
  });

  it("works with fees but no commercial rate: total cost is unknown", () => {
    const s = conversionSummary({ fromCurrency: "BRL", sent: 5000, received: 880, fees: 17.5 });
    expect(s.totalCost).toBeNull();
    expect(s.fees).toBe(17.5);
  });
});

describe("conversionSummary (US$ -> R$)", () => {
  it("computes rate as R$ per US$ and the cost of getting less than the commercial rate", () => {
    // enviou US$ 1.000, recebeu R$ 5.400; cotação comercial 5,50 -> "valia" R$ 5.500 -> custo R$ 100
    const s = conversionSummary({ fromCurrency: "USD", sent: 1000, received: 5400, commercialRate: 5.5 });
    expect(s.effectiveRate).toBeCloseTo(5.4, 4);
    expect(s.spreadCost).toBeCloseTo(100, 2);
  });

  it("converts fees charged in US$ to R$ using the effective rate", () => {
    const s = conversionSummary({ fromCurrency: "USD", sent: 1000, received: 5400, commercialRate: 5.5, fees: 2 });
    expect(s.totalCost).toBeCloseTo(100 + 2 * 5.4, 2);
  });
});

describe("conversionSummary validation", () => {
  it("returns null when an amount is missing or not positive", () => {
    expect(conversionSummary({ fromCurrency: "BRL", sent: 0, received: 100 })).toBeNull();
    expect(conversionSummary({ fromCurrency: "BRL", sent: 100, received: NaN })).toBeNull();
  });
  it("ignores a commercial rate that is not positive", () => {
    const s = conversionSummary({ fromCurrency: "BRL", sent: 100, received: 20, commercialRate: 0 });
    expect(s.hasCommercial).toBe(false);
  });
});

describe("feeDescription", () => {
  it("names the conversion direction", () => {
    expect(feeDescription("BRL")).toBe("Taxas da conversão (R$ → US$)");
    expect(feeDescription("USD")).toBe("Taxas da conversão (US$ → R$)");
  });
});
