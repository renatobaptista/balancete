// Reorganiza o histórico importado: a planilha do site antigo trazia só o nome da
// subcategoria (ex.: "Pedágio"); aqui ele volta para Categoria > Subcategoria
// (ex.: Transporte > Pedágio), seguindo a árvore do site antigo.

const OLD_TREE = {
  "Alimentação": ["Lanches", "Restaurante", "Supermercado"],
  "Apartamento": ["Pagamento / Prestações"],
  "Bancos": [
    "99Pay", "American Gold", "American Platinum", "BRB FLA", "C6", "C6 Carbon", "Conta Itau", "Elo Nanquim",
    "Gold MasterCard", "Inter Black", "Inter PF", "Ipiranga Master Itaucard", "Itaucard LatamPass",
    "Itaucard Pão de Açúcar", "Iti", "Light Master Santander", "Mercado Pago", "Multiplo Gold Mastercard",
    "Platinum Visa Itaucard", "Santander", "Santander SX", "Taco", "XP Conta",
  ],
  "Casa": ["Água", "Aluguel", "Casamento", "Impostos", "Internet", "Luz", "Manutenção", "NET", "Obra", "Produtos", "Telefone", "TV"],
  "Diversão": ["Bares", "Carnaval", "Cinema", "Flamengo", "Games", "Passeios", "Shows"],
  "Educação": ["Cursos", "Ingles"],
  "Empresa": ["Despesas", "Impostos", "Receita"],
  "Esportes": ["Bike", "Fitness", "Futebol", "Kart"],
  "Investimentos": ["Ações", "FIIS", "Impostos", "Rendimentos"],
  "Mãe": ["Remedios"],
  "Pessoal": ["Ajustes", "Celular", "Eletrônicos", "Estética", "Loteria", "Presentes", "Sobrinhos", "Vendas"],
  "Receita": ["IR", "Salário"],
  "Saúde": ["Dentista", "Médico", "Plano de saúde", "Remedios"],
  "Transporte": [
    "Cabify", "Combustível", "Estacionamento", "Impostos", "Lavagem", "Manutenção Carro", "Metro/Ônibus",
    "Pagamento Carro", "Particular", "Pedágio", "Seguro", "Taxi / Uber", "UBER",
  ],
  "Viagem": ["Cartao Visa Travel", "Milhas", "Viagem"],
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// nome (normalizado) -> lista de [pai, nome da subcategoria]
const LEAF_PARENTS = {};
for (const [parent, subs] of Object.entries(OLD_TREE)) {
  for (const sub of subs) (LEAF_PARENTS[norm(sub)] ||= []).push([parent, sub]);
}

// "Impostos" existe em 4 categorias do site antigo; decidido pela descrição do lançamento.
const IMPOSTOS_CASA_EXACT = new Set([
  "nota fiscal paulista", "darf", "darm", "alvara prefeitura", "cartorio", "cartorio fernanda leitao", "identidade",
]);
const IMPOSTOS_TRANSPORTE = /cartorio.*carro|ipva|multa|dpvat|seguro obrig|grt|duda|detran|cnh|carteira|gnv|inspe|vistoria|crlv|reboque|placa|alienac|derektas|phik|exame/;
const IMPOSTOS_CASA = /iptu|bombeiros|rgi casa|passagem documento casa/;
const IMPOSTOS_INVEST = /irrf|b3|investidor10|cyre3|restituicao valor receita federal/;

function impostosParent(description) {
  const d = norm(description);
  if (IMPOSTOS_CASA_EXACT.has(d)) return "Casa";
  if (IMPOSTOS_TRANSPORTE.test(d)) return "Transporte";
  if (IMPOSTOS_CASA.test(d)) return "Casa";
  if (IMPOSTOS_INVEST.test(d)) return "Investimentos";
  return null;
}

/** Destino de um lançamento, ou null se ele deve ficar como está. */
export function targetFor(entry) {
  if (entry.type === "transfer") return null;
  const c = norm(entry.category);

  if (c === "moradia") return { category: "Casa", subcategory: entry.subcategory || "" };
  if (c === "impostos") {
    const parent = impostosParent(entry.description);
    return parent ? { category: parent, subcategory: "Impostos" } : null;
  }
  if (c === "receita") return { category: "Empresa", subcategory: "Receita" };

  const parents = LEAF_PARENTS[c];
  if (!parents || parents.length !== 1) return null;
  const [category, subcategory] = parents[0];
  return { category, subcategory };
}

/** Plano completo: lançamentos que mudam + resumo agrupado por (tipo, de, para). */
export function planReorg(entries) {
  const changes = [];
  const byGroup = new Map();
  for (const entry of entries) {
    const to = targetFor(entry);
    if (!to) continue;
    if (to.category === entry.category && to.subcategory === (entry.subcategory || "")) continue;
    changes.push({ id: entry.id, type: entry.type, category: to.category, subcategory: to.subcategory });
    const key = [entry.type, entry.category, to.category, to.subcategory].join("|");
    const g = byGroup.get(key);
    if (g) g.count += 1;
    else byGroup.set(key, { type: entry.type, from: entry.category, category: to.category, subcategory: to.subcategory, count: 1 });
  }
  return { changes, groups: Array.from(byGroup.values()) };
}
