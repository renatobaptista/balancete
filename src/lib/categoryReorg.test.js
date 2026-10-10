import { describe, it, expect } from "vitest";
import { targetFor, planReorg } from "./categoryReorg";

const e = (over) => ({ id: "x", type: "expense", category: "", subcategory: "", description: "", ...over });

describe("targetFor", () => {
  it("moves a leaf name with a single parent under that parent", () => {
    expect(targetFor(e({ category: "Pedágio" }))).toEqual({ category: "Transporte", subcategory: "Pedágio" });
    expect(targetFor(e({ category: "supermercado" }))).toEqual({ category: "Alimentação", subcategory: "Supermercado" });
  });

  it("replaces the old placeholder subcategory", () => {
    expect(targetFor(e({ category: "Kart", subcategory: "Geral" }))).toEqual({ category: "Esportes", subcategory: "Kart" });
    expect(targetFor(e({ category: "Viagem", subcategory: "Geral" }))).toEqual({ category: "Viagem", subcategory: "Viagem" });
  });

  it("maps Moradia to Casa keeping the subcategory", () => {
    expect(targetFor(e({ category: "Moradia", subcategory: "Luz" }))).toEqual({ category: "Casa", subcategory: "Luz" });
  });

  it("sends 'Receita' to Empresa > Receita", () => {
    expect(targetFor(e({ type: "income", category: "Receita" }))).toEqual({ category: "Empresa", subcategory: "Receita" });
  });

  it("leaves real top-level categories, Sem Categoria and transfers alone", () => {
    expect(targetFor(e({ category: "Alimentação", subcategory: "Restaurante" }))).toBeNull();
    expect(targetFor(e({ category: "Sem Categoria" }))).toBeNull();
    expect(targetFor(e({ type: "transfer", category: "Pedágio" }))).toBeNull();
  });

  it("splits Impostos by description", () => {
    const imp = (description, type = "expense") => targetFor(e({ type, category: "Impostos", description }));
    expect(imp("IPVA 2025")).toEqual({ category: "Transporte", subcategory: "Impostos" });
    expect(imp("Multa RA50358208")).toEqual({ category: "Transporte", subcategory: "Impostos" });
    expect(imp("IPTU Cota Unica")).toEqual({ category: "Casa", subcategory: "Impostos" });
    expect(imp("Taxa Bombeiros")).toEqual({ category: "Casa", subcategory: "Impostos" });
    expect(imp("DARM")).toEqual({ category: "Casa", subcategory: "Impostos" });
    expect(imp("Nota Fiscal Paulista", "income")).toEqual({ category: "Casa", subcategory: "Impostos" });
    expect(imp("Cartorio")).toEqual({ category: "Casa", subcategory: "Impostos" });
    expect(imp("Cartorio Reconhecimento de Firma Carro")).toEqual({ category: "Transporte", subcategory: "Impostos" });
    expect(imp("IRRF Tesouro Direto")).toEqual({ category: "Investimentos", subcategory: "Impostos" });
    expect(imp("Restituição Valor Receita Federal", "income")).toEqual({ category: "Investimentos", subcategory: "Impostos" });
  });

  it("leaves an Impostos entry alone when no rule matches", () => {
    expect(targetFor(e({ category: "Impostos", description: "Algo novo" }))).toBeNull();
  });
});

describe("planReorg", () => {
  it("lists only the entries that change and groups them by destination", () => {
    const entries = [
      e({ id: "1", category: "Pedágio" }),
      e({ id: "2", category: "Pedágio" }),
      e({ id: "3", category: "Alimentação", subcategory: "Restaurante" }),
      e({ id: "4", category: "Moradia", subcategory: "Luz" }),
    ];
    const plan = planReorg(entries);
    expect(plan.changes.map((c) => c.id)).toEqual(["1", "2", "4"]);
    expect(plan.groups).toEqual([
      { type: "expense", from: "Pedágio", category: "Transporte", subcategory: "Pedágio", count: 2 },
      { type: "expense", from: "Moradia", category: "Casa", subcategory: "Luz", count: 1 },
    ]);
  });

  it("skips entries that already have the target values", () => {
    const entries = [e({ id: "1", category: "Transporte", subcategory: "Pedágio" })];
    expect(planReorg(entries).changes).toEqual([]);
  });
});
